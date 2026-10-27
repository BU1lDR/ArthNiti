from pydantic import BaseModel, Field
from typing import List

from app.schemas.limits import MAX_CATEGORY_LENGTH, MAX_ENUM_LENGTH, MAX_PLACE_LENGTH


class Scheme(BaseModel):
    name: str
    description: str
    target_segment: str
    business_categories: List[str]
    states: List[str]
    # Rural, semi-urban or urban, or ["ALL"]. Defaulted for the same reason as
    # `level`: a scheme dict written before the field existed must still load.
    location_types: List[str] = ["ALL"]
    # Which layer of government runs the scheme: central, state, regional,
    # district, sub_district, block or local_body. Defaulted rather than
    # required so a scheme dict written before this field existed still loads.
    level: str = "central"
    eligibility_rules: List[str]
    support_type: str
    documents: List[str]
    # No official_url. The app deliberately does not link a reader out to a
    # scheme's own government portal, so the field is not carried through the
    # data, the response or the UI. Don't re-add it here: a response_model
    # filters silently, so declaring it would be the first step to it
    # reappearing on a card with nothing reporting the change.
    last_verified: str


class SchemeMatchRequest(BaseModel):
    # Capped like every text field; see limits.py.
    business_category: str = Field(max_length=MAX_CATEGORY_LENGTH)
    state: str = Field(max_length=MAX_PLACE_LENGTH)
    # Optional, and empty means "do not filter on it" rather than "nowhere" — a
    # caller that does not know whether the entrepreneur is rural or urban must
    # still be shown the schemes that are open to both.
    location_type: str = Field(default="", max_length=MAX_ENUM_LENGTH)