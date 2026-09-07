# Each recommendation carries a stable code alongside its English sentence.
# The sentence stays because the API is consumed directly (Swagger, the unused
# routers, the tests) and English is the contract; the code exists so the
# frontend can show the same advice in the reader's own language without a second
# request. Codes and sentences are appended in lockstep — index i of one always
# describes index i of the other.
def generate_advice(
    financial_status: str,
    profit_margin_percent: float | None,
    available_capital: float
):
    recommendations = []
    codes = []

    if financial_status == "loss":
        recommendations.append(
            "Reduce unnecessary monthly expenses and review the pricing strategy."
        )
        codes.append("adv.reduceExpenses")

    elif financial_status == "break_even":
        recommendations.append(
            "Focus on increasing revenue while keeping monthly expenses stable."
        )
        codes.append("adv.growRevenue")

    elif financial_status == "profitable":
        recommendations.append(
            "Maintain the current business model and consider controlled expansion."
        )
        codes.append("adv.maintainExpand")

    # None means the margin could not be computed — no revenue to take a share
    # of. Guard before comparing: `None < 10` is a TypeError in Python 3, and
    # treating it as 0 would advise "improve the margin" to someone whose real
    # problem is that they have not entered any expected income at all.
    if profit_margin_percent is None:
        pass

    elif profit_margin_percent < 10:
        recommendations.append(
            "Improve the profit margin before making major expansion decisions."
        )
        codes.append("adv.improveMargin")

    elif profit_margin_percent >= 30:
        recommendations.append(
            "The business has a healthy profit margin and may be suitable for expansion."
        )
        codes.append("adv.healthyMargin")

    if available_capital < 10000:
        recommendations.append(
            "Maintain a sufficient cash reserve before making new investments."
        )
        codes.append("adv.cashReserve")

    return {
        "recommendations": recommendations,
        "recommendation_codes": codes
    }
