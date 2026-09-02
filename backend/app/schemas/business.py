from pydantic import BaseModel, Field


class BusinessAnalysisRequest(BaseModel):
    business_type: str = Field(..., min_length=2)

    initial_investment: float = Field(..., ge=0)

    expected_monthly_revenue: float = Field(..., ge=0)

    monthly_operating_expenses: float = Field(..., ge=0)

    employees: int = Field(default=0, ge=0)

    existing_debt: float = Field(default=0, ge=0)


class BusinessAnalysisResponse(BaseModel):
    business_type: str

    initial_investment: float
    expected_monthly_revenue: float
    monthly_operating_expenses: float

    monthly_operating_surplus: float
    operating_margin_percent: float
    annual_operating_surplus: float
    estimated_roi_percent: float | None

    feasibility_status: str

    observations: list[str]