from app.services.financial_service import calculate_financial_metrics
from app.services.risk_service import calculate_repayment_pressure
from app.services.options_service import build_financing_options
from app.services.business_service import calculate_business_analysis
from app.services.market_service import get_market_context
from app.services.scheme_service import match_schemes
from app.services.structuring_service import build_scheme_funding
from app.services.compliance_service import build_compliance
from app.services.advisory_service import generate_advice
from app.services.mvp_service import build_mvp_summary


def run_unified_analysis(
    business_category: str,
    state: str,
    available_capital: float,
    monthly_expenses: float,
    expected_monthly_revenue: float,
    monthly_emi: float,
    initial_investment: float,
    monthly_operating_expenses: float,
    existing_debt: float = 0,
    location_type: str = "rural",
    district: str = "",
    household_monthly_income: float | None = None,
):
    """
    Run all available business advisory engines and
    combine their results into one unified response.

    The unified pipeline includes:
    - Financial analysis
    - Risk analysis
    - Financing options for the funding gap
    - Business feasibility analysis
    - Hyperlocal market context
    - Government scheme matching
    - What the matched schemes ask the reader to put in, and what they pay
    - The registrations to ask about (Udyam, the local office, FSSAI, GST)
    - Advisory generation
    - Low-literacy-friendly MVP summary

    Every parameter changes the result. The request still accepts eight more
    fields (schemas/analysis.py IGNORED_FIELDS) that nothing here read, or that
    were only echoed back; the route drops those before calling this.
    """

    # 1. Financial analysis
    financial_analysis = calculate_financial_metrics(
        available_capital=available_capital,
        monthly_expenses=monthly_expenses,
        expected_monthly_revenue=expected_monthly_revenue,
        initial_investment=initial_investment,
    )

    # 2. Risk analysis
    risk_analysis = calculate_repayment_pressure(
        monthly_surplus=financial_analysis["monthly_profit"],
        monthly_emi=monthly_emi,
        funding_gap=financial_analysis["funding_gap"],
        # The household's own monthly income, from all sources, or None when it
        # was not given. It is checked against the same total repayment as the
        # pressure figure; see risk_service for the RBI rule and its limits.
        household_monthly_income=household_monthly_income,
    )

    # 2b. Financing options for the funding gap. Priced through the same
    # function as step 2, so the 60-month option is the loan step 2 prices.
    financing_options = build_financing_options(
        monthly_surplus=financial_analysis["monthly_profit"],
        monthly_emi=monthly_emi,
        funding_gap=financial_analysis["funding_gap"],
        household_monthly_income=household_monthly_income,
    )

    # 3. Business feasibility analysis
    business_analysis = calculate_business_analysis(
        business_type=business_category,
        initial_investment=initial_investment,
        expected_monthly_revenue=expected_monthly_revenue,
        monthly_operating_expenses=monthly_operating_expenses,
        existing_debt=existing_debt,
    )

    # 4. Hyperlocal market context
    market_context = get_market_context(
        state=state,
        district=district,
        business_category=business_category,
    )

    # 5. Government scheme matching
    scheme_matches = match_schemes(
        business_category=business_category,
        state=state,
        # /location has always asked whether the work is rural, semi-urban or
        # urban, and this was the only consumer that could act on the answer.
        # Passing it drops the handful of schemes whose own eligibility text
        # rules the entrepreneur's kind of place out.
        location_type=location_type,
    )

    # 5b. For the PMEGP, PMFME and Mudra matches only: the own money each asks
    # for, the subsidy it pays and what is left to borrow, from the terms the
    # schemes publish (structuring_service). Priced from the same two figures as
    # the funding gap, so the Mudra loan is the gap the analysis already shows.
    scheme_funding = build_scheme_funding(
        project_cost=initial_investment,
        money_in_hand=available_capital,
        location_type=location_type,
        matched_scheme_ids=[match["scheme_id"] for match in scheme_matches],
    )

    # 5c. The registrations to ask about (Udyam, the local office, FSSAI, GST),
    # from published limits tested against the expected yearly sales: the monthly
    # sales asked for, times 12 (compliance_service).
    compliance = build_compliance(
        business_category=business_category,
        state=state,
        location_type=location_type,
        yearly_sales=round(expected_monthly_revenue * 12, 2),
        scheme_matches=scheme_matches,
    )

    # 6. Advisory generation
    advisory = generate_advice(
        financial_status=financial_analysis["financial_status"],
        profit_margin_percent=financial_analysis["profit_margin_percent"],
        available_capital=available_capital,
        funding_gap=financial_analysis["funding_gap"],
        household_check=risk_analysis["household_check"],
        household_check_without_new_loan=risk_analysis["household_check_without_new_loan"],
    )

    # 7. Low-literacy-friendly MVP summary
    mvp_summary = build_mvp_summary(
        financial_analysis=financial_analysis,
        risk_analysis=risk_analysis,
        business_analysis=business_analysis,
        advisory=advisory,
    )

    # The one answer the summary still carries back: it is sent, and it decided
    # which schemes are open to the reader.
    mvp_summary["location_type"] = location_type

    return {
        "financial_analysis": financial_analysis,
        "risk_analysis": risk_analysis,
        "financing_options": financing_options,
        "business_analysis": business_analysis,
        "market_context": market_context,
        "scheme_matches": scheme_matches,
        "scheme_funding": scheme_funding,
        "compliance": compliance,
        "advisory": advisory,
        "mvp_summary": mvp_summary,
    }