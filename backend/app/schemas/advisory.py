from pydantic import BaseModel, Field


class AdvisoryRequest(BaseModel):
    available_capital: float = Field(..., ge=0)
    monthly_expenses: float = Field(..., ge=0)
    expected_monthly_revenue: float = Field(..., ge=0)