from fastapi import APIRouter

from app.schemas.advisory import AdvisoryRequest
from app.services.financial_service import calculate_financial_metrics
from app.services.advisory_service import generate_advice
from app.services.risk_service import calculate_repayment_pressure


router = APIRouter(
    prefix="/api/advisory",
    tags=["Advisory"]
)


@router.post("/recommend")
def recommend(data: AdvisoryRequest):

    financial_metrics = calculate_financial_metrics(
        available_capital=data.available_capital,
        monthly_expenses=data.monthly_expenses,
        expected_monthly_revenue=data.expected_monthly_revenue
    )

    risk_assessment = calculate_repayment_pressure(
        monthly_surplus=financial_metrics["monthly_profit"],
        monthly_emi=data.monthly_emi
    )

    advice = generate_advice(
        financial_status=financial_metrics["financial_status"],
        profit_margin_percent=financial_metrics["profit_margin_percent"],
        available_capital=financial_metrics["available_capital"]
    )

    return {
        "success": True,
        "financial_analysis": financial_metrics,
        "risk_assessment": risk_assessment,
        "advisory": advice
    }