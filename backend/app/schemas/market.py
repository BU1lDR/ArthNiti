from pydantic import BaseModel, Field


class MarketContextRequest(BaseModel):
    state: str = Field(min_length=1)
    district: str = Field(min_length=1)
    business_category: str = Field(min_length=1)


class LocalContext(BaseModel):
    """The free-text detail the entrepreneur gave about where they sell.

    Echoed back rather than computed. Defaults to empty strings because
    /api/market/context does not collect it — only the unified analysis run does.
    """

    village: str = ""
    market_type: str = ""
    customers: str = ""


class MarketContext(BaseModel):
    state: str
    district: str
    business_category: str
    indicative_price: float = Field(ge=0)
    demand_indicator: str
    seasonality: str
    source: str
    last_verified: str

    # These two were computed by market_service and then silently dropped on the
    # way out: a response_model FILTERS the returned dict to its own fields, so a
    # key the model does not declare never reaches the client and nothing warns.
    #
    # match_level is the honesty marker on the whole hyperlocal claim. "district"
    # means this row is the entrepreneur's own district; "state" means we had no
    # row for their district and fell back to the same state. A consumer that
    # cannot see it has no way to tell the two apart and will present a
    # state-level average as a local one — which is exactly the overclaim the
    # field exists to prevent.
    match_level: str
    local_context: LocalContext
