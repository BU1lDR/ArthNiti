from pydantic import BaseModel, Field

from app.schemas.limits import MAX_CATEGORY_LENGTH, MAX_EMPLOYEES, MAX_RUPEES


class BusinessAnalysisRequest(BaseModel):
    # Capped like every text field; see limits.py.
    business_type: str = Field(..., min_length=2, max_length=MAX_CATEGORY_LENGTH)

    # Capped, and no Infinity or NaN; see limits.py.
    initial_investment: float = Field(..., ge=0, le=MAX_RUPEES, allow_inf_nan=False)

    expected_monthly_revenue: float = Field(..., ge=0, le=MAX_RUPEES, allow_inf_nan=False)

    monthly_operating_expenses: float = Field(..., ge=0, le=MAX_RUPEES, allow_inf_nan=False)

    # Still accepted and capped, for callers that send it, but the feasibility
    # check has never read the headcount.
    employees: int = Field(
        default=0,
        ge=0,
        le=MAX_EMPLOYEES,
        description="Accepted and ignored: nothing in the analysis reads it.",
    )

    existing_debt: float = Field(default=0, ge=0, le=MAX_RUPEES, allow_inf_nan=False)


class BusinessAnalysisResponse(BaseModel):
    business_type: str

    initial_investment: float
    expected_monthly_revenue: float
    monthly_operating_expenses: float

    monthly_operating_surplus: float
    # None when expected revenue is 0 — there is no revenue for a margin to be a
    # share of. Was declared plain `float`, which would now reject the service's
    # None outright as a response-validation error, the same shape as
    # estimated_roi_percent beside it.
    operating_margin_percent: float | None
    annual_operating_surplus: float
    estimated_roi_percent: float | None

    feasibility_status: str

    observations: list[str]
    # The translatable twin of `observations`, index-aligned with it. The service
    # has always returned this; the model omitted it, and a response_model filters
    # rather than warns, so every caller of this router got English-only prose
    # while the unified endpoint next door returned the codes.
    observation_codes: list[str]