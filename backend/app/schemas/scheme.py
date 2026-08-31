from pydantic import BaseModel
from typing import List


class Scheme(BaseModel):
    name: str
    description: str
    target_segment: str
    business_categories: List[str]
    states: List[str]
    eligibility_rules: List[str]
    support_type: str
    documents: List[str]
    official_url: str
    last_verified: str


class SchemeMatchRequest(BaseModel):
    business_category: str
    state: str