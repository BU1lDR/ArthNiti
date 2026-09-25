from pydantic import BaseModel, Field

from app.schemas.limits import MAX_EMPLOYEES, MAX_RUPEES


class UnifiedAnalysisRequest(BaseModel):
    # Entrepreneur / location information
    business_category: str = Field(..., min_length=2)
    state: str = Field(..., min_length=2)

    # Every rupee field is capped and refuses Infinity and NaN, and the headcount
    # is capped; see limits.py for why.

    # Financial information
    available_capital: float = Field(..., ge=0, le=MAX_RUPEES, allow_inf_nan=False)
    monthly_expenses: float = Field(..., ge=0, le=MAX_RUPEES, allow_inf_nan=False)
    expected_monthly_revenue: float = Field(..., ge=0, le=MAX_RUPEES, allow_inf_nan=False)

    # Loan / repayment information
    monthly_emi: float = Field(..., ge=0, le=MAX_RUPEES, allow_inf_nan=False)

    # Business feasibility information
    initial_investment: float = Field(..., ge=0, le=MAX_RUPEES, allow_inf_nan=False)
    monthly_operating_expenses: float = Field(..., ge=0, le=MAX_RUPEES, allow_inf_nan=False)
    employees: int = Field(default=0, ge=0, le=MAX_EMPLOYEES)
    existing_debt: float = Field(default=0, ge=0, le=MAX_RUPEES, allow_inf_nan=False)

    # Household information
    # The household's own monthly income, from all sources, used to check that
    # its loan repayments stay within half of it (see risk_service). Optional,
    # and None when it was not given, never 0: a 0 would be a real answer, "the
    # household earns nothing", and would put any loan over the limit.
    household_monthly_income: float | None = Field(
        default=None, ge=0, le=MAX_RUPEES, allow_inf_nan=False
    )

    # Local / hyperlocal market context
    district: str = Field(default="")
    village: str = Field(default="")
    market_type: str = Field(default="")
    customers: str = Field(default="")

    # MVP accessibility and rural entrepreneur context
    user_language: str = Field(default="Hindi", min_length=2)
    preferred_dialect: str | None = Field(default=None, min_length=2)
    literacy_level: str = Field(default="low", min_length=2)
    entrepreneur_type: str | None = Field(default=None, min_length=2)
    location_type: str = Field(default="rural", min_length=2)


class UnifiedAnalysisResponse(BaseModel):
    financial_analysis: dict
    risk_analysis: dict
    business_analysis: dict
    market_context: list[dict]
    # Untyped on purpose, so every key match_schemes builds reaches the UI --
    # including fit_basis, which is what each scheme card is labelled with. If
    # this is ever given a typed model, declare fit_basis on it: a response_model
    # drops an undeclared key silently, which is how match_level once vanished.
    scheme_matches: list[dict]
    advisory: dict
    mvp_summary: dict