from pydantic import BaseModel, Field

from app.schemas.limits import MAX_RUPEES


class EntrepreneurProfile(BaseModel):
    name: str = Field(..., min_length=2)
    location: str = Field(..., min_length=2)
    business_type: str = Field(..., min_length=2)

    # Capped, and no Infinity or NaN; see limits.py.
    available_capital: float = Field(..., ge=0, le=MAX_RUPEES, allow_inf_nan=False)
    monthly_expenses: float = Field(..., ge=0, le=MAX_RUPEES, allow_inf_nan=False)
    expected_monthly_revenue_after_3_months: float = Field(
        ..., ge=0, le=MAX_RUPEES, allow_inf_nan=False
    )

    goals: str = Field(..., min_length=2)