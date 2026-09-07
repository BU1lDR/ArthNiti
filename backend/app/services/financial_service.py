def calculate_financial_metrics(
    available_capital: float,
    monthly_expenses: float,
    expected_monthly_revenue: float,
    initial_investment: float = 0
):
    monthly_profit = expected_monthly_revenue - monthly_expenses

    # A margin needs revenue to be a share *of*. With no revenue there is no
    # answer, so say so rather than saying 0 — a printed "0%" reads as
    # break-even, and this branch is reached exactly when someone has entered
    # expenses but no expected income, which is a loss. `estimated_roi_percent`
    # already returns None for the same reason when the investment is 0; these
    # are the same situation and must not give two different answers.
    if expected_monthly_revenue > 0:
        profit_margin = (
            monthly_profit / expected_monthly_revenue
        ) * 100
    else:
        profit_margin = None

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
        "profit_margin_percent": (
            round(profit_margin, 2) if profit_margin is not None else None
        ),
        "financial_status": financial_status,
        "available_capital": available_capital,
        "monthly_expenses": monthly_expenses,
        "expected_monthly_revenue": expected_monthly_revenue,
        "initial_investment": initial_investment,
        "funding_gap": round(funding_gap, 2)
    }