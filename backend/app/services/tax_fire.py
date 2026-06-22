from decimal import Decimal
from datetime import datetime
from typing import List, Dict, Any
from app.models.models import Transaction, TransactionType

def calculate_cgt_fifo(transactions: List[Transaction], is_super: bool = False) -> Dict[str, Any]:
    buys = []
    # sort transactions chronologically
    sorted_txns = sorted(transactions, key=lambda x: x.date)
    
    total_gain = Decimal("0.00")
    total_discounted_gain = Decimal("0.00")
    
    # Inside super, discount is 33.33% (meaning 66.67% of gain is taxable)
    # Outside super (individual), discount is 50.00% (meaning 50% of gain is taxable)
    discount_rate = Decimal("0.3333") if is_super else Decimal("0.5000")
    
    for t in sorted_txns:
        if t.type == TransactionType.BUY:
            buys.append({
                "date": t.date,
                "units": t.units,
                "price": t.price_per_unit,
                "fees": t.fees
            })
        elif t.type == TransactionType.SELL:
            units_to_sell = t.units
            sell_price = t.price_per_unit
            sell_date = t.date
            
            while units_to_sell > 0 and buys:
                buy = buys[0]
                available_units = buy["units"]
                
                if available_units <= units_to_sell:
                    matched_units = available_units
                    buys.pop(0)
                else:
                    matched_units = units_to_sell
                    buy["units"] -= units_to_sell
                    
                units_to_sell -= matched_units
                
                # cost basis with brokerage fees included
                cost_per_unit = buy["price"] + (buy["fees"] / buy["units"] if buy["units"] > 0 else 0)
                gain = (sell_price - cost_per_unit) * matched_units
                
                holding_days = (sell_date - buy["date"]).days
                if holding_days >= 365 and gain > 0:
                    discounted_gain = gain * (Decimal("1.0") - discount_rate)
                else:
                    discounted_gain = gain
                    
                total_gain += gain
                total_discounted_gain += discounted_gain
                
    return {
        "total_gain": total_gain,
        "total_discounted_gain": total_discounted_gain,
        "remaining_holdings": buys
    }

def calculate_dividend_tax(net_amount: Decimal, franking_pct: Decimal, marginal_tax_rate: Decimal) -> Dict[str, Any]:
    # Franking credit calculation: Net * (franking_pct/100) * (30/70)
    franking_fraction = franking_pct / Decimal("100.0")
    franking_credit = net_amount * franking_fraction * Decimal("30") / Decimal("70")
    
    # Grossed-up dividend
    grossed_up = net_amount + franking_credit
    
    # Tax payable on grossed-up amount
    tax_payable = grossed_up * marginal_tax_rate
    
    # Net tax liability after franking offset
    net_tax_payable = tax_payable - franking_credit
    
    return {
        "net_dividend": net_amount,
        "franking_credit": franking_credit,
        "grossed_up_dividend": grossed_up,
        "tax_payable": tax_payable,
        "net_tax_payable": net_tax_payable,
        "after_tax_income": net_amount - net_tax_payable
    }

def calculate_negative_gearing(
    rental_income: Decimal,
    other_expenses: Decimal,
    interest_paid: Decimal,
    marginal_tax_rate: Decimal
) -> Dict[str, Any]:
    total_expenses = other_expenses + interest_paid
    net_rental_position = rental_income - total_expenses
    
    tax_savings = Decimal("0.00")
    if net_rental_position < 0:
        tax_savings = abs(net_rental_position) * marginal_tax_rate
        
    return {
        "rental_income": rental_income,
        "total_expenses": total_expenses,
        "net_rental_position": net_rental_position,
        "is_negatively_geared": net_rental_position < 0,
        "tax_savings": tax_savings,
        "after_tax_impact": net_rental_position + tax_savings
    }

def project_fire_timeline(
    current_net_worth: Decimal,
    annual_savings: Decimal,
    annual_return_rate: Decimal,
    inflation_rate: Decimal,
    target_annual_spend: Decimal,
    safe_withdrawal_rate: Decimal,
    years: int = 40
) -> Dict[str, Any]:
    fire_number = target_annual_spend / safe_withdrawal_rate
    
    projection_data = []
    net_worth = current_net_worth
    fire_year = -1
    
    for year in range(1, years + 1):
        # Grow net worth
        investment_gains = net_worth * annual_return_rate
        net_worth = net_worth + investment_gains + annual_savings
        
        # Adjust FIRE Target for inflation
        inflated_fire_number = fire_number * ((Decimal("1.0") + inflation_rate) ** year)
        
        is_fire_achieved = net_worth >= inflated_fire_number
        if is_fire_achieved and fire_year == -1:
            fire_year = year
            
        projection_data.append({
            "year": year,
            "net_worth": round(net_worth, 2),
            "target_fire_number": round(inflated_fire_number, 2),
            "is_fire_achieved": is_fire_achieved
        })
        
    return {
        "fire_number_today": round(fire_number, 2),
        "fire_year": fire_year,
        "projection": projection_data
    }
