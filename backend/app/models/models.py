from __future__ import annotations
from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import List, Optional

from sqlalchemy import Index
from sqlmodel import Field, Relationship, SQLModel

# Patch SQLModel for annotation resolution compatibility
import re
import sqlmodel._compat
import sqlmodel.main
_orig_get_relationship_to = sqlmodel._compat.get_relationship_to

def _patched_get_relationship_to(name: str, rel_info: any, annotation: any) -> any:
    if isinstance(annotation, str):
        s = annotation.strip()
        s = re.sub(r'\s*\|\s*None\b', '', s)
        s = re.sub(r'\bNone\s*\|\s*', '', s)
        match_list = re.match(r'^(?:typing\.)?(?:List|list)\[(.*)\]$', s)
        if match_list:
            s = match_list.group(1).strip()
        match_opt = re.match(r'^(?:typing\.)?(?:Optional|Union)\[(.*)\]$', s)
        if match_opt:
            inner = match_opt.group(1).strip()
            parts = [p.strip() for p in inner.split(',')]
            parts = [p for p in parts if p != 'None']
            if parts:
                s = parts[0]
        s = s.strip("'\"")
        return s
    return _orig_get_relationship_to(name, rel_info, annotation)

sqlmodel._compat.get_relationship_to = _patched_get_relationship_to
sqlmodel.main.get_relationship_to = _patched_get_relationship_to


# ---------------------------------------------------------------------------
# Enumerations
# ---------------------------------------------------------------------------

class AccountType(str, Enum):
    CASH = "Cash"
    BROKERAGE = "Brokerage"
    SUPER = "Super"
    CRYPTO = "Crypto"
    PROPERTY = "Property"
    LIABILITY = "Liability"
    OTHER_ASSET = "Other Asset"


class TransactionType(str, Enum):
    BUY = "Buy"
    SELL = "Sell"
    DEPOSIT = "Deposit"
    WITHDRAWAL = "Withdrawal"
    DIVIDEND = "Dividend"
    INTEREST = "Interest"
    EXPENSE = "Expense"
    INCOME = "Income"


class AssetClass(str, Enum):
    ETF = "ETF"
    STOCK = "Stock"
    MANAGED_FUND = "Managed Fund"
    CRYPTO = "Crypto"
    CASH = "Cash"
    PROPERTY = "Property"
    OTHER = "Other"


class PayFrequency(str, Enum):
    WEEKLY = "Weekly"
    FORTNIGHTLY = "Fortnightly"
    TWICE_MONTHLY = "Twice Monthly"
    FOUR_WEEKLY = "4-weeks"
    MONTHLY = "Monthly"


class CGTMethod(str, Enum):
    FIFO = "FIFO"
    MANUAL = "Manual"


class SubscriptionTier(str, Enum):
    FREE = "FREE"
    PRO = "PRO"
    ENTERPRISE = "ENTERPRISE"


class SubscriptionStatus(str, Enum):
    ACTIVE = "ACTIVE"
    TRIALING = "TRIALING"
    PAST_DUE = "PAST_DUE"
    CANCELED = "CANCELED"
    INCOMPLETE = "INCOMPLETE"


# ---------------------------------------------------------------------------
# User & Subscription Models
# ---------------------------------------------------------------------------

