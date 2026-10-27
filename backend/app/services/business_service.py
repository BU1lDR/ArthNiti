def calculate_business_analysis(
    business_type: str,
    initial_investment: float,
    expected_monthly_revenue: float,
    monthly_operating_expenses: float,
    existing_debt: float = 0,
):
    """
    Calculate basic business feasibility metrics.

    There is no headcount parameter. One was accepted here and never read, which
    made it look as though the number of employees shaped the verdict.
    """

    # Monthly operating surplus
    monthly_operating_surplus = (
        expected_monthly_revenue - monthly_operating_expenses
    )

    # Operating margin. None, not 0, when there is no revenue — a margin is a
    # share OF revenue, so with no revenue there is no margin to report. Returning
    # 0 was the same defect financial_service.profit_margin_percent had: this
    # branch is reached exactly when someone has entered costs but no expected
    # income, which is the worst case, and "0%" reads on the page as break-even.
    # Matches estimated_roi_percent below, which already returned None for the
    # equivalent reason. The frontend's hasNumber() renders None as
    # "Not available" and a real 0 as "0%", so the two stay distinguishable.
    if expected_monthly_revenue > 0:
        operating_margin_percent = (
            monthly_operating_surplus / expected_monthly_revenue
        ) * 100
    else:
        operating_margin_percent = None

    # Annual operating surplus
    annual_operating_surplus = monthly_operating_surplus * 12

    # Estimated ROI
    if initial_investment > 0:
        estimated_roi_percent = (
            annual_operating_surplus / initial_investment
        ) * 100
    else:
        estimated_roi_percent = None

    # Feasibility status
    if monthly_operating_surplus > 0:
        feasibility_status = "feasible"
    elif monthly_operating_surplus == 0:
        feasibility_status = "break_even"
    else:
        feasibility_status = "not_feasible"

    # Observations. `observation_codes` is the translatable twin of
    # `observations` and is appended in lockstep — index i of one always
    # describes index i of the other.
    observations = []
    observation_codes = []

    if monthly_operating_surplus < 0:
        observations.append(
            "Projected monthly expenses are higher than expected revenue."
        )
        observation_codes.append("obs.expensesExceedRevenue")

    elif monthly_operating_surplus == 0:
        observations.append(
            "The business is projected to operate at break-even."
        )
        observation_codes.append("obs.breakEven")

    else:
        observations.append(
            "The business is projected to generate a positive monthly operating surplus."
        )
        observation_codes.append("obs.positiveSurplus")

    # Guard before comparing, the same way advisory_service does: `None < 10` is a
    # TypeError in Python 3, and there is nothing honest to say about the margin of
    # a business with no expected revenue. Saying "the operating margin is low"
    # would assert a margin exists; the surplus observation above has already named
    # the real problem.
    if operating_margin_percent is None:
        pass

    elif operating_margin_percent < 10:
        observations.append(
            "The operating margin is low. Consider reducing costs or increasing revenue."
        )
        observation_codes.append("obs.lowMargin")

    elif operating_margin_percent >= 30:
        observations.append(
            "The projected operating margin is healthy."
        )
        observation_codes.append("obs.healthyMargin")

    if existing_debt > 0:
        observations.append(
            "Existing debt should be considered before taking additional financing."
        )
        observation_codes.append("obs.existingDebt")

    return {
        "business_type": business_type,
        "initial_investment": round(initial_investment, 2),
        "expected_monthly_revenue": round(expected_monthly_revenue, 2),
        "monthly_operating_expenses": round(
            monthly_operating_expenses, 2
        ),
        "monthly_operating_surplus": round(
            monthly_operating_surplus, 2
        ),
        "operating_margin_percent": (
            round(operating_margin_percent, 2)
            if operating_margin_percent is not None
            else None
        ),
        "annual_operating_surplus": round(
            annual_operating_surplus, 2
        ),
        "estimated_roi_percent": (
            round(estimated_roi_percent, 2)
            if estimated_roi_percent is not None
            else None
        ),
        "feasibility_status": feasibility_status,
        "observations": observations,
        "observation_codes": observation_codes,
    }