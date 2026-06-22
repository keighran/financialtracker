import os
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
import stripe

from app.db import get_session
from app.auth.clerk import get_current_user
from app.models.models import User, Subscription, SubscriptionTier, SubscriptionStatus

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/billing", tags=["billing"])

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY", "")

# Mock Stripe Price IDs (in production these would be set via env variables)
PRO_PRICE_ID = os.environ.get("STRIPE_PRO_PRICE_ID", "price_mock_pro")
ENTERPRISE_PRICE_ID = os.environ.get("STRIPE_ENTERPRISE_PRICE_ID", "price_mock_enterprise")

@router.post("/checkout")
async def create_checkout_session(
    tier: SubscriptionTier,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    if tier == SubscriptionTier.FREE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot purchase Free tier"
        )
        
    # Get user subscription
    sub = db.exec(select(Subscription).where(Subscription.user_id == current_user.id)).first()
    if not sub:
        sub = Subscription(user_id=current_user.id, tier=SubscriptionTier.FREE, status=SubscriptionStatus.ACTIVE)
        db.add(sub)
        db.commit()
        db.refresh(sub)
        
    price_id = PRO_PRICE_ID if tier == SubscriptionTier.PRO else ENTERPRISE_PRICE_ID
    
    # Check if we have Stripe API key
    if not stripe.api_key or stripe.api_key.startswith("mock") or not os.environ.get("STRIPE_SECRET_KEY"):
        # Local development / bypass mode
        # Simulate webhook call immediately or direct update for testing
        sub.tier = tier
        sub.status = SubscriptionStatus.ACTIVE
        db.add(sub)
        db.commit()
        return {"url": "/billing?success=true&mock=true"}
        
    success_url = os.environ.get("APP_URL", "http://localhost:3000") + "/billing?success=true"
    cancel_url = os.environ.get("APP_URL", "http://localhost:3000") + "/billing?canceled=true"
    
    try:
        checkout_session = stripe.checkout.Session.create(
            line_items=[
                {
                    'price': price_id,
                    'quantity': 1,
                },
            ],
            mode='subscription',
            success_url=success_url,
            cancel_url=cancel_url,
            client_reference_id=str(current_user.id),
            customer=sub.stripe_customer_id if sub.stripe_customer_id else None,
            metadata={
                "tier": tier.value
            }
        )
        return {"url": checkout_session.url}
    except Exception as e:
        logger.error(f"Failed to create Stripe checkout session: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Stripe error: {str(e)}"
        )

@router.post("/portal")
async def create_portal_session(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    sub = db.exec(select(Subscription).where(Subscription.user_id == current_user.id)).first()
    if not sub or not sub.stripe_customer_id:
        # If no stripe customer id, redirect to settings/billing directly or return a mock portal link
        if not stripe.api_key or stripe.api_key.startswith("mock") or not os.environ.get("STRIPE_SECRET_KEY"):
            return {"url": "/billing?mock_portal=true"}
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active billing record found. Upgrade first."
        )
        
    if not stripe.api_key or stripe.api_key.startswith("mock") or not os.environ.get("STRIPE_SECRET_KEY"):
        return {"url": "/billing?mock_portal=true"}
        
    return_url = os.environ.get("APP_URL", "http://localhost:3000") + "/billing"
    
    try:
        portal_session = stripe.billingportal.Session.create(
            customer=sub.stripe_customer_id,
            return_url=return_url,
        )
        return {"url": portal_session.url}
    except Exception as e:
        logger.error(f"Failed to create Stripe portal session: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Stripe error: {str(e)}"
        )
