def build_mvp_summary(
    financial_analysis: dict,
    risk_analysis: dict,
    business_analysis: dict,
    advisory: dict,
    user_language: str = "Hindi",
    preferred_dialect: str | None = None,
    literacy_level: str = "low",
):
    """
    Convert detailed backend analysis into a simple,
    action-oriented response suitable for rural and
    low-literacy entrepreneurs.
    """

    financial_status = financial_analysis.get("financial_status", "unknown")
    risk_level = risk_analysis.get("risk_level", "unknown")
    feasibility = business_analysis.get(
        "feasibility_status",
        business_analysis.get("feasibility", "unknown"),
    )

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
    if (
        financial_status == "profitable"
        and risk_level == "low"
        and feasibility == "feasible"
    ):
        status = "good"
        message = "Your business situation looks positive."
        message_code = "sum.positive"
    elif risk_level in {"moderate", "high"}:
        status = "attention_needed"
        message = "Your business needs attention before taking additional financial risk."
        message_code = "sum.needsAttention"
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
        next_step = "Reduce repayment pressure before taking another loan."
        next_step_code = "nxt.reducePressure"
        priority = "high"
    elif feasibility != "feasible":
        next_step = "Review the business plan before investing more money."
        next_step_code = "nxt.reviewPlan"
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
        "language": user_language,
        "preferred_dialect": preferred_dialect,
        "literacy_level": literacy_level,
    }