class User(SQLModel, table=True):
    __tablename__ = "users"

    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True, max_length=255)
    display_name: str = Field(default="", max_length=100)
    hashed_password: Optional[str] = Field(default=None)
    clerk_user_id: Optional[str] = Field(default=None, index=True, unique=True, max_length=128)
    is_superadmin: bool = Field(default=False)
    has_completed_onboarding: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_active: bool = Field(default=True)

    accounts: List["Account"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    settings: Optional["UserSettings"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    subscription: Optional["Subscription"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    monthly_snapshots: List["MonthlySnapshot"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    budget_items: List["BudgetItem"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    yearly_expenses: List["YearlyExpense"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    side_income_logs: List["SideIncomeLog"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    super_history_logs: List["SuperHistory"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


class Subscription(SQLModel, table=True):
    __tablename__ = "subscriptions"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", unique=True, index=True)
    tier: SubscriptionTier = Field(default=SubscriptionTier.FREE)
    status: SubscriptionStatus = Field(default=SubscriptionStatus.ACTIVE)
    stripe_customer_id: Optional[str] = Field(default=None, index=True, max_length=100)
    stripe_subscription_id: Optional[str] = Field(default=None, index=True, max_length=100)
    stripe_price_id: Optional[str] = Field(default=None, max_length=100)
    current_period_start: Optional[datetime] = None
    current_period_end: Optional[datetime] = None
    cancel_at_period_end: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    user: Optional["User"] = Relationship(back_populates="subscription")


# ---------------------------------------------------------------------------
# Global Settings Config
# ---------------------------------------------------------------------------

class UserSettings(SQLModel, table=True):
    __tablename__ = "user_settings"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", unique=True)

    base_currency: str = Field(default="AUD", max_length=3)
    pay_frequency: PayFrequency = Field(default=PayFrequency.FORTNIGHTLY)
    pay_day_of_month: int = Field(default=1)
    employment_salary: Decimal = Field(default=Decimal("0.00"), max_digits=12, decimal_places=2)

    default_brokerage_fee: Decimal = Field(default=Decimal("9.95"), max_digits=8, decimal_places=2)

    cgt_method: CGTMethod = Field(default=CGTMethod.FIFO)
    marginal_tax_rate: Decimal = Field(default=Decimal("0.325"), max_digits=5, decimal_places=4)

    use_budget: bool = Field(default=True)
    emergency_fund_months: int = Field(default=3)

    fire_safe_withdrawal_rate: Decimal = Field(default=Decimal("0.04"), max_digits=5, decimal_places=4)
    fire_investment_return_rate: Decimal = Field(default=Decimal("0.07"), max_digits=5, decimal_places=4)
    fire_inflation_rate: Decimal = Field(default=Decimal("0.03"), max_digits=5, decimal_places=4)
    fire_target_annual_spend: Decimal = Field(default=Decimal("0.00"), max_digits=12, decimal_places=2)
    fire_current_age: Optional[int] = None
    fire_target_retire_age: Optional[int] = None
    fire_life_expectancy: int = Field(default=90)

    bank_interest_rate: Decimal = Field(default=Decimal("0.05"), max_digits=5, decimal_places=4)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    user: Optional["User"] = Relationship(back_populates="settings")


# ---------------------------------------------------------------------------
# General Asset Ledgers (Unified Structure)
# ---------------------------------------------------------------------------

class Account(SQLModel, table=True):
    __tablename__ = "accounts"
    __table_args__ = (
        Index("ix_accounts_user_type", "user_id", "type"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    name: str = Field(index=True, max_length=100)
    type: AccountType
    institution: str = Field(default="", max_length=100)
    currency: str = Field(default="AUD", max_length=3)
    is_retirement: bool = Field(default=False)
    
    # Extra property specific parameters
    is_primary_residence: bool = Field(default=False)
    purchase_value: Decimal = Field(default=Decimal("0.00"), max_digits=15, decimal_places=2)
    current_valuation: Decimal = Field(default=Decimal("0.00"), max_digits=15, decimal_places=2)
    net_rental_profit_to_date: Decimal = Field(default=Decimal("0.00"), max_digits=15, decimal_places=2)
    
    # Mortgage & Loan details
    mortgage_start_date: Optional[datetime] = None
    interest_freq_per_year: int = Field(default=12)
    annual_interest_rate: Decimal = Field(default=Decimal("0.00"), max_digits=5, decimal_places=4)
    regular_payment_amount: Decimal = Field(default=Decimal("0.00"), max_digits=12, decimal_places=2)
    start_loan_balance: Decimal = Field(default=Decimal("0.00"), max_digits=15, decimal_places=2)
    current_loan_balance: Decimal = Field(default=Decimal("0.00"), max_digits=15, decimal_places=2)
    payments_made_to_date: Decimal = Field(default=Decimal("0.00"), max_digits=15, decimal_places=2)
    total_interest_fees_accrued: Decimal = Field(default=Decimal("0.00"), max_digits=15, decimal_places=2)

    notes: Optional[str] = Field(default=None, max_length=500)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    user: Optional["User"] = Relationship(back_populates="accounts")
    transactions: List["Transaction"] = Relationship(
        back_populates="account",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    budget_items: List["BudgetItem"] = Relationship(
        back_populates="bank_account",
    )


class Asset(SQLModel, table=True):
    __tablename__ = "assets"

    id: Optional[int] = Field(default=None, primary_key=True)
    ticker: str = Field(index=True, unique=True, max_length=50)
    name: str = Field(max_length=200)
    category: AccountType
    asset_class: AssetClass = Field(default=AssetClass.OTHER)
    current_price: Decimal = Field(default=Decimal("0.0000"), max_digits=18, decimal_places=4)
    last_updated: datetime = Field(default_factory=datetime.utcnow)

    transactions: List["Transaction"] = Relationship(back_populates="asset")


class Transaction(SQLModel, table=True):
    __tablename__ = "transactions"
    __table_args__ = (
        Index("ix_transactions_account_date", "account_id", "date"),
        Index("ix_transactions_asset_type", "asset_id", "type"),
        Index("ix_transactions_date", "date"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    account_id: int = Field(foreign_key="accounts.id", index=True)
    asset_id: Optional[int] = Field(foreign_key="assets.id", default=None, index=True)

    type: TransactionType
    date: datetime = Field()

    units: Optional[Decimal] = Field(default=None, max_digits=18, decimal_places=8)
    price_per_unit: Optional[Decimal] = Field(default=None, max_digits=18, decimal_places=4)

    amount: Decimal = Field(max_digits=18, decimal_places=2)
    fees: Decimal = Field(default=Decimal("0.00"), max_digits=10, decimal_places=2)

    franking_percentage: Optional[Decimal] = Field(default=None, max_digits=5, decimal_places=2)
    is_drp: bool = Field(default=False)
    notes: Optional[str] = Field(default=None, max_length=500)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    account: Optional["Account"] = Relationship(back_populates="transactions")
    asset: Optional["Asset"] = Relationship(back_populates="transactions")


# ---------------------------------------------------------------------------
# Specific Sub-Ledger Databases
# ---------------------------------------------------------------------------

class ExternalApiConfig(SQLModel, table=True):
    __tablename__ = "external_api_configs"

    id: Optional[int] = Field(default=None, primary_key=True)
    provider_name: str = Field(index=True, unique=True, max_length=100)
    api_url: str = Field(max_length=500)
    api_key: str = Field(max_length=500)
    is_active: bool = Field(default=True)
    description: Optional[str] = Field(default=None, max_length=500)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class BudgetItem(SQLModel, table=True):
    __tablename__ = "budget_items"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    name: str = Field(max_length=100)
    category: str = Field(default="Expenses", max_length=50) # e.g. Expenses, Fun, Savings, Holiday
    monthly_amount: Decimal = Field(default=Decimal("0.00"), max_digits=12, decimal_places=2)
    bank_account_id: Optional[int] = Field(default=None, foreign_key="accounts.id")
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    user: Optional["User"] = Relationship(back_populates="budget_items")
    bank_account: Optional["Account"] = Relationship(back_populates="budget_items")


class YearlyExpense(SQLModel, table=True):
    __tablename__ = "yearly_expenses"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    name: str = Field(max_length=100)
    annual_cost: Decimal = Field(default=Decimal("0.00"), max_digits=12, decimal_places=2)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    user: Optional["User"] = Relationship(back_populates="yearly_expenses")


class SideIncomeLog(SQLModel, table=True):
    __tablename__ = "side_income_logs"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    record_date: datetime = Field()
    side_income_1: Decimal = Field(default=Decimal("0.00"), max_digits=12, decimal_places=2)
    rental_income_1: Decimal = Field(default=Decimal("0.00"), max_digits=12, decimal_places=2)
    notes: Optional[str] = Field(default=None, max_length=500)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    user: Optional["User"] = Relationship(back_populates="side_income_logs")


class SuperHistory(SQLModel, table=True):
    __tablename__ = "super_history"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    record_date: datetime = Field()
    super_setting: str = Field(default="High Growth 100%", max_length=100)
    voluntary_contribution: Decimal = Field(default=Decimal("0.00"), max_digits=12, decimal_places=2)
    total_value: Decimal = Field(default=Decimal("0.00"), max_digits=15, decimal_places=2)
    gain: Decimal = Field(default=Decimal("0.00"), max_digits=15, decimal_places=2)
    gain_pct: Decimal = Field(default=Decimal("0.00"), max_digits=8, decimal_places=4)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    user: Optional["User"] = Relationship(back_populates="super_history_logs")


# ---------------------------------------------------------------------------
# Aggregated Snapshot History Table
# ---------------------------------------------------------------------------

class MonthlySnapshot(SQLModel, table=True):
    __tablename__ = "monthly_snapshots"
    __table_args__ = (
        Index("ix_snapshots_user_date", "user_id", "snapshot_date"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    snapshot_date: datetime = Field(index=True)

    shares_value: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    shares_gain: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    etf_value: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    etf_gain: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    crypto_value: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    crypto_gain: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    managed_fund_value: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    managed_fund_gain: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    cash_value: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    cash_increase: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    super_value: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    super_voluntary_contrib: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    super_gain: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    property_current_value: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    property_purchase_value: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    property_equity: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    property_mortgage_balance: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    property_interest_fees: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    property_principal_paid: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    other_assets_value: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    other_assets_gain: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    liabilities_balance: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    liabilities_paid: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    salary_income: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    total_assets: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    total_liabilities: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    net_worth: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    user: Optional["User"] = Relationship(back_populates="monthly_snapshots")
