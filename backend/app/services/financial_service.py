def calculate_financial_metrics(
    available_capital: float,
    monthly_expenses: float,
    expected_monthly_revenue: float,
    initial_investment: float = 0
):
    monthly_profit = expected_monthly_revenue - monthly_expenses

    if expected_monthly_revenue > 0:
        profit_margin = (
            monthly_profit / expected_monthly_revenue
        ) * 100
    else:
        profit_margin = 0

    if monthly_profit > 0:
        financial_status = "profitable"
    elif monthly_profit == 0:
        financial_status = "break_even"
    else:
        financial_status = "loss"

    # Money the entrepreneur still has to arrange. Never negative: having more
    # capital than the plan needs is a surplus, not a gap of minus rupees.
    funding_gap = max(initial_investment - available_capital, 0)

    return {
        "monthly_profit": round(monthly_profit, 2),
        "profit_margin_percent": round(profit_margin, 2),
        "financial_status": financial_status,
        "available_capital": available_capital,
        "monthly_expenses": monthly_expenses,
        "expected_monthly_revenue": expected_monthly_revenue,
        "initial_investment": initial_investment,
        "funding_gap": round(funding_gap, 2)
    }