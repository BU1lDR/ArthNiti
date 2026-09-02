from pydantic import BaseModel, Field


class MarketContextRequest(BaseModel):
    state: str = Field(min_length=1)
    district: str = Field(min_length=1)
    business_category: str = Field(min_length=1)


class MarketContext(BaseModel):
    state: str
    district: str
    business_category: str
    indicative_price: float = Field(ge=0)
    demand_indicator: str
    seasonality: str
    source: str
    last_verified: str