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
    if financial_status == "profitable" and risk_level == "low":
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

    # Priority action
    if risk_level == "high":
        next_step = "Reduce repayment pressure before taking another loan."
        next_step_code = "nxt.reducePressure"
        priority = "high"
    elif financial_status != "profitable":
        next_step = "Review expenses and find ways to improve monthly income."
        next_step_code = "nxt.reviewExpenses"
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
