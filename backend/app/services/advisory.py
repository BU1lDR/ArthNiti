def generate_advice(
    financial_status: str,
    profit_margin_percent: float,
    available_capital: float
):
    recommendations = []

    if financial_status == "loss":
        recommendations.append(
            "Reduce unnecessary monthly expenses and review the pricing strategy."
        )

    elif financial_status == "break_even":
        recommendations.append(
            "Focus on increasing revenue while keeping monthly expenses stable."
        )

    elif financial_status == "profitable":
        recommendations.append(
            "Maintain the current business model and consider controlled expansion."
        )

    if profit_margin_percent < 10:
        recommendations.append(
            "Improve the profit margin before making major expansion decisions."
        )

    elif profit_margin_percent >= 30:
        recommendations.append(
            "The business has a healthy profit margin and may be suitable for expansion."
        )

    if available_capital < 10000:
        recommendations.append(
            "Maintain a sufficient cash reserve before making new investments."
        )

    return {
        "recommendations": recommendations
    }