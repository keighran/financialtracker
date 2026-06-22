from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from decimal import Decimal
from datetime import datetime
from typing import List

from app.db import get_session
from app.auth.clerk import get_current_user
from app.models.models import User, UserSettings, MonthlySnapshot
from app.services.aggregation import calculate_current_net_worth

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

@router.get("/net-worth")
async def get_dashboard_net_worth(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    settings = db.exec(select(UserSettings).where(UserSettings.user_id == current_user.id)).first()
    net_worth_details = calculate_current_net_worth(current_user.id, db)
    
    return {
        "summary": net_worth_details,
        "settings": {
            "fire_target_annual_spend": settings.fire_target_annual_spend if settings else Decimal("0.00"),
            "fire_safe_withdrawal_rate": settings.fire_safe_withdrawal_rate if settings else Decimal("0.04"),
            "marginal_tax_rate": settings.marginal_tax_rate if settings else Decimal("0.325"),
            "employment_salary": settings.employment_salary if settings else Decimal("0.00")
        }
    }

@router.get("/history", response_model=List[MonthlySnapshot])
async def get_net_worth_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    statement = select(MonthlySnapshot).where(MonthlySnapshot.user_id == current_user.id).order_by(MonthlySnapshot.snapshot_date.asc())
    return db.exec(statement).all()

@router.post("/snapshot", response_model=MonthlySnapshot, status_code=status.HTTP_201_CREATED)
async def create_net_worth_snapshot(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    details = calculate_current_net_worth(current_user.id, db)
    
    # Check if a snapshot for today already exists
    today = datetime.utcnow().date()
    # Normalize to start of day datetime
    snapshot_date = datetime(today.year, today.month, today.day)
    
    existing = db.exec(
        select(MonthlySnapshot)
        .where(
            MonthlySnapshot.user_id == current_user.id,
            MonthlySnapshot.snapshot_date == snapshot_date
        )
    ).first()
    
    if existing:
        # Update existing
        existing.cash_value = details["cash"]
        existing.super_value = details["superannuation"]
        existing.etf_value = details["equities"]
        existing.crypto_value = details["crypto"]
        existing.property_current_value = details["property"]
        existing.property_mortgage_balance = details["mortgages"]
        existing.other_assets_value = details["other_assets"]
        existing.liabilities_balance = details["liabilities"]
        existing.total_assets = details["total_assets"]
        existing.total_liabilities = details["total_debts"]
        existing.net_worth = details["net_worth"]
        existing.created_at = datetime.utcnow()
        db.add(existing)
        db.commit()
        db.refresh(existing)
        return existing
        
    snapshot = MonthlySnapshot(
        user_id=current_user.id,
        snapshot_date=snapshot_date,
        cash_value=details["cash"],
        super_value=details["superannuation"],
        etf_value=details["equities"],
        crypto_value=details["crypto"],
        property_current_value=details["property"],
        property_mortgage_balance=details["mortgages"],
        other_assets_value=details["other_assets"],
        liabilities_balance=details["liabilities"],
        total_assets=details["total_assets"],
        total_liabilities=details["total_debts"],
        net_worth=details["net_worth"],
        created_at=datetime.utcnow()
    )
    db.add(snapshot)
    db.commit()
    db.refresh(snapshot)
    return snapshot
