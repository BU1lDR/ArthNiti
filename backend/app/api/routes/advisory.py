from fastapi import APIRouter

from app.schemas.advisory import AdvisoryRequest
from app.services.financial_service import calculate_financial_metrics
from app.services.advisory_service import generate_advice
from app.services.risk_service import calculate_repayment_pressure
from app.services.market_service import get_market_context


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

    # This request carries no plan amount (no initial_investment), so there is
    # no funding gap to price as a new loan: estimated_new_emi is 0, the total
    # is the EMI entered, and the household check is the EMI-alone test. The
    # response says so in its own figures rather than guessing at a loan.
    risk_assessment = calculate_repayment_pressure(
        monthly_surplus=financial_metrics["monthly_profit"],
        monthly_emi=data.monthly_emi,
        household_monthly_income=data.household_monthly_income
    )

    advice = generate_advice(
        financial_status=financial_metrics["financial_status"],
        profit_margin_percent=financial_metrics["profit_margin_percent"],
        available_capital=financial_metrics["available_capital"],
        household_check=risk_assessment["household_check"],
        household_check_without_new_loan=risk_assessment["household_check_without_new_loan"]
    )

    market_context = []

    if data.state and data.district and data.business_category:
        market_context = get_market_context(
            data.state,
            data.district,
            data.business_category
        )

    return {
        "success": True,
        "financial_analysis": financial_metrics,
        "risk_assessment": risk_assessment,
        "advisory": advice,
        "market_context": market_context
    }