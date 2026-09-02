from pydantic import BaseModel, Field


class UnifiedAnalysisRequest(BaseModel):
    # Entrepreneur / location information
    business_category: str = Field(..., min_length=2)
    state: str = Field(..., min_length=2)

    # Financial information
    available_capital: float = Field(..., ge=0)
    monthly_expenses: float = Field(..., ge=0)
    expected_monthly_revenue: float = Field(..., ge=0)

    # Loan / repayment information
    monthly_emi: float = Field(..., ge=0)

    # Business feasibility information
    initial_investment: float = Field(..., ge=0)
    monthly_operating_expenses: float = Field(..., ge=0)
    employees: int = Field(default=0, ge=0)
    existing_debt: float = Field(default=0, ge=0)


class UnifiedAnalysisResponse(BaseModel):
    financial_analysis: dict
    risk_analysis: dict
    business_analysis: dict
    scheme_matches: list[dict]
    advisory: dict