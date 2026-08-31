from fastapi import APIRouter
from app.schemas.entrepreneur import EntrepreneurProfile

router = APIRouter(
    prefix="/api/entrepreneur",
    tags=["Entrepreneur"]
)


@router.post("/profile")
def create_profile(profile: EntrepreneurProfile):
    return {
        "success": True,
        "message": "Entrepreneur profile received successfully",
        "profile": profile
    }