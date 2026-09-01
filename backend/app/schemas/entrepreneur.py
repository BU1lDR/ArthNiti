from pydantic import BaseModel, Field


class EntrepreneurProfile(BaseModel):
    name: str = Field(..., min_length=2)
    location: str = Field(..., min_length=2)
    business_type: str = Field(..., min_length=2)

    available_capital: float = Field(..., ge=0)
    monthly_expenses: float = Field(..., ge=0)
    expected_monthly_revenue_after_3_months: float = Field(..., ge=0)

    goals: str = Field(..., min_length=2)