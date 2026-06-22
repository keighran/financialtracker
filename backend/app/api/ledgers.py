import logging
import time
from datetime import datetime
from decimal import Decimal
from typing import List, Optional
import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from pydantic import BaseModel

from app.db import get_session
from app.auth.clerk import get_current_user
from app.models.models import (
    User, Account, AccountType, Transaction, TransactionType,
    Asset, AssetClass, BudgetItem, YearlyExpense, SideIncomeLog,
    SuperHistory, UserSettings
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ledgers", tags=["ledgers"])

# ---------------------------------------------------------------------------
# HELPERS
# ---------------------------------------------------------------------------

def check_account_owner(account_id: int, user_id: int, db: Session) -> Account:
    account = db.get(Account, account_id)
    if not account or account.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found or access denied"
        )
    return account


# Read schemas that embed the related asset (SQLModel table models do not
# serialize relationships, so transaction history needs an explicit shape).
class AssetRead(BaseModel):
    id: int
    ticker: str
    name: str
    asset_class: str

class TransactionRead(BaseModel):
    id: int
    account_id: int
    type: TransactionType
    date: datetime
    units: Optional[Decimal] = None
    price_per_unit: Optional[Decimal] = None
    amount: Decimal
    fees: Decimal
    franking_percentage: Optional[Decimal] = None
    is_drp: bool = False
    notes: Optional[str] = None
    asset: Optional[AssetRead] = None


def _serialize_transactions(txns: List[Transaction], db: Session) -> List[TransactionRead]:
    """Attach each transaction's asset (batch-loaded) into a read schema."""
    asset_ids = {t.asset_id for t in txns if t.asset_id is not None}
    assets_by_id = {}
    if asset_ids:
        assets_by_id = {
            a.id: a
            for a in db.exec(select(Asset).where(Asset.id.in_(asset_ids))).all()
        }
    result = []
    for t in txns:
        a = assets_by_id.get(t.asset_id)
        result.append(TransactionRead(
            id=t.id,
            account_id=t.account_id,
            type=t.type,
            date=t.date,
            units=t.units,
            price_per_unit=t.price_per_unit,
            amount=t.amount,
            fees=t.fees,
            franking_percentage=t.franking_percentage,
            is_drp=t.is_drp,
            notes=t.notes,
            asset=AssetRead(id=a.id, ticker=a.ticker, name=a.name, asset_class=a.asset_class.value) if a else None,
        ))
    return result


# ---------------------------------------------------------------------------
# INVESTMENT ACCOUNTS (Brokerage / Crypto)
# ---------------------------------------------------------------------------

class InvestmentAccountCreate(BaseModel):
    name: str
    institution: str = ""
    asset_class: AssetClass
    currency: str = "AUD"
    notes: Optional[str] = None

@router.get("/investment/accounts", response_model=List[Account])
async def get_investment_accounts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    statement = select(Account).where(
        Account.user_id == current_user.id,
        Account.type.in_([AccountType.BROKERAGE, AccountType.CRYPTO])
    )
    return db.exec(statement).all()

