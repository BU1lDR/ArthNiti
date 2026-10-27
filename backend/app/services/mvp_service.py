def build_mvp_summary(
    financial_analysis: dict,
    risk_analysis: dict,
    business_analysis: dict,
    advisory: dict,
):
    """
    Convert detailed backend analysis into a simple,
    action-oriented response suitable for rural and
    low-literacy entrepreneurs.

    The summary no longer echoes the language, dialect and literacy level the
    request carried. Nothing here reads them (the frontend translates the codes
    itself), and an echoed default such as literacy "low" looked like the
    person's own answer to a question nobody asked.
    """

    financial_status = financial_analysis.get("financial_status", "unknown")
    risk_level = risk_analysis.get("risk_level", "unknown")
    feasibility = business_analysis.get(
        "feasibility_status",
        business_analysis.get("feasibility", "unknown"),
    )

    # Money the plan needs that the entrepreneur does not have. `or 0` because
    # the unused routers and the unit tests pass partial dicts without it.
    funding_gap = financial_analysis.get("funding_gap", 0) or 0

    # Whether the household's loan repayments fit its income; see risk_service.
    # "not_checked" when no household income was given, and as the default for
    # the partial dicts the unused routers and the unit tests pass.
    household_check = risk_analysis.get("household_check", "not_checked")

    recommendations = advisory.get("recommendations", [])
    recommendation_codes = advisory.get("recommendation_codes", [])

    # Simple overall status. `*_code` fields are the translatable twins of the
    # sentences beside them — see advisory_service for why both travel together.
    #
    # `feasibility` is part of the "good" test on purpose. Without it a business
    # could be profitable this month, carry no repayment pressure, and still be
    # told its situation "looks positive" while business_service had separately
    # concluded the plan is not feasible — the two run off different inputs
    # (monthly_expenses vs monthly_operating_expenses) and can legitimately
    # disagree. Adding it is also what makes "review" reachable at all: see the
    # note on the priority chain below.
    #
    # A funding gap rules "good" out as well. It used to be computed and then
    # ignored everywhere, so ₹0 of capital against a ₹5 lakh plan read as "your
    # business is in a good position" and "keep going". risk_service now prices
    # the gap into the repayment pressure, which catches a gap too large to
    # repay; the `sum.needsFunding` branch below catches the one small enough
    # to repay but still not in hand.
    #
    # The household check rules "good" out too. The business surplus can carry
    # a loan that the household's income cannot, and repayments above half of
    # the household's monthly income, the proposed loan included, are what
    # RBI's microfinance directions cap for microfinance loans (paras 5.1 and
    # 5.2). It sits after the risk branch so a surplus problem is still named
    # first, and before needsFunding because a gap is a plan still to be made,
    # while an over-limit household is a problem the numbers already show.
    if (
        financial_status == "profitable"
        and risk_level == "low"
        and feasibility == "feasible"
        and funding_gap <= 0
        and household_check != "over_limit"
    ):
        status = "good"
        message = "Your business situation looks positive."
        message_code = "sum.positive"
    elif risk_level in {"moderate", "high"}:
        status = "attention_needed"
        message = "Your business needs attention before taking additional financial risk."
        message_code = "sum.needsAttention"
    elif household_check == "over_limit":
        status = "attention_needed"
        message = "Loan repayments are too high for the household's income."
        message_code = "sum.householdOverLimit"
    elif (
        funding_gap > 0
        and financial_status == "profitable"
        and feasibility == "feasible"
    ):
        status = "attention_needed"
        message = "The figures work, but the plan is not yet fully funded."
        message_code = "sum.needsFunding"
    else:
        status = "review"
        message = "Review your business finances carefully before making the next decision."
        message_code = "sum.reviewCarefully"

    # Priority action.
    #
    # The order of the first two branches is a fix, not a preference. This chain
    # used to lead with `risk_level == "high"`, and risk_service returns "high"
    # whenever the monthly surplus is non-positive — with or without a loan. So
    # an entrepreneur running at a loss with monthly_emi = 0 was told to "reduce
    # repayment pressure before taking another loan": advice about a debt they do
    # not have, while the thing actually wrong with their business went unsaid.
    #
    # The same equality made the profitability branch dead code. analysis_service
    # passes financial_analysis["monthly_profit"] in as risk's monthly_surplus, so
    # `financial_status != "profitable"` and "the surplus is non-positive" are the
    # same condition, and whichever came first won every time. Measured over a
    # 480-case sweep, `nxt.reviewExpenses` and status "review" were both
    # unreachable before this change.
    #
    # Leading with profitability names the real problem, and leaves the repayment
    # branch for the case it was written for: a positive surplus that an EMI is
    # eating more than half of.
    if financial_status != "profitable":
        next_step = "Review expenses and find ways to improve monthly income."
        next_step_code = "nxt.reviewExpenses"
        priority = "high"
    elif risk_level == "high":
        # Two different problems reach "high", and they need different advice.
        # If the EMI the entrepreneur already pays is fine on its own, the thing
        # pushing them over is the loan the funding gap would need — so "bring
        # down your loan pressure" would point at a debt that does not exist yet.
        if (
            (risk_analysis.get("estimated_new_emi") or 0) > 0
            and risk_analysis.get("risk_level_without_new_loan") != "high"
        ):
            next_step = (
                "The loan needed for the funding gap is too large for the monthly surplus. "
                "Plan a smaller start, or raise more of the money first."
            )
            next_step_code = "nxt.gapTooLarge"
        else:
            next_step = "Reduce repayment pressure before taking another loan."
            next_step_code = "nxt.reducePressure"
        priority = "high"
    elif household_check == "over_limit":
        # The same split as the branch above, on the household's income rather
        # than the business surplus. If the EMI already paid fits within half
        # of that income on its own, what takes it over is the estimated loan
        # for the funding gap, and "bring your repayments down" would point at a
        # loan that does not exist yet.
        if (
            (risk_analysis.get("estimated_new_emi") or 0) > 0
            and risk_analysis.get("household_check_without_new_loan") == "within_limit"
        ):
            next_step = (
                "A loan for the funding gap would take repayments above half of the "
                "household's monthly income. Plan a smaller start, or raise more of "
                "the money first."
            )
            next_step_code = "nxt.householdNewLoanOver"
        else:
            next_step = (
                "The household's current loan repayments already take more than half "
                "of its monthly income. Bring them down before taking another loan."
            )
            next_step_code = "nxt.householdOverLimit"
        priority = "high"
    elif feasibility != "feasible":
        next_step = "Review the business plan before investing more money."
        next_step_code = "nxt.reviewPlan"
        priority = "medium"
    elif funding_gap > 0:
        next_step = (
            "Decide how you will cover the funding gap before you start, "
            "and keep any loan small enough to repay."
        )
        next_step_code = "nxt.arrangeGap"
        priority = "medium"
    else:
        # The step is borrowed from the advisory list, so its code has to be
        # borrowed from the same index or the two would describe different advice.
        if recommendations:
            next_step = recommendations[0]
            next_step_code = (
                recommendation_codes[0] if recommendation_codes else None
            )
        else:
            # A guard, not a live branch: generate_advice appends a sentence for
            # every one of the three financial_status values financial_service can
            # produce, so a healthy business always arrives here with at least one
            # recommendation. Kept so next_step is never unbound if that changes.
            next_step = "Maintain your current financial discipline and monitor expenses."
            next_step_code = "nxt.maintainDiscipline"
        priority = "low"

    return {
        "status": status,
        "simple_message": message,
        "message_code": message_code,
        "next_step": next_step,
        "next_step_code": next_step_code,
        "priority": priority,
    }
