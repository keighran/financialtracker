from decimal import Decimal
from sqlmodel import Session, select

from app.models.models import (
    UserSettings, BudgetItem, YearlyExpense, SideIncomeLog,
)
from app.services.tax_fire import project_fire_timeline, calculate_income_tax


def build_fire_projection(user_id: int, db: Session, current_net_worth: Decimal) -> dict:
    """Compute the FIRE projection for a user given an already-calculated
    net worth. Kept separate from net-worth aggregation so callers that already
    have the net worth (e.g. the dashboard overview) don't recompute it.

    Annual savings = after-tax salary − living costs (all non-"Savings" budget
    items + amortised yearly expenses) + average side income.
    """
    settings = db.exec(select(UserSettings).where(UserSettings.user_id == user_id)).first()
    if not settings:
        return None

    # employment_salary is stored as an ANNUAL figure (regardless of pay
    # frequency). Convert to after-tax monthly take-home.
    annual_salary = settings.employment_salary or Decimal("0.00")
    annual_tax = calculate_income_tax(annual_salary)
    monthly_after_tax_salary = (annual_salary - annual_tax) / Decimal("12")

    # Monthly living costs: every budget item except the "Savings" category
    # (money tagged as savings is not a living expense).
    budget_items = db.exec(select(BudgetItem).where(BudgetItem.user_id == user_id)).all()
    monthly_budget_spend = sum(
        (i.monthly_amount for i in budget_items if i.category.lower() != "savings"),
        Decimal("0.00"),
    )

    # Annual one-off / recurring yearly expenses, amortised to monthly.
    yearly_expenses = db.exec(select(YearlyExpense).where(YearlyExpense.user_id == user_id)).all()
    monthly_yearly_expense = sum(
        (e.annual_cost for e in yearly_expenses), Decimal("0.00")
    ) / Decimal("12")

    # Average side income across logged periods (treated as net/additional).
    side_logs = db.exec(select(SideIncomeLog).where(SideIncomeLog.user_id == user_id)).all()
    avg_side_income = Decimal("0.00")
    if side_logs:
        total_side = sum(
            (l.side_income_1 + l.rental_income_1 for l in side_logs),
            Decimal("0.00"),
        )
        avg_side_income = total_side / len(side_logs)

    total_monthly_savings = (
        monthly_after_tax_salary - monthly_budget_spend - monthly_yearly_expense
    ) + avg_side_income
    if total_monthly_savings < 0:
        total_monthly_savings = Decimal("0.00")

    annual_savings = total_monthly_savings * Decimal("12")

    proj = project_fire_timeline(
        current_net_worth=current_net_worth,
        annual_savings=annual_savings,
        annual_return_rate=settings.fire_investment_return_rate,
        inflation_rate=settings.fire_inflation_rate,
        target_annual_spend=settings.fire_target_annual_spend,
        safe_withdrawal_rate=settings.fire_safe_withdrawal_rate,
        years=40,
    )

    return {
        "current_net_worth": current_net_worth,
        "annual_savings": annual_savings,
        "target_spend": settings.fire_target_annual_spend,
        "fire_number": proj["fire_number_today"],
        "fire_year": proj["fire_year"],
        "projection": proj["projection"],
    }
