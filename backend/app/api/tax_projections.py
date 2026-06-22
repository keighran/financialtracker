from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from decimal import Decimal
from typing import Optional, List
from datetime import datetime

from app.db import get_session
from app.auth.clerk import get_current_user
from app.models.models import (
    User, UserSettings, Transaction, TransactionType, Account,
    AccountType, Asset, PayFrequency, BudgetItem, SideIncomeLog
)
from app.services.tax_fire import (
    calculate_cgt_fifo, calculate_dividend_tax, calculate_negative_gearing
)
from app.services.aggregation import calculate_current_net_worth
from app.services.projections import build_fire_projection

router = APIRouter(prefix="/tax-projections", tags=["tax-projections"])

@router.get("/cgt")
async def get_cgt_calculation(
    ticker: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    accounts = db.exec(select(Account).where(Account.user_id == current_user.id)).all()
    account_ids = [a.id for a in accounts]

    if not account_ids:
        return {"total_gain": 0.0, "total_discounted_gain": 0.0, "remaining_holdings": []}

    # Resolve the asset by ticker first, then pull only its transactions at the
    # DB level (avoids loading every transaction and lazy-loading each asset).
    asset = db.exec(select(Asset).where(Asset.ticker == ticker)).first()
    if not asset:
        return {"total_gain": 0.0, "total_discounted_gain": 0.0, "remaining_holdings": []}

    filtered_txns = db.exec(
        select(Transaction).where(
            Transaction.account_id.in_(account_ids),
            Transaction.asset_id == asset.id,
        )
    ).all()

    super_account_ids = {a.id for a in accounts if a.type == AccountType.SUPER}
    is_super = any(t.account_id in super_account_ids for t in filtered_txns)

    cgt_result = calculate_cgt_fifo(filtered_txns, is_super=is_super)
    return cgt_result

@router.get("/dividends")
async def get_dividends_tax_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    accounts = db.exec(select(Account).where(Account.user_id == current_user.id)).all()
    account_ids = [a.id for a in accounts]
    
    if not account_ids:
        return []
        
    div_txns = db.exec(
        select(Transaction)
        .where(
            Transaction.account_id.in_(account_ids),
            Transaction.type == TransactionType.DIVIDEND
        )
    ).all()
    
    settings = db.exec(select(UserSettings).where(UserSettings.user_id == current_user.id)).first()
    marginal_tax_rate = settings.marginal_tax_rate if settings else Decimal("0.325")

    # Batch-load referenced assets in one query (avoids lazy-loading per dividend).
    asset_ids = {t.asset_id for t in div_txns if t.asset_id is not None}
    assets_by_id = {}
    if asset_ids:
        assets_by_id = {
            a.id: a
            for a in db.exec(select(Asset).where(Asset.id.in_(asset_ids))).all()
        }

    summary = []
    for t in div_txns:
        franking = t.franking_percentage or Decimal("0.00")
        calc = calculate_dividend_tax(t.amount, franking, marginal_tax_rate)
        asset = assets_by_id.get(t.asset_id)
        summary.append({
            "id": t.id,
            "ticker": asset.ticker if asset else "Unknown",
            "date": t.date,
            "net_amount": t.amount,
            "franking_credit": calc["franking_credit"],
            "grossed_up_dividend": calc["grossed_up_dividend"],
            "tax_payable": calc["tax_payable"],
            "net_tax_payable": calc["net_tax_payable"],
            "after_tax_income": calc["after_tax_income"]
        })
    return summary

@router.get("/gearing")
async def get_gearing_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    properties = db.exec(
        select(Account).where(
            Account.user_id == current_user.id,
            Account.type == AccountType.PROPERTY
        )
    ).all()
    
    settings = db.exec(select(UserSettings).where(UserSettings.user_id == current_user.id)).first()
    marginal_tax_rate = settings.marginal_tax_rate if settings else Decimal("0.325")
    
    summary = []
    for p in properties:
        # Calculate monthly interest on mortgage balance
        monthly_interest = p.current_loan_balance * (p.annual_interest_rate / Decimal("12.0")) if p.current_loan_balance else Decimal("0.00")
        
        # Calculate income / expenses from transactions
        txns = db.exec(select(Transaction).where(Transaction.account_id == p.id)).all()
        rent_income = sum(t.amount for t in txns if t.type == TransactionType.INCOME)
        expenses = sum(t.amount for t in txns if t.type == TransactionType.EXPENSE)
        
        calc = calculate_negative_gearing(rent_income, expenses, monthly_interest, marginal_tax_rate)
        summary.append({
            "property_name": p.name,
            "rental_income": rent_income,
            "expenses": expenses,
            "mortgage_interest": monthly_interest,
            "net_rental_position": calc["net_rental_position"],
            "is_negatively_geared": calc["is_negatively_geared"],
            "tax_savings": calc["tax_savings"],
            "after_tax_impact": calc["after_tax_impact"]
        })
    return summary

@router.get("/fire")
async def get_fire_projection(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    settings = db.exec(select(UserSettings).where(UserSettings.user_id == current_user.id)).first()
    if not settings:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User settings not found. Complete onboarding first."
        )
        
    net_worth_details = calculate_current_net_worth(current_user.id, db)
    current_nw = net_worth_details["net_worth"]

    return build_fire_projection(current_user.id, db, current_nw)
