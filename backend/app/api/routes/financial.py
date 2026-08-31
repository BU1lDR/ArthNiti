from fastapi import APIRouter

from app.schemas.financial import FinancialAnalysisRequest
from app.services.financial_service import calculate_financial_metrics


router = APIRouter(
    prefix="/api/financial",
    tags=["Financial"]
)


@router.post("/analyze")
def analyze_financials(data: FinancialAnalysisRequest):
    metrics = calculate_financial_metrics(
        available_capital=data.available_capital,
        monthly_expenses=data.monthly_expenses,
        expected_monthly_revenue=data.expected_monthly_revenue
    )

    return {
        "success": True,
        "financial_analysis": metrics
    }