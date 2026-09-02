from fastapi import APIRouter

from app.schemas.business import (
    BusinessAnalysisRequest,
    BusinessAnalysisResponse,
)
from app.services.business_service import calculate_business_analysis


router = APIRouter(
    prefix="/api/business",
    tags=["Business"],
)


@router.post(
    "/analyze",
    response_model=BusinessAnalysisResponse,
)
def analyze_business(
    request: BusinessAnalysisRequest,
):
    result = calculate_business_analysis(
        business_type=request.business_type,
        initial_investment=request.initial_investment,
        expected_monthly_revenue=request.expected_monthly_revenue,
        monthly_operating_expenses=request.monthly_operating_expenses,
        employees=request.employees,
        existing_debt=request.existing_debt,
    )

    return result