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

    # Simple overall status
    if financial_status == "profitable" and risk_level == "low":
        status = "good"
        message = "Your business situation looks positive."
    elif risk_level in {"medium", "high"}:
        status = "attention_needed"
        message = "Your business needs attention before taking additional financial risk."
    else:
        status = "review"
        message = "Review your business finances carefully before making the next decision."

    # Priority action
    if risk_level == "high":
        next_step = "Reduce repayment pressure before taking another loan."
        priority = "high"
    elif financial_status != "profitable":
        next_step = "Review expenses and find ways to improve monthly income."
        priority = "high"
    elif feasibility != "feasible":
        next_step = "Review the business plan before investing more money."
        priority = "medium"
    else:
        next_step = (
            recommendations[0]
            if recommendations
            else "Maintain your current financial discipline and monitor expenses."
        )
        priority = "low"

    return {
        "status": status,
        "simple_message": message,
        "next_step": next_step,
        "priority": priority,
        "language": user_language,
        "preferred_dialect": preferred_dialect,
        "literacy_level": literacy_level,
    }
