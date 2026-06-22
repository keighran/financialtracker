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
    calculate_cgt_fifo, calculate_dividend_tax, calculate_negative_gearing, project_fire_timeline
)
from app.services.aggregation import calculate_current_net_worth

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
        
    txns = db.exec(
        select(Transaction)
        .where(Transaction.account_id.in_(account_ids))
    ).all()
    
    # Filter for ticker and sort
    filtered_txns = []
    for t in txns:
        if t.asset and t.asset.ticker == ticker:
            filtered_txns.append(t)
            
    is_super = False
    super_accounts = [a.id for a in accounts if a.type == AccountType.SUPER]
    for t in filtered_txns:
        if t.account_id in super_accounts:
            is_super = True
            break
            
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
    
    summary = []
    for t in div_txns:
        franking = t.franking_percentage or Decimal("0.00")
        calc = calculate_dividend_tax(t.amount, franking, marginal_tax_rate)
        summary.append({
            "id": t.id,
            "ticker": t.asset.ticker if t.asset else "Unknown",
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
    
    # Calculate monthly income
    freq = settings.pay_frequency
    monthly_salary = Decimal("0.00")
    if freq == PayFrequency.WEEKLY:
        monthly_salary = settings.employment_salary * Decimal("52") / Decimal("12")
    elif freq == PayFrequency.FORTNIGHTLY:
        monthly_salary = settings.employment_salary * Decimal("26") / Decimal("12")
    elif freq == PayFrequency.MONTHLY:
        monthly_salary = settings.employment_salary
    else:
        monthly_salary = settings.employment_salary * Decimal("26") / Decimal("12")
        
    # Calculate savings from budget
    budget_items = db.exec(select(BudgetItem).where(BudgetItem.user_id == current_user.id)).all()
    monthly_budget_spend = sum(i.monthly_amount for i in budget_items if i.category.lower() == "expenses")
    
    # Side income logs average
    side_logs = db.exec(select(SideIncomeLog).where(SideIncomeLog.user_id == current_user.id)).all()
    avg_side_income = Decimal("0.00")
    if side_logs:
        total_side = sum(l.side_income_1 + l.rental_income_1 for l in side_logs)
        avg_side_income = total_side / len(side_logs)
        
    total_monthly_savings = (monthly_salary - monthly_budget_spend) + avg_side_income
    if total_monthly_savings < 0:
        total_monthly_savings = Decimal("0.00")
        
    annual_savings = total_monthly_savings * Decimal("12")
    
    # Compound parameters
    return_rate = settings.fire_investment_return_rate
    inflation = settings.fire_inflation_rate
    target_spend = settings.fire_target_annual_spend
    swr = settings.fire_safe_withdrawal_rate
    
    proj = project_fire_timeline(
        current_net_worth=current_nw,
        annual_savings=annual_savings,
        annual_return_rate=return_rate,
        inflation_rate=inflation,
        target_annual_spend=target_spend,
        safe_withdrawal_rate=swr,
        years=40
    )
    return {
        "current_net_worth": current_nw,
        "annual_savings": annual_savings,
        "target_spend": target_spend,
        "fire_number": proj["fire_number_today"],
        "fire_year": proj["fire_year"],
        "projection": proj["projection"]
    }
