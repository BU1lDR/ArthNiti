from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.limits import MAX_CATEGORY_LENGTH, MAX_PLACE_LENGTH


class MarketContextRequest(BaseModel):
    # Capped like every text field; see limits.py.
    state: str = Field(min_length=1, max_length=MAX_PLACE_LENGTH)
    district: str = Field(min_length=1, max_length=MAX_PLACE_LENGTH)
    business_category: str = Field(min_length=1, max_length=MAX_CATEGORY_LENGTH)


class Provenance(BaseModel):
    """Where a row's figure came from, and the terms it is used under.

    Every field the fetch writes is declared, and anything else is dropped
    (extra="ignore"), so a raw API record or a debugging field that got into the
    data file never reaches a client. Not "forbid": that would turn the same
    drift into a 500 for every caller, and the file guards in
    tests/test_market_data_guards.py already refuse such a file.
    test_the_provenance_model_declares_every_provenance_key keeps this list and
    the guard's PROVENANCE_KEYS the same, so a new provenance field needs both.
    """

    model_config = ConfigDict(extra="ignore")

    resource_id: str
    resource_title: str
    publisher: str
    resource_updated_date: dict[str, str]
    page_url: str
    query: str
    total_reported: int
    rows_fetched: int
    rows_used: int
    rows_dropped: dict[str, int]
    fetched_at: str
    period_start: Optional[str]
    period_end: str
    method: str
    nic_map_version: Optional[int]
    crosswalk_version: int
    script_sha256: str
    licence: str
    licence_url: str
    attribution: str


class MarketContext(BaseModel):
    # Common to every row, whichever metric it carries.
    state: str
    district: str
    business_category: str
    scope: str
    metric: str
    source: str
    source_code: str
    last_verified: str
    provenance: Provenance

    # Optional on every row, and always as a pair when present.
    note_code: Optional[str] = None
    note: Optional[str] = None

    # metric "wholesale_price_per_kg" only.
    commodity: Optional[str] = None
    commodity_id: Optional[str] = None
    unit: Optional[str] = None
    indicative_price: Optional[float] = Field(default=None, ge=0)
    price_low: Optional[float] = Field(default=None, ge=0)
    price_high: Optional[float] = Field(default=None, ge=0)
    n_days: Optional[int] = None
    n_markets: Optional[int] = None
    last_reported: Optional[str] = None
    stale: Optional[bool] = None

    # metric "registered_units" only.
    count: Optional[int] = None
    count_suppressed: Optional[bool] = None
    share_percent: Optional[float] = None
    district_total: Optional[int] = None
    nic_classes: Optional[list[str]] = None

    # These two were computed by market_service and then silently dropped on the
    # way out: a response_model FILTERS the returned dict to its own fields, so a
    # key the model does not declare never reaches the client and nothing warns.
    #
    # match_level is the honesty marker on the whole hyperlocal claim. "district"
    # means this row is the entrepreneur's own district; "state" means we had no
    # row for their district and fell back to a figure for the whole state. A
    # consumer that cannot see it has no way to tell the two apart and will
    # present a state-level figure as a local one — which is exactly the
    # overclaim the field exists to prevent.
    #
    # The same filtering is why every row field above is declared, and why the
    # route uses response_model_exclude_unset=True. The two metrics carry
    # different fields, so most of them have to be Optional; without
    # exclude_unset, each Optional field a row does not carry would come back as
    # an explicit null, and a price row would arrive with "count": null,
    # "count_suppressed": null and so on. That is not the same row: a null
    # `count` on a count row means "suppressed", and a client reading it off a
    # price row would be told something the data never said. exclude_unset
    # returns exactly the keys the service returned, and a null the row does
    # carry (a suppressed count, an aggregate row's share) is still sent,
    # because it was set.
    #
    # There is no local_context. Rows used to carry the village, market type
    # and customers from the request, echoed back unchanged. Nothing computed
    # from them, the frontend no longer sends them, and an echoed default looks
    # like the person's own answer, so the echo went, here and in the service
    # together (a required field the service stopped sending would be a 500).
    match_level: str
