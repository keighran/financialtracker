from decimal import Decimal
from sqlmodel import Session, select

from app.models.models import (
    UserSettings, PayFrequency, BudgetItem, SideIncomeLog,
)
from app.services.tax_fire import project_fire_timeline


def _monthly_salary(settings: UserSettings) -> Decimal:
    freq = settings.pay_frequency
    if freq == PayFrequency.WEEKLY:
        return settings.employment_salary * Decimal("52") / Decimal("12")
    if freq == PayFrequency.MONTHLY:
        return settings.employment_salary
    # Fortnightly (and any other frequency) default to a 26-pay year.
    return settings.employment_salary * Decimal("26") / Decimal("12")


def build_fire_projection(user_id: int, db: Session, current_net_worth: Decimal) -> dict:
    """Compute the FIRE projection for a user given an already-calculated
    net worth. Kept separate from net-worth aggregation so callers that already
    have the net worth (e.g. the dashboard overview) don't recompute it."""
    settings = db.exec(select(UserSettings).where(UserSettings.user_id == user_id)).first()
    if not settings:
        return None

    monthly_salary = _monthly_salary(settings)

    # Calculate savings from budget
    budget_items = db.exec(select(BudgetItem).where(BudgetItem.user_id == user_id)).all()
    monthly_budget_spend = sum(
        (i.monthly_amount for i in budget_items if i.category.lower() == "expenses"),
        Decimal("0.00"),
    )

    # Side income logs average
    side_logs = db.exec(select(SideIncomeLog).where(SideIncomeLog.user_id == user_id)).all()
    avg_side_income = Decimal("0.00")
    if side_logs:
        total_side = sum(
            (l.side_income_1 + l.rental_income_1 for l in side_logs),
            Decimal("0.00"),
        )
        avg_side_income = total_side / len(side_logs)

    total_monthly_savings = (monthly_salary - monthly_budget_spend) + avg_side_income
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
