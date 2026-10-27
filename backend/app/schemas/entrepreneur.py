from pydantic import BaseModel, Field

from app.schemas.limits import MAX_GOALS_LENGTH, MAX_RUPEES, MAX_SHORT_TEXT


class EntrepreneurProfile(BaseModel):
    # Capped like every text field; see limits.py.
    name: str = Field(..., min_length=2, max_length=MAX_SHORT_TEXT)
    location: str = Field(..., min_length=2, max_length=MAX_SHORT_TEXT)
    business_type: str = Field(..., min_length=2, max_length=MAX_SHORT_TEXT)

    # Capped, and no Infinity or NaN; see limits.py.
    available_capital: float = Field(..., ge=0, le=MAX_RUPEES, allow_inf_nan=False)
    monthly_expenses: float = Field(..., ge=0, le=MAX_RUPEES, allow_inf_nan=False)
    expected_monthly_revenue_after_3_months: float = Field(
        ..., ge=0, le=MAX_RUPEES, allow_inf_nan=False
    )

    goals: str = Field(..., min_length=2, max_length=MAX_GOALS_LENGTH)