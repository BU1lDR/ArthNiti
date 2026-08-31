def calculate_financial_metrics(
    available_capital: float,
    monthly_expenses: float,
    expected_monthly_revenue: float
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

    return {
        "monthly_profit": round(monthly_profit, 2),
        "profit_margin_percent": round(profit_margin, 2),
        "financial_status": financial_status,
        "available_capital": available_capital
    }