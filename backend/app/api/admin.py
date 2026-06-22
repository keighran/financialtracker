import logging
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlmodel import Session, select

from app.db import get_session
from app.auth.clerk import get_current_user
from app.models.models import User, Subscription, SubscriptionTier, SubscriptionStatus, ExternalApiConfig

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin", tags=["admin"])

def get_superadmin_user(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_superadmin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Superadmin access required"
        )
    return current_user

# --- USER MANAGEMENT ENDPOINTS ---

@router.get("/users")
async def get_users(
    search: Optional[str] = Query(None, description="Search by name or email"),
    db: Session = Depends(get_session),
    admin: User = Depends(get_superadmin_user)
):
    statement = select(User)
    if search:
        statement = statement.where(
            (User.email.contains(search)) | (User.display_name.contains(search))
        )
    users = db.exec(statement).all()
    
    # Enrich users with subscription status
    result = []
    for u in users:
        sub = db.exec(select(Subscription).where(Subscription.user_id == u.id)).first()
        result.append({
            "id": u.id,
            "email": u.email,
            "display_name": u.display_name,
            "clerk_user_id": u.clerk_user_id,
            "is_superadmin": u.is_superadmin,
            "has_completed_onboarding": u.has_completed_onboarding,
            "is_active": u.is_active,
            "created_at": u.created_at,
            "subscription": {
                "tier": sub.tier.value if sub else "FREE",
                "status": sub.status.value if sub else "ACTIVE",
                "current_period_end": sub.current_period_end if sub else None
            }
        })
    return result

@router.post("/users", status_code=status.HTTP_201_CREATED)
async def create_user(
    email: str,
    display_name: str,
    tier: SubscriptionTier = SubscriptionTier.FREE,
    is_superadmin: bool = False,
    db: Session = Depends(get_session),
    admin: User = Depends(get_superadmin_user)
):
    # Verify email uniqueness
    existing_user = db.exec(select(User).where(User.email == email)).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
        
    user = User(
        email=email,
        display_name=display_name,
        is_superadmin=is_superadmin,
        has_completed_onboarding=False,
        clerk_user_id=f"manual_{int(datetime.utcnow().timestamp())}"
    )
    db.add(user)
    db.flush()
    
    sub = Subscription(
        user_id=user.id,
        tier=tier,
        status=SubscriptionStatus.ACTIVE
    )
    db.add(sub)
    db.commit()
    db.refresh(user)
    return {"message": "User created successfully", "user_id": user.id}

@router.put("/users/{user_id}")
async def update_user(
    user_id: int,
    display_name: Optional[str] = None,
    is_superadmin: Optional[bool] = None,
    is_active: Optional[bool] = None,
    tier: Optional[SubscriptionTier] = None,
    db: Session = Depends(get_session),
    admin: User = Depends(get_superadmin_user)
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        
    if display_name is not None:
        user.display_name = display_name
    if is_superadmin is not None:
        # Prevent self demotion
        if user.id == admin.id and not is_superadmin:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Superadmins cannot demote themselves")
        user.is_superadmin = is_superadmin
    if is_active is not None:
        if user.id == admin.id and not is_active:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Superadmins cannot disable themselves")
        user.is_active = is_active
        
    db.add(user)
    
    if tier is not None:
        sub = db.exec(select(Subscription).where(Subscription.user_id == user.id)).first()
        if not sub:
            sub = Subscription(user_id=user.id, tier=tier, status=SubscriptionStatus.ACTIVE)
        else:
            sub.tier = tier
        db.add(sub)
        
    db.commit()
    return {"message": "User updated successfully"}

@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    db: Session = Depends(get_session),
    admin: User = Depends(get_superadmin_user)
):
    if user_id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Superadmins cannot delete themselves"
        )
        
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        
    db.delete(user)
    db.commit()
    return {"message": "User deleted successfully"}

# --- EXTERNAL API CONFIGURATION ENDPOINTS ---

@router.get("/api-configs")
async def get_api_configs(
    db: Session = Depends(get_session),
    admin: User = Depends(get_superadmin_user)
):
    configs = db.exec(select(ExternalApiConfig)).all()
    # Mask API keys for safety
    result = []
    for c in configs:
        masked_key = c.api_key[:4] + "*" * 12 if len(c.api_key) > 4 else "****"
        result.append({
            "id": c.id,
            "provider_name": c.provider_name,
            "api_url": c.api_url,
            "api_key_masked": masked_key,
            "is_active": c.is_active,
            "description": c.description,
            "updated_at": c.updated_at
        })
    return result

@router.post("/api-configs")
async def create_or_update_api_config(
    provider_name: str,
    api_url: str,
    api_key: str,
    is_active: bool = True,
    description: Optional[str] = None,
    db: Session = Depends(get_session),
    admin: User = Depends(get_superadmin_user)
):
    config = db.exec(select(ExternalApiConfig).where(ExternalApiConfig.provider_name == provider_name)).first()
    if config:
        config.api_url = api_url
        if api_key and api_key != "********":  # Avoid updating if masked placeholder was submitted
            config.api_key = api_key
        config.is_active = is_active
        config.description = description
        config.updated_at = datetime.utcnow()
    else:
        config = ExternalApiConfig(
            provider_name=provider_name,
            api_url=api_url,
            api_key=api_key,
            is_active=is_active,
            description=description,
            updated_at=datetime.utcnow()
        )
    db.add(config)
    db.commit()
    return {"message": "API configuration saved successfully"}

@router.delete("/api-configs/{config_id}")
async def delete_api_config(
    config_id: int,
    db: Session = Depends(get_session),
    admin: User = Depends(get_superadmin_user)
):
    config = db.get(ExternalApiConfig, config_id)
    if not config:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API config not found")
    db.delete(config)
    db.commit()
    return {"message": "API configuration deleted successfully"}
