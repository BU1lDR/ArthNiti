from fastapi import APIRouter

from app.schemas.advisory import AdvisoryRequest
from app.services.advisory_service import generate_advice


router = APIRouter(
    prefix="/api/advisory",
    tags=["Advisory"]
)


@router.post("/recommend")
def recommend(data: AdvisoryRequest):
    advice = generate_advice(
        financial_status=data.financial_status,
        profit_margin_percent=data.profit_margin_percent,
        available_capital=data.available_capital
    )

    return {
        "success": True,
        "advisory": advice
    }