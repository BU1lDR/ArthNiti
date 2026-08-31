from fastapi import APIRouter

from app.schemas.scheme import SchemeMatchRequest
from app.services.scheme_service import match_schemes


router = APIRouter(
    prefix="/api/schemes",
    tags=["Schemes"]
)


@router.post("/match")
def match_scheme_endpoint(data: SchemeMatchRequest):
    matches = match_schemes(
        business_category=data.business_category,
        state=data.state
    )

    return {
        "success": True,
        "count": len(matches),
        "matches": matches
    }