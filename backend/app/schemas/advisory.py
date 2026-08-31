from pydantic import BaseModel, Field


class AdvisoryRequest(BaseModel):
    financial_status: str
    profit_margin_percent: float
    available_capital: float = Field(..., ge=0)