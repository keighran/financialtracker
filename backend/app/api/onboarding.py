from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from decimal import Decimal
from typing import Optional
from datetime import datetime
from pydantic import BaseModel

from app.db import get_session
from app.auth.clerk import get_current_user
from app.models.models import User, UserSettings, PayFrequency, CGTMethod

router = APIRouter(prefix="/onboarding", tags=["onboarding"])


@router.get("/status")
async def onboarding_status(
    current_user: User = Depends(get_current_user),
):
    """Lightweight check used by the frontend to gate first-time users into the
    onboarding wizard."""
    return {
        "has_completed_onboarding": current_user.has_completed_onboarding,
        "is_superadmin": current_user.is_superadmin,
    }


class OnboardingRequest(BaseModel):
    employment_salary: Decimal
    pay_frequency: PayFrequency
    fire_target_annual_spend: Decimal
    fire_safe_withdrawal_rate: Decimal = Decimal("0.04")
    fire_current_age: Optional[int] = None
    fire_target_retire_age: Optional[int] = None
    marginal_tax_rate: Optional[Decimal] = None

@router.post("/complete")
async def complete_onboarding(
    data: OnboardingRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    # Set user flag
    current_user.has_completed_onboarding = True
    db.add(current_user)
    
    # Get or create settings
    settings = db.exec(select(UserSettings).where(UserSettings.user_id == current_user.id)).first()
    if not settings:
        # Calculate marginal tax rate based on Stage 3 Australian tax cuts if not specified
        # Stage 3 Brackets for FY 2024-2025 onwards:
        # 0 to 18,200: 0%
        # 18,201 to 45,000: 16%
        # 45,001 to 135,000: 30%
        # 135,001 to 190,000: 37%
        # 190,001+: 45%
        marginal_tax = data.marginal_tax_rate
        if marginal_tax is None:
            salary = data.employment_salary
            if salary <= 18200:
                marginal_tax = Decimal("0.0")
            elif salary <= 45000:
                marginal_tax = Decimal("0.16")
            elif salary <= 135000:
                marginal_tax = Decimal("0.30")
            elif salary <= 190000:
                marginal_tax = Decimal("0.37")
            else:
                marginal_tax = Decimal("0.45")

        settings = UserSettings(
            user_id=current_user.id,
            employment_salary=data.employment_salary,
            pay_frequency=data.pay_frequency,
            fire_target_annual_spend=data.fire_target_annual_spend,
            fire_safe_withdrawal_rate=data.fire_safe_withdrawal_rate,
            fire_current_age=data.fire_current_age,
            fire_target_retire_age=data.fire_target_retire_age,
            marginal_tax_rate=marginal_tax,
            updated_at=datetime.utcnow()
        )
    else:
        settings.employment_salary = data.employment_salary
        settings.pay_frequency = data.pay_frequency
        settings.fire_target_annual_spend = data.fire_target_annual_spend
        settings.fire_safe_withdrawal_rate = data.fire_safe_withdrawal_rate
        if data.fire_current_age is not None:
            settings.fire_current_age = data.fire_current_age
        if data.fire_target_retire_age is not None:
            settings.fire_target_retire_age = data.fire_target_retire_age
        if data.marginal_tax_rate is not None:
            settings.marginal_tax_rate = data.marginal_tax_rate
        settings.updated_at = datetime.utcnow()
        
    db.add(settings)
    db.commit()
    
    return {"message": "Onboarding completed successfully", "has_completed_onboarding": True}
