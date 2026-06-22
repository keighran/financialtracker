import os
import logging
import json
from fastapi import APIRouter, Request, Depends, HTTPException, status
from sqlmodel import Session, select
from svix.webhooks import Webhook, WebhookVerificationError
import stripe

from app.db import get_session
from app.models.models import User, Subscription, SubscriptionTier, SubscriptionStatus

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/webhooks", tags=["webhooks"])

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY", "")

@router.post("/clerk")
async def clerk_webhook(request: Request, db: Session = Depends(get_session)):
    headers = request.headers
    payload = await request.body()
    
    svix_id = headers.get("svix-id")
    svix_timestamp = headers.get("svix-timestamp")
    svix_signature = headers.get("svix-signature")
    
    if not svix_id or not svix_timestamp or not svix_signature:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing svix headers"
        )
        
    secret = os.environ.get("CLERK_WEBHOOK_SECRET", "")
    
    # Verify SVIX signature if secret is provided, otherwise parse directly in development
    try:
        if secret:
            wh = Webhook(secret)
            msg = wh.verify(payload, {
                "svix-id": svix_id,
                "svix-timestamp": svix_timestamp,
                "svix-signature": svix_signature
            })
        else:
            msg = json.loads(payload.decode("utf-8"))
    except WebhookVerificationError as err:
        logger.error(f"SVIX Webhook verification failed: {err}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid webhook signature: {err}"
        )
    except Exception as exc:
        logger.error(f"Error parsing Clerk webhook: {exc}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to parse payload: {exc}"
        )
        
    event_type = msg.get("type")
    data = msg.get("data", {})
    
    if event_type == "user.created":
        clerk_user_id = data.get("id")
        email_addresses = data.get("email_addresses", [])
        primary_email = ""
        for e in email_addresses:
            if e.get("id") == data.get("primary_email_address_id"):
                primary_email = e.get("email_address", "")
                break
        if not primary_email and email_addresses:
            primary_email = email_addresses[0].get("email_address", "")
            
        first_name = data.get("first_name") or ""
        last_name = data.get("last_name") or ""
        display_name = f"{first_name} {last_name}".strip() or primary_email.split("@")[0]
        
        # Check if user already exists
        user = db.exec(select(User).where(User.clerk_user_id == clerk_user_id)).first()
        if not user:
            user = User(
                clerk_user_id=clerk_user_id,
                email=primary_email,
                display_name=display_name,
                has_completed_onboarding=False,
                is_superadmin=False
            )
            db.add(user)
            db.flush()
            
            # Create sub
            sub = Subscription(
                user_id=user.id,
                tier=SubscriptionTier.FREE,
                status=SubscriptionStatus.ACTIVE
            )
            db.add(sub)
            db.commit()
            logger.info(f"Synced Clerk user {clerk_user_id} to database as user ID {user.id}")
            
    elif event_type == "user.deleted":
        clerk_user_id = data.get("id")
        user = db.exec(select(User).where(User.clerk_user_id == clerk_user_id)).first()
        if user:
            db.delete(user)
            db.commit()
            logger.info(f"Deleted user {clerk_user_id} from database")
            
    return {"status": "success"}

@router.post("/stripe")
async def stripe_webhook(request: Request, db: Session = Depends(get_session)):
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")
    webhook_secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
    
    event = None
    try:
        if webhook_secret and sig_header:
            event = stripe.Webhook.construct_event(payload, sig_header, webhook_secret)
        else:
            data = json.loads(payload.decode("utf-8"))
            event = stripe.Event.construct_from(data, stripe.api_key)
    except Exception as exc:
        logger.error(f"Error validating Stripe webhook: {exc}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc)
        )
        
    event_type = event.get("type")
    
    if event_type == "checkout.session.completed":
        session = event["data"]["object"]
        client_reference_id = session.get("client_reference_id")
        stripe_customer_id = session.get("customer")
        stripe_subscription_id = session.get("subscription")
        
        tier = SubscriptionTier.PRO
        if session.get("metadata") and "tier" in session["metadata"]:
            try:
                tier = SubscriptionTier(session["metadata"]["tier"])
            except ValueError:
                pass
                
        if client_reference_id:
            try:
                user_id = int(client_reference_id)
                sub = db.exec(select(Subscription).where(Subscription.user_id == user_id)).first()
                if sub:
                    sub.stripe_customer_id = stripe_customer_id
                    sub.stripe_subscription_id = stripe_subscription_id
                    sub.tier = tier
                    sub.status = SubscriptionStatus.ACTIVE
                    db.add(sub)
                    db.commit()
                    logger.info(f"Updated subscription to {tier} for user {user_id}")
            except Exception as e:
                logger.error(f"Failed to process client_reference_id {client_reference_id}: {e}")
                
    elif event_type in ("customer.subscription.updated", "customer.subscription.deleted"):
        subscription = event["data"]["object"]
        stripe_sub_id = subscription.get("id")
        stripe_status = subscription.get("status")
        
        sub_status = SubscriptionStatus.ACTIVE
        if stripe_status == "canceled":
            sub_status = SubscriptionStatus.CANCELED
        elif stripe_status == "past_due":
            sub_status = SubscriptionStatus.PAST_DUE
        elif stripe_status == "incomplete":
            sub_status = SubscriptionStatus.INCOMPLETE
        elif stripe_status == "trialing":
            sub_status = SubscriptionStatus.TRIALING
            
        sub = db.exec(select(Subscription).where(Subscription.stripe_subscription_id == stripe_sub_id)).first()
        if sub:
            sub.status = sub_status
            if event_type == "customer.subscription.deleted":
                sub.tier = SubscriptionTier.FREE
            db.add(sub)
            db.commit()
            logger.info(f"Subscription {stripe_sub_id} status updated to {sub_status}")
            
    return {"status": "success"}
