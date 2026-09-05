from fastapi import APIRouter

from app.schemas.entrepreneur import EntrepreneurProfile
from app.services.entrepreneur_service import prepare_financial_inputs


router = APIRouter(
    prefix="/api/entrepreneur",
    tags=["Entrepreneur"]
)


@router.post("/profile")
def create_profile(profile: EntrepreneurProfile):

    financial_inputs = prepare_financial_inputs(profile)

    return {
        "success": True,
        "message": "Entrepreneur profile received successfully",
        "profile": profile,
        "financial_inputs": financial_inputs
    }