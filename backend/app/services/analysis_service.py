from app.services.financial_service import calculate_financial_metrics
from app.services.risk_service import calculate_repayment_pressure
from app.services.business_service import calculate_business_analysis
from app.services.market_service import get_market_context
from app.services.scheme_service import match_schemes
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
    employees: int = 0,
    existing_debt: float = 0,
    user_language: str = "Hindi",
    preferred_dialect: str | None = None,
    literacy_level: str = "low",
    entrepreneur_type: str | None = None,
    location_type: str = "rural",
    district: str = "",
    village: str = "",
    market_type: str = "",
    customers: str = "",
):
    """
    Run all available business advisory engines and
    combine their results into one unified response.

    The unified pipeline includes:
    - Financial analysis
    - Risk analysis
    - Business feasibility analysis
    - Hyperlocal market context
    - Government scheme matching
    - Advisory generation
    - Low-literacy-friendly MVP summary
    """

    # 1. Financial analysis
    financial_analysis = calculate_financial_metrics(
        available_capital=available_capital,
        monthly_expenses=monthly_expenses,
        expected_monthly_revenue=expected_monthly_revenue,
    )

    # 2. Risk analysis
    risk_analysis = calculate_repayment_pressure(
        monthly_surplus=financial_analysis["monthly_profit"],
        monthly_emi=monthly_emi,
    )

    # 3. Business feasibility analysis
    business_analysis = calculate_business_analysis(
        business_type=business_category,
        initial_investment=initial_investment,
        expected_monthly_revenue=expected_monthly_revenue,
        monthly_operating_expenses=monthly_operating_expenses,
        employees=employees,
        existing_debt=existing_debt,
    )

    # 4. Hyperlocal market context
    market_context = get_market_context(
        state=state,
        district=district,
        business_category=business_category,
        village=village,
        market_type=market_type,
        customers=customers,
    )

    # 5. Government scheme matching
    scheme_matches = match_schemes(
        business_category=business_category,
        state=state,
    )

    # 6. Advisory generation
    advisory = generate_advice(
        financial_status=financial_analysis["financial_status"],
        profit_margin_percent=financial_analysis["profit_margin_percent"],
        available_capital=available_capital,
    )

    # 7. Low-literacy-friendly MVP summary
    mvp_summary = build_mvp_summary(
        financial_analysis=financial_analysis,
        risk_analysis=risk_analysis,
        business_analysis=business_analysis,
        advisory=advisory,
        user_language=user_language,
        preferred_dialect=preferred_dialect,
        literacy_level=literacy_level,
    )

    # Additional context for personalization
    mvp_summary["entrepreneur_type"] = entrepreneur_type
    mvp_summary["location_type"] = location_type

    return {
        "financial_analysis": financial_analysis,
        "risk_analysis": risk_analysis,
        "business_analysis": business_analysis,
        "market_context": market_context,
        "scheme_matches": scheme_matches,
        "advisory": advisory,
        "mvp_summary": mvp_summary,
    }