@router.post("/investment/accounts", response_model=Account, status_code=status.HTTP_201_CREATED)
async def create_investment_account(
    data: InvestmentAccountCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    acc_type = AccountType.CRYPTO if data.asset_class == AssetClass.CRYPTO else AccountType.BROKERAGE
    account = Account(
        user_id=current_user.id,
        name=data.name,
        type=acc_type,
        institution=data.institution,
        currency=data.currency,
        notes=data.notes
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


# ---------------------------------------------------------------------------
# CRYPTO COIN REFERENCE (CoinGecko proxy)
# ---------------------------------------------------------------------------

# Cache the full coin list in-memory so we hit CoinGecko at most once per TTL
# (the list is large and shared across all users).
_coins_cache: dict = {"data": None, "ts": 0.0}
_COINS_TTL = 86400  # 24h

@router.get("/crypto/coins")
async def get_crypto_coins(current_user: User = Depends(get_current_user)):
    """Return the list of known cryptocurrencies ({symbol, name}) from CoinGecko
    so the frontend can offer a searchable dropdown instead of free-text entry."""
    now = time.time()
    if _coins_cache["data"] and (now - _coins_cache["ts"]) < _COINS_TTL:
        return _coins_cache["data"]
    try:
        resp = httpx.get("https://api.coingecko.com/api/v3/coins/list", timeout=20)
        resp.raise_for_status()
        coins = resp.json()
        data = [
            {"id": c["id"], "symbol": c["symbol"].upper(), "name": c["name"]}
            for c in coins
            if c.get("symbol") and c.get("name")
        ]
        _coins_cache["data"] = data
        _coins_cache["ts"] = now
        return data
    except Exception as exc:
        logger.error("Failed to fetch CoinGecko coin list: %s", exc)
        if _coins_cache["data"]:
            return _coins_cache["data"]  # serve stale cache if available
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not fetch cryptocurrency list",
        )


# ---------------------------------------------------------------------------
# CASH LEDGER
# ---------------------------------------------------------------------------

class CashAccountCreate(BaseModel):
    name: str
    institution: str = ""
    balance: Decimal = Decimal("0.00")
    currency: str = "AUD"
    notes: Optional[str] = None

@router.get("/cash/accounts", response_model=List[Account])
async def get_cash_accounts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    statement = select(Account).where(
        Account.user_id == current_user.id,
        Account.type == AccountType.CASH
    )
    return db.exec(statement).all()

@router.post("/cash/accounts", response_model=Account, status_code=status.HTTP_201_CREATED)
async def create_cash_account(
    data: CashAccountCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    account = Account(
        user_id=current_user.id,
        name=data.name,
        type=AccountType.CASH,
        institution=data.institution,
        currency=data.currency,
        current_loan_balance=data.balance, # use current_loan_balance field or similar for cash balance (wait, let's keep current_loan_balance as cash balance or use purchase_value/current_valuation)
        purchase_value=data.balance, # We can use current_valuation to store the balance
        current_valuation=data.balance,
        notes=data.notes
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return account

@router.put("/cash/accounts/{id}", response_model=Account)
async def update_cash_account(
    id: int,
    data: CashAccountCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    account = check_account_owner(id, current_user.id, db)
    account.name = data.name
    account.institution = data.institution
    account.currency = data.currency
    account.current_valuation = data.balance
    account.purchase_value = data.balance
    account.notes = data.notes
    db.add(account)
    db.commit()
    db.refresh(account)
    return account

@router.delete("/cash/accounts/{id}")
async def delete_cash_account(
    id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    account = check_account_owner(id, current_user.id, db)
    db.delete(account)
    db.commit()
    return {"message": "Cash account deleted"}

# ---------------------------------------------------------------------------
# LIABILITIES
# ---------------------------------------------------------------------------

class LiabilityCreate(BaseModel):
    name: str
    institution: str = ""
    start_loan_balance: Decimal
    current_loan_balance: Decimal
    payments_made_to_date: Decimal = Decimal("0.00")
    annual_interest_rate: Decimal = Decimal("0.00")
    regular_payment_amount: Decimal = Decimal("0.00")
    notes: Optional[str] = None

@router.get("/liabilities", response_model=List[Account])
async def get_liabilities(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    statement = select(Account).where(
        Account.user_id == current_user.id,
        Account.type == AccountType.LIABILITY
    )
    return db.exec(statement).all()

@router.post("/liabilities", response_model=Account, status_code=status.HTTP_201_CREATED)
async def create_liability(
    data: LiabilityCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    account = Account(
        user_id=current_user.id,
        name=data.name,
        type=AccountType.LIABILITY,
        institution=data.institution,
        start_loan_balance=data.start_loan_balance,
        current_loan_balance=data.current_loan_balance,
        payments_made_to_date=data.payments_made_to_date,
        annual_interest_rate=data.annual_interest_rate,
        regular_payment_amount=data.regular_payment_amount,
        notes=data.notes
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return account

@router.put("/liabilities/{id}", response_model=Account)
async def update_liability(
    id: int,
    data: LiabilityCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    account = check_account_owner(id, current_user.id, db)
    account.name = data.name
    account.institution = data.institution
    account.start_loan_balance = data.start_loan_balance
    account.current_loan_balance = data.current_loan_balance
    account.payments_made_to_date = data.payments_made_to_date
    account.annual_interest_rate = data.annual_interest_rate
    account.regular_payment_amount = data.regular_payment_amount
    account.notes = data.notes
    db.add(account)
    db.commit()
    db.refresh(account)
    return account

@router.delete("/liabilities/{id}")
async def delete_liability(
    id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    account = check_account_owner(id, current_user.id, db)
    db.delete(account)
    db.commit()
    return {"message": "Liability deleted"}

# ---------------------------------------------------------------------------
# PROPERTY LEDGER
# ---------------------------------------------------------------------------

class PropertyCreate(BaseModel):
    name: str
    purchase_value: Decimal
    current_valuation: Decimal
    is_primary_residence: bool = False
    net_rental_profit_to_date: Decimal = Decimal("0.00")
    
    # Mortgage details
    start_loan_balance: Decimal = Decimal("0.00")
    current_loan_balance: Decimal = Decimal("0.00")
    payments_made_to_date: Decimal = Decimal("0.00")
    annual_interest_rate: Decimal = Decimal("0.00")
    regular_payment_amount: Decimal = Decimal("0.00")
    notes: Optional[str] = None

@router.get("/properties", response_model=List[Account])
async def get_properties(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    statement = select(Account).where(
        Account.user_id == current_user.id,
        Account.type == AccountType.PROPERTY
    )
    return db.exec(statement).all()

@router.post("/properties", response_model=Account, status_code=status.HTTP_201_CREATED)
async def create_property(
    data: PropertyCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    account = Account(
        user_id=current_user.id,
        name=data.name,
        type=AccountType.PROPERTY,
        purchase_value=data.purchase_value,
        current_valuation=data.current_valuation,
        is_primary_residence=data.is_primary_residence,
        net_rental_profit_to_date=data.net_rental_profit_to_date,
        start_loan_balance=data.start_loan_balance,
        current_loan_balance=data.current_loan_balance,
        payments_made_to_date=data.payments_made_to_date,
        annual_interest_rate=data.annual_interest_rate,
        regular_payment_amount=data.regular_payment_amount,
        notes=data.notes
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return account

@router.put("/properties/{id}", response_model=Account)
async def update_property(
    id: int,
    data: PropertyCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    account = check_account_owner(id, current_user.id, db)
    account.name = data.name
    account.purchase_value = data.purchase_value
    account.current_valuation = data.current_valuation
    account.is_primary_residence = data.is_primary_residence
    account.net_rental_profit_to_date = data.net_rental_profit_to_date
    account.start_loan_balance = data.start_loan_balance
    account.current_loan_balance = data.current_loan_balance
    account.payments_made_to_date = data.payments_made_to_date
    account.annual_interest_rate = data.annual_interest_rate
    account.regular_payment_amount = data.regular_payment_amount
    account.notes = data.notes
    db.add(account)
    db.commit()
    db.refresh(account)
    return account

@router.delete("/properties/{id}")
async def delete_property(
    id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    account = check_account_owner(id, current_user.id, db)
    db.delete(account)
    db.commit()
    return {"message": "Property deleted"}

# ---------------------------------------------------------------------------
# SUPERANNUATION LEDGER
# ---------------------------------------------------------------------------

class SuperAccountCreate(BaseModel):
    name: str
    institution: str = ""
    balance: Decimal = Decimal("0.00")
    notes: Optional[str] = None

@router.get("/super/accounts", response_model=List[Account])
async def get_super_accounts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    statement = select(Account).where(
        Account.user_id == current_user.id,
        Account.type == AccountType.SUPER
    )
    return db.exec(statement).all()

@router.post("/super/accounts", response_model=Account, status_code=status.HTTP_201_CREATED)
async def create_super_account(
    data: SuperAccountCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    account = Account(
        user_id=current_user.id,
        name=data.name,
        type=AccountType.SUPER,
        institution=data.institution,
        current_valuation=data.balance,
        purchase_value=data.balance,
        notes=data.notes
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return account

@router.put("/super/accounts/{id}", response_model=Account)
async def update_super_account(
    id: int,
    data: SuperAccountCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    account = check_account_owner(id, current_user.id, db)
    account.name = data.name
    account.institution = data.institution
    account.current_valuation = data.balance
    account.purchase_value = data.balance
    account.notes = data.notes
    db.add(account)
    db.commit()
    db.refresh(account)
    return account

@router.delete("/super/accounts/{id}")
async def delete_super_account(
    id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    account = check_account_owner(id, current_user.id, db)
    db.delete(account)
    db.commit()
    return {"message": "Super account deleted"}

@router.get("/super/history", response_model=List[SuperHistory])
async def get_super_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    statement = select(SuperHistory).where(SuperHistory.user_id == current_user.id).order_by(SuperHistory.record_date.desc())
    return db.exec(statement).all()

class SuperHistoryCreate(BaseModel):
    record_date: datetime
    super_setting: str
    voluntary_contribution: Decimal
    total_value: Decimal

@router.post("/super/history", response_model=SuperHistory, status_code=status.HTTP_201_CREATED)
async def create_super_history_log(
    data: SuperHistoryCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    # Calculate gain from previous log
    prev_log = db.exec(
        select(SuperHistory)
        .where(SuperHistory.user_id == current_user.id)
        .order_by(SuperHistory.record_date.desc())
    ).first()
    
    gain = Decimal("0.00")
    gain_pct = Decimal("0.00")
    if prev_log and prev_log.total_value > 0:
        gain = data.total_value - prev_log.total_value - data.voluntary_contribution
        gain_pct = gain / prev_log.total_value
        
    log = SuperHistory(
        user_id=current_user.id,
        record_date=data.record_date,
        super_setting=data.super_setting,
        voluntary_contribution=data.voluntary_contribution,
        total_value=data.total_value,
        gain=gain,
        gain_pct=gain_pct,
        updated_at=datetime.utcnow()
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log

# ---------------------------------------------------------------------------
# OTHER ASSETS LEDGER
# ---------------------------------------------------------------------------

class OtherAssetCreate(BaseModel):
    name: str
    institution: str = ""
    current_valuation: Decimal
    notes: Optional[str] = None

@router.get("/other-assets", response_model=List[Account])
async def get_other_assets(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    statement = select(Account).where(
        Account.user_id == current_user.id,
        Account.type == AccountType.OTHER_ASSET
    )
    return db.exec(statement).all()

@router.post("/other-assets", response_model=Account, status_code=status.HTTP_201_CREATED)
async def create_other_asset(
    data: OtherAssetCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    account = Account(
        user_id=current_user.id,
        name=data.name,
        type=AccountType.OTHER_ASSET,
        institution=data.institution,
        current_valuation=data.current_valuation,
        purchase_value=data.current_valuation,
        notes=data.notes
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return account

@router.put("/other-assets/{id}", response_model=Account)
async def update_other_asset(
    id: int,
    data: OtherAssetCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    account = check_account_owner(id, current_user.id, db)
    account.name = data.name
    account.institution = data.institution
    account.current_valuation = data.current_valuation
    account.purchase_value = data.current_valuation
    account.notes = data.notes
    db.add(account)
    db.commit()
    db.refresh(account)
    return account

@router.delete("/other-assets/{id}")
async def delete_other_asset(
    id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    account = check_account_owner(id, current_user.id, db)
    db.delete(account)
    db.commit()
    return {"message": "Other asset deleted"}

# ---------------------------------------------------------------------------
# EQUITIES & CRYPTO ASSETS & TRANSACTIONS
# ---------------------------------------------------------------------------

class TransactionRequest(BaseModel):
    account_id: int
    ticker: str
    asset_name: str
    type: TransactionType
    asset_class: AssetClass
    date: datetime
    units: Decimal
    price_per_unit: Decimal
    amount: Decimal
    fees: Decimal = Decimal("0.00")
    notes: Optional[str] = None

@router.get("/equities/portfolio")
async def get_equities_portfolio(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    # Fetch all Brokerage/Crypto accounts for user
    accounts = db.exec(
        select(Account).where(
            Account.user_id == current_user.id,
            Account.type.in_([AccountType.BROKERAGE, AccountType.CRYPTO])
        )
    ).all()
    account_ids = [a.id for a in accounts]
    
    if not account_ids:
        return []
        
    # Get all transactions for these accounts
    txns = db.exec(
        select(Transaction)
        .where(Transaction.account_id.in_(account_ids))
        .order_by(Transaction.date.asc())
    ).all()

    # Batch-load every referenced asset in one query (avoids N+1).
    asset_ids = {t.asset_id for t in txns if t.asset_id is not None}
    assets_by_id = {}
    if asset_ids:
        assets_by_id = {
            a.id: a
            for a in db.exec(select(Asset).where(Asset.id.in_(asset_ids))).all()
        }

    # Calculate holdings
    holdings = {}
    for t in txns:
        asset = assets_by_id.get(t.asset_id)
        if not asset:
            continue
        ticker = asset.ticker
        if ticker not in holdings:
            holdings[ticker] = {
                "asset_id": asset.id,
                "ticker": ticker,
                "name": asset.name,
                "asset_class": asset.asset_class.value,
                "units": Decimal("0.00"),
                "total_cost": Decimal("0.00"),
                "current_price": asset.current_price,
            }
            
        h = holdings[ticker]
        if t.type == TransactionType.BUY:
            h["units"] += t.units
            h["total_cost"] += t.amount + t.fees
        elif t.type == TransactionType.SELL:
            h["units"] -= t.units
            # Remove cost basis proportionally
            if (h["units"] + t.units) > 0:
                h["total_cost"] = (h["total_cost"] * h["units"]) / (h["units"] + t.units)
            else:
                h["total_cost"] = Decimal("0.00")
                
    # Filter out empty holdings and format
    result = []
    for ticker, h in holdings.items():
        if h["units"] > 0:
            h["avg_cost"] = h["total_cost"] / h["units"] if h["units"] > 0 else Decimal("0.00")
            h["market_value"] = h["units"] * h["current_price"]
            h["gain"] = h["market_value"] - h["total_cost"]
            h["gain_pct"] = (h["gain"] / h["total_cost"] * 100) if h["total_cost"] > 0 else Decimal("0.00")
            result.append(h)
            
    return result

@router.get("/transactions", response_model=List[TransactionRead])
async def get_transactions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    accounts = db.exec(
        select(Account).where(Account.user_id == current_user.id)
    ).all()
    account_ids = [a.id for a in accounts]

    if not account_ids:
        return []

    txns = db.exec(
        select(Transaction)
        .where(Transaction.account_id.in_(account_ids))
        .order_by(Transaction.date.desc())
    ).all()
    return _serialize_transactions(txns, db)

@router.post("/transactions", response_model=Transaction, status_code=status.HTTP_201_CREATED)
async def create_transaction(
    data: TransactionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    account = check_account_owner(data.account_id, current_user.id, db)
    
    # Check or create asset
    asset = db.exec(select(Asset).where(Asset.ticker == data.ticker)).first()
    if not asset:
        asset = Asset(
            ticker=data.ticker,
            name=data.asset_name,
            category=AccountType.BROKERAGE if data.asset_class != AssetClass.CRYPTO else AccountType.CRYPTO,
            asset_class=data.asset_class,
            current_price=data.price_per_unit, # default to transaction price
            last_updated=datetime.utcnow()
        )
        db.add(asset)
        db.flush()
        
    txn = Transaction(
        account_id=account.id,
        asset_id=asset.id,
        type=data.type,
        date=data.date,
        units=data.units,
        price_per_unit=data.price_per_unit,
        amount=data.amount,
        fees=data.fees,
        notes=data.notes,
        created_at=datetime.utcnow()
    )
    db.add(txn)
    db.commit()
    db.refresh(txn)
    return txn

# ---------------------------------------------------------------------------
# DIVIDENDS
# ---------------------------------------------------------------------------

class DividendCreate(BaseModel):
    account_id: int
    asset_ticker: str
    payment_date: datetime
    net_amount: Decimal
    units_held: Decimal
    franking_percentage: Decimal = Decimal("0.00")
    is_drp: bool = False
    notes: Optional[str] = None

@router.get("/dividends", response_model=List[TransactionRead])
async def get_dividends(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    accounts = db.exec(
        select(Account).where(Account.user_id == current_user.id)
    ).all()
    account_ids = [a.id for a in accounts]

    if not account_ids:
        return []

    txns = db.exec(
        select(Transaction)
        .where(
            Transaction.account_id.in_(account_ids),
            Transaction.type == TransactionType.DIVIDEND
        )
        .order_by(Transaction.date.desc())
    ).all()
    return _serialize_transactions(txns, db)

@router.post("/dividends", response_model=Transaction, status_code=status.HTTP_201_CREATED)
async def create_dividend(
    data: DividendCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    account = check_account_owner(data.account_id, current_user.id, db)
    
    asset = db.exec(select(Asset).where(Asset.ticker == data.asset_ticker)).first()
    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset ticker must exist in portfolio first."
        )
        
    txn = Transaction(
        account_id=account.id,
        asset_id=asset.id,
        type=TransactionType.DIVIDEND,
        date=data.payment_date,
        amount=data.net_amount,
        units=data.units_held,
        franking_percentage=data.franking_percentage,
        is_drp=data.is_drp,
        notes=data.notes,
        created_at=datetime.utcnow()
    )
    db.add(txn)
    db.commit()
    db.refresh(txn)
    return txn

# ---------------------------------------------------------------------------
# BUDGET LEDGER
# ---------------------------------------------------------------------------

class BudgetItemCreate(BaseModel):
    name: str
    category: str
    monthly_amount: Decimal
    bank_account_id: Optional[int] = None

@router.get("/budget/items", response_model=List[BudgetItem])
async def get_budget_items(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    statement = select(BudgetItem).where(BudgetItem.user_id == current_user.id)
    return db.exec(statement).all()

@router.post("/budget/items", response_model=BudgetItem, status_code=status.HTTP_201_CREATED)
async def create_budget_item(
    data: BudgetItemCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    if data.bank_account_id:
        check_account_owner(data.bank_account_id, current_user.id, db)
        
    item = BudgetItem(
        user_id=current_user.id,
        name=data.name,
        category=data.category,
        monthly_amount=data.monthly_amount,
        bank_account_id=data.bank_account_id,
        updated_at=datetime.utcnow()
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item

@router.delete("/budget/items/{id}")
async def delete_budget_item(
    id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    item = db.get(BudgetItem, id)
    if not item or item.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Item not found")
    db.delete(item)
    db.commit()
    return {"message": "Budget item deleted"}

# ---------------------------------------------------------------------------
# YEARLY EXPENSES
# ---------------------------------------------------------------------------

class YearlyExpenseCreate(BaseModel):
    name: str
    annual_cost: Decimal

@router.get("/budget/yearly", response_model=List[YearlyExpense])
async def get_yearly_expenses(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    statement = select(YearlyExpense).where(YearlyExpense.user_id == current_user.id)
    return db.exec(statement).all()

@router.post("/budget/yearly", response_model=YearlyExpense, status_code=status.HTTP_201_CREATED)
async def create_yearly_expense(
    data: YearlyExpenseCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    item = YearlyExpense(
        user_id=current_user.id,
        name=data.name,
        annual_cost=data.annual_cost,
        updated_at=datetime.utcnow()
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item

@router.delete("/budget/yearly/{id}")
async def delete_yearly_expense(
    id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    item = db.get(YearlyExpense, id)
    if not item or item.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Item not found")
    db.delete(item)
    db.commit()
    return {"message": "Yearly expense item deleted"}

# ---------------------------------------------------------------------------
# SIDE INCOME LOGS
# ---------------------------------------------------------------------------

class SideIncomeCreate(BaseModel):
    record_date: datetime
    side_income_1: Decimal
    rental_income_1: Decimal
    notes: Optional[str] = None

@router.get("/side-income", response_model=List[SideIncomeLog])
async def get_side_income_logs(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    statement = select(SideIncomeLog).where(SideIncomeLog.user_id == current_user.id).order_by(SideIncomeLog.record_date.desc())
    return db.exec(statement).all()

@router.post("/side-income", response_model=SideIncomeLog, status_code=status.HTTP_201_CREATED)
async def create_side_income_log(
    data: SideIncomeCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    log = SideIncomeLog(
        user_id=current_user.id,
        record_date=data.record_date,
        side_income_1=data.side_income_1,
        rental_income_1=data.rental_income_1,
        notes=data.notes,
        updated_at=datetime.utcnow()
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log

@router.delete("/side-income/{id}")
async def delete_side_income_log(
    id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    log = db.get(SideIncomeLog, id)
    if not log or log.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Log not found")
    db.delete(log)
    db.commit()
    return {"message": "Side income log deleted"}
