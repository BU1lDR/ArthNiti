from typing import Optional

from pydantic import BaseModel, Field


class AdvisoryRequest(BaseModel):
    available_capital: float = Field(..., ge=0)
    monthly_expenses: float = Field(..., ge=0)
    expected_monthly_revenue: float = Field(..., ge=0)
    monthly_emi: float = Field(..., ge=0)

    state: Optional[str] = None
    district: Optional[str] = None
    business_category: Optional[str] = None