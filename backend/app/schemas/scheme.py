from pydantic import BaseModel
from typing import List


class Scheme(BaseModel):
    name: str
    description: str
    target_segment: str
    business_categories: List[str]
    states: List[str]
    # Which layer of government runs the scheme: central, state, regional,
    # district, sub_district, block or local_body. Defaulted rather than
    # required so a scheme dict written before this field existed still loads.
    level: str = "central"
    eligibility_rules: List[str]
    support_type: str
    documents: List[str]
    official_url: str
    last_verified: str


class SchemeMatchRequest(BaseModel):
    business_category: str
    state: str