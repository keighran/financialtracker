from decimal import Decimal
from sqlmodel import Session, select
from app.models.models import Account, AccountType, Asset, AssetClass, Transaction, TransactionType

def calculate_current_net_worth(user_id: int, db: Session) -> dict:
    # Fetch every account for the user in a single query, then bucket by type
    # in memory (avoids six separate round-trips to the database).
    accounts = db.exec(select(Account).where(Account.user_id == user_id)).all()

    cash_value = Decimal("0.00")
    super_value = Decimal("0.00")
    other_value = Decimal("0.00")
    property_value = Decimal("0.00")
    mortgage_value = Decimal("0.00")
    liabilities_value = Decimal("0.00")
    portfolio_account_ids = []

    for a in accounts:
        if a.type == AccountType.CASH:
            cash_value += a.current_valuation
        elif a.type == AccountType.SUPER:
            super_value += a.current_valuation
        elif a.type == AccountType.OTHER_ASSET:
            other_value += a.current_valuation
        elif a.type == AccountType.PROPERTY:
            property_value += a.current_valuation
            mortgage_value += a.current_loan_balance
        elif a.type == AccountType.LIABILITY:
            liabilities_value += a.current_loan_balance
        elif a.type in (AccountType.BROKERAGE, AccountType.CRYPTO):
            portfolio_account_ids.append(a.id)

    equities_value = Decimal("0.00")
    crypto_value = Decimal("0.00")

    if portfolio_account_ids:
        # Get all transactions
        txns = db.exec(
            select(Transaction)
            .where(Transaction.account_id.in_(portfolio_account_ids))
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
