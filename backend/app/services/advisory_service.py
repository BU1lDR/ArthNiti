# Each recommendation carries a stable code alongside its English sentence.
# The sentence stays because the API is consumed directly (Swagger, the unused
# routers, the tests) and English is the contract; the code exists so the
# frontend can show the same advice in the reader's own language without a second
# request. Codes and sentences are appended in lockstep — index i of one always
# describes index i of the other.
def generate_advice(
    financial_status: str,
    profit_margin_percent: float | None,
    available_capital: float,
    funding_gap: float = 0,
    household_check: str = "not_checked",
    household_check_without_new_loan: str = "not_checked"
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

    # Expansion advice is withheld while the plan is not funded: telling someone
    # who is short of the money their plan needs to "consider expansion" is
    # advice to borrow more, which is the one thing they should not be told.
    # It is withheld for the same reason when the household's loan repayments,
    # a loan for the funding gap included, take more than half of its income
    # (risk_service's household check): expansion is usually paid for with
    # another loan.
    elif (
        financial_status == "profitable"
        and funding_gap <= 0
        and household_check != "over_limit"
    ):
        recommendations.append(
            "Maintain the current business model and consider controlled expansion."
        )
        codes.append("adv.maintainExpand")

    if funding_gap > 0:
        recommendations.append(
            "The available capital does not cover the planned investment. Check the "
            "matched schemes for loans or support, and borrow only what the monthly "
            "surplus can repay."
        )
        codes.append("adv.fundingGap")

    # Only "over_limit" says anything. "not_checked" means no household income
    # was given, and advice about a limit nobody measured would be invented.
    # The two sentences split on the loans the household ALREADY repays: when
    # those alone take more than half of its income, "take a smaller loan" is
    # the wrong advice, because no size of new loan brings the total back under
    # the line. The default "not_checked" keeps the older sentence for a caller
    # that does not pass the second check.
    if household_check == "over_limit":
        if household_check_without_new_loan == "over_limit":
            recommendations.append(
                "The loan payments your household already makes take more than half "
                "of its monthly income. Do not take a new loan until they are back to "
                "half or less."
            )
            codes.append("adv.householdAlreadyOver")
        else:
            recommendations.append(
                "Keep the household's total loan repayments to no more than half of its "
                "monthly income. Take a smaller loan, or none, until they fit."
            )
            codes.append("adv.householdOverLimit")

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

    elif (
        profit_margin_percent >= 30
        and funding_gap <= 0
        and household_check != "over_limit"
    ):
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
