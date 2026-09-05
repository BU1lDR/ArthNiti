from fastapi import APIRouter, HTTPException

from app.schemas.market import MarketContext, MarketContextRequest
from app.services.market_service import get_market_context


router = APIRouter(
    prefix="/api/market",
    tags=["market"],
)


@router.post("/context", response_model=list[MarketContext])
def market_context(request: MarketContextRequest):
    matches = get_market_context(
        request.state,
        request.district,
        request.business_category,
    )

    if not matches:
        raise HTTPException(
            status_code=404,
            detail="No prototype market data found for the requested location and business category.",
        )

    return matches