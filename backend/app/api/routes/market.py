from fastapi import APIRouter, HTTPException

from app.schemas.market import MarketContext, MarketContextRequest
from app.services.market_service import get_market_context


router = APIRouter(
    prefix="/api/market",
    tags=["Market"],
)


@router.post(
    "/context",
    response_model=list[MarketContext],
    response_model_exclude_unset=True,
)
def market_context(request: MarketContextRequest):
    matches = get_market_context(
        request.state,
        request.district,
        request.business_category,
    )

    if not matches:
        raise HTTPException(
            status_code=404,
            detail="No market data found for the requested location and business category.",
        )

    return matches