from decimal import Decimal
from sqlmodel import Session, select
from app.models.models import Account, AccountType, Asset, AssetClass, Transaction, TransactionType

def calculate_current_net_worth(user_id: int, db: Session) -> dict:
    # 1. Cash accounts
    cash_accounts = db.exec(
        select(Account).where(Account.user_id == user_id, Account.type == AccountType.CASH)
    ).all()
    cash_value = sum(a.current_valuation for a in cash_accounts)
    
    # 2. Super accounts
    super_accounts = db.exec(
        select(Account).where(Account.user_id == user_id, Account.type == AccountType.SUPER)
    ).all()
    super_value = sum(a.current_valuation for a in super_accounts)
    
    # 3. Other Assets
    other_accounts = db.exec(
        select(Account).where(Account.user_id == user_id, Account.type == AccountType.OTHER_ASSET)
    ).all()
    other_value = sum(a.current_valuation for a in other_accounts)
    
    # 4. Property Value & Mortgages
    property_accounts = db.exec(
        select(Account).where(Account.user_id == user_id, Account.type == AccountType.PROPERTY)
    ).all()
    property_value = sum(a.current_valuation for a in property_accounts)
    mortgage_value = sum(a.current_loan_balance for a in property_accounts)
    
    # 5. Liabilities
    liabilities = db.exec(
        select(Account).where(Account.user_id == user_id, Account.type == AccountType.LIABILITY)
    ).all()
    liabilities_value = sum(a.current_loan_balance for a in liabilities)
    
    # 6. Equities & Crypto
    portfolio_accounts = db.exec(
        select(Account).where(
            Account.user_id == user_id,
            Account.type.in_([AccountType.BROKERAGE, AccountType.CRYPTO])
        )
    ).all()
    account_ids = [a.id for a in portfolio_accounts]
    
    equities_value = Decimal("0.00")
    crypto_value = Decimal("0.00")
    
    if account_ids:
        # Get all transactions
        txns = db.exec(
            select(Transaction)
            .where(Transaction.account_id.in_(account_ids))
            .order_by(Transaction.date.asc())
        ).all()
        
        # Calculate holdings
        holdings = {}
        for t in txns:
            asset = db.get(Asset, t.asset_id)
            if not asset:
                continue
            ticker = asset.ticker
            if ticker not in holdings:
                holdings[ticker] = {
                    "units": Decimal("0.00"),
                    "current_price": asset.current_price,
                    "asset_class": asset.asset_class
                }
            h = holdings[ticker]
            if t.type == TransactionType.BUY:
                h["units"] += t.units
            elif t.type == TransactionType.SELL:
                h["units"] -= t.units
                
        # Total up market value
        for ticker, h in holdings.items():
            if h["units"] > 0:
                val = h["units"] * h["current_price"]
                if h["asset_class"] == AssetClass.CRYPTO:
                    crypto_value += val
                else:
                    equities_value += val
                    
    total_assets = cash_value + super_value + other_value + property_value + equities_value + crypto_value
    total_debts = mortgage_value + liabilities_value
    net_worth = total_assets - total_debts
    
    return {
        "cash": cash_value,
        "superannuation": super_value,
        "equities": equities_value,
        "crypto": crypto_value,
        "property": property_value,
        "other_assets": other_value,
        "mortgages": mortgage_value,
        "liabilities": liabilities_value,
        "total_assets": total_assets,
        "total_debts": total_debts,
        "net_worth": net_worth
    }
