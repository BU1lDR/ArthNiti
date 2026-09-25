from fastapi import APIRouter

from app.schemas.analysis import (
    UnifiedAnalysisRequest,
    UnifiedAnalysisResponse,
)
from app.services.analysis_service import run_unified_analysis


router = APIRouter(
    prefix="/api/analysis",
    tags=["Analysis"],
)


@router.post(
    "/run",
    response_model=UnifiedAnalysisResponse,
)
def run_analysis(
    request: UnifiedAnalysisRequest,
):
    result = run_unified_analysis(
        business_category=request.business_category,
        state=request.state,
        available_capital=request.available_capital,
        monthly_expenses=request.monthly_expenses,
        expected_monthly_revenue=request.expected_monthly_revenue,
        monthly_emi=request.monthly_emi,
        initial_investment=request.initial_investment,
        monthly_operating_expenses=request.monthly_operating_expenses,
        employees=request.employees,
        existing_debt=request.existing_debt,
        user_language=request.user_language,
        preferred_dialect=request.preferred_dialect,
        literacy_level=request.literacy_level,
        entrepreneur_type=request.entrepreneur_type,
        location_type=request.location_type,
        district=request.district,
        village=request.village,
        market_type=request.market_type,
        customers=request.customers,
        household_monthly_income=request.household_monthly_income,
    )

    return result