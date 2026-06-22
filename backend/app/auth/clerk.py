from __future__ import annotations
import os
import time
import logging
from typing import Any

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import jwt
from sqlmodel import Session, select

from app.db import get_session
from app.models.models import Subscription, SubscriptionStatus, SubscriptionTier, User

logger = logging.getLogger(__name__)

_bearer = HTTPBearer(auto_error=True)

_jwks_cache: dict[str, Any] = {}
_jwks_fetched_at: float = 0.0
_JWKS_TTL = 3600


def _get_signing_key() -> str | dict[str, Any]:
    """Return the RSA public key string if configured, else the cached JWKS dict."""
    pem = os.environ.get("CLERK_JWT_PUBLIC_KEY", "").strip()
    if pem:
        return pem

    pem_file = os.environ.get("CLERK_JWT_PUBLIC_KEY_FILE", "").strip()
    if pem_file:
        try:
            with open(pem_file) as f:
                return f.read().strip()
        except OSError as exc:
            logger.error("Failed to read CLERK_JWT_PUBLIC_KEY_FILE %s: %s", pem_file, exc)
            raise HTTPException(
                status.HTTP_500_INTERNAL_SERVER_ERROR,
                "JWT public key file could not be read",
            )

    global _jwks_cache, _jwks_fetched_at
    now = time.time()
    if _jwks_cache and (now - _jwks_fetched_at) < _JWKS_TTL:
        return _jwks_cache

    frontend_api = os.environ.get("CLERK_FRONTEND_API_URL", "")
    if not frontend_api:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "Neither CLERK_JWT_PUBLIC_KEY nor CLERK_FRONTEND_API_URL is configured",
        )

    jwks_url = f"{frontend_api.rstrip('/')}/.well-known/jwks.json"
    try:
        resp = httpx.get(jwks_url, timeout=5)
        resp.raise_for_status()
        _jwks_cache = resp.json()
        _jwks_fetched_at = now
        return _jwks_cache
    except Exception as exc:
        logger.error("Failed to fetch Clerk JWKS from %s: %s", jwks_url, exc)
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Authentication service unavailable",
        )


def _verify_clerk_token(token: str) -> dict[str, Any]:
    key = _get_signing_key()
    try:
        # In PyJWT, if key is JWKS (dict), we need to fetch the correct key using PyJWKClient,
        # but to keep it simple, if CLERK_JWT_PUBLIC_KEY is a PEM, we decode with RS256.
        # If it's a JWKS, we can decode using PyJWT's PyJWKClient.
        # Let's write a robust decoder that handles both PEM and JWKS (dict)
        if isinstance(key, dict):
            # Parse JWK using PyJWT's PyJWK
            # In PyJWT, we can decode with algorithms=["RS256"] if we pass the public key
            # Let's use jwt.PyJWKClient / PyJWK to find the matching signing key
            # Or fetch public key from JWKS dict
            jwks = key
            # Find the kid from token header
            unverified_header = jwt.get_unverified_header(token)
            kid = unverified_header.get("kid")
            
            # Find the matching key
            matching_key = None
            for jwk_dict in jwks.get("keys", []):
                if jwk_dict.get("kid") == kid:
                    matching_key = jwt.algorithms.RSAAlgorithm.from_jwk(json.dumps(jwk_dict))
                    break
                    
            if not matching_key:
                raise jwt.InvalidTokenError("No matching key in JWKS found")
            
            payload = jwt.decode(
                token,
                matching_key,
                algorithms=["RS256"],
                options={"verify_aud": False},
            )
        else:
            payload = jwt.decode(
                token,
                key,
                algorithms=["RS256"],
                options={"verify_aud": False},
            )
        return payload
    except Exception as exc:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        )



def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    db: Session = Depends(get_session),
) -> User:
    payload = _verify_clerk_token(credentials.credentials)
    clerk_user_id: str = payload.get("sub", "")
    if not clerk_user_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token missing sub claim")

    user = db.exec(select(User).where(User.clerk_user_id == clerk_user_id)).first()

    if user is None:
        email = payload.get("email", "") or payload.get("primary_email_address", "")
        display_name = payload.get("name", "") or email.split("@")[0] if email else "New User"
        user = User(
            clerk_user_id=clerk_user_id,
            email=email,
            display_name=display_name,
            has_completed_onboarding=False,
            is_superadmin=False,
        )
        db.add(user)
        db.flush()

        sub = Subscription(user_id=user.id, tier=SubscriptionTier.FREE, status=SubscriptionStatus.ACTIVE)
        db.add(sub)
        db.commit()
        db.refresh(user)

    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account is disabled")

    return user
