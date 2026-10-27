from typing import Optional

from pydantic import BaseModel, Field

from app.schemas.limits import MAX_CATEGORY_LENGTH, MAX_PLACE_LENGTH, MAX_RUPEES


class AdvisoryRequest(BaseModel):
    # Capped, and no Infinity or NaN; see limits.py.
    available_capital: float = Field(..., ge=0, le=MAX_RUPEES, allow_inf_nan=False)
    monthly_expenses: float = Field(..., ge=0, le=MAX_RUPEES, allow_inf_nan=False)
    expected_monthly_revenue: float = Field(..., ge=0, le=MAX_RUPEES, allow_inf_nan=False)
    monthly_emi: float = Field(..., ge=0, le=MAX_RUPEES, allow_inf_nan=False)

    # The household's own monthly income, from all sources, used to check that
    # its loan repayments stay within half of it (see risk_service). Optional,
    # and None when it was not given, never 0: a 0 would be a real answer, "the
    # household earns nothing", and would put any loan over the limit.
    household_monthly_income: float | None = Field(
        default=None, ge=0, le=MAX_RUPEES, allow_inf_nan=False
    )

    # Capped like every text field; see limits.py.
    state: Optional[str] = Field(default=None, max_length=MAX_PLACE_LENGTH)
    district: Optional[str] = Field(default=None, max_length=MAX_PLACE_LENGTH)
    business_category: Optional[str] = Field(default=None, max_length=MAX_CATEGORY_LENGTH)