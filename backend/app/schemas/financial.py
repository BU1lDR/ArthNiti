from pydantic import BaseModel, Field

from app.schemas.limits import MAX_RUPEES


class FinancialAnalysisRequest(BaseModel):
    # Capped, and no Infinity or NaN; see limits.py.
    available_capital: float = Field(..., ge=0, le=MAX_RUPEES, allow_inf_nan=False)
    monthly_expenses: float = Field(..., ge=0, le=MAX_RUPEES, allow_inf_nan=False)
    expected_monthly_revenue: float = Field(..., ge=0, le=MAX_RUPEES, allow_inf_nan=False)
    initial_investment: float = Field(0, ge=0, le=MAX_RUPEES, allow_inf_nan=False)