from typing import Annotated

from pydantic import (
    AfterValidator,
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    TypeAdapter,
    ValidationError,
)

from app.schemas.limits import (
    MAX_CATEGORY_LENGTH,
    MAX_CODE_LENGTH,
    MAX_EMPLOYEES,
    MAX_ENUM_LENGTH,
    MAX_LANGUAGE_CODE_LENGTH,
    MAX_LONG_TEXT,
    MAX_NOTICE_VERSION_LENGTH,
    MAX_PLACE_LENGTH,
    MAX_RUPEES,
    MAX_SHORT_TEXT,
    MAX_TIMESTAMP_LENGTH,
)


# The request fields the analysis accepts and then ignores. Each one used to be
# either unread (employees) or only echoed back unchanged in the response, and
# the frontend no longer sends them. They are still accepted, validated and
# capped, because other API callers send them, but nothing reads them: the route
# forwards every other field and drops these. tests/test_mvp_api_contract.py
# shares this set with the route.
IGNORED_FIELDS = frozenset(
    {
        "employees",
        "village",
        "market_type",
        "customers",
        "user_language",
        "preferred_dialect",
        "literacy_level",
        "entrepreneur_type",
    }
)

_IGNORED = "Accepted and ignored: nothing in the analysis reads it, and it is not echoed."


# A date, a time and an offset ("Z" or "+05:30"), in ASCII digits, the way
# JavaScript's toISOString() writes it. The pattern refuses what a datetime
# parser alone would accept and a person could not read as a moment: a Unix
# time, as a number or as digits in a string, and a date or time with no offset.
_TIMESTAMP = (
    r"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]+)?)?"
    r"(Z|[+-][0-9]{2}:[0-9]{2})$"
)

_AWARE_DATETIME = TypeAdapter(AwareDatetime)


def _real_moment(value):
    # The pattern checks the shape; this checks the date and time exist (no
    # 31 September, no 25:00). The text is kept as it was sent, so the log line
    # records what the browser wrote, not pydantic's re-rendering of it. Parsing
    # is left to pydantic, not datetime.fromisoformat, which refuses a trailing
    # "Z" on Python 3.10.
    try:
        _AWARE_DATETIME.validate_python(value)
    except ValidationError:
        raise ValueError("not a real date and time") from None
    return value


GivenAt = Annotated[
    str,
    Field(
        max_length=MAX_TIMESTAMP_LENGTH,
        pattern=_TIMESTAMP,
        json_schema_extra={"format": "date-time"},
    ),
    AfterValidator(_real_moment),
]


class Consent(BaseModel):
    """What the person agreed to before the answers were sent, and when.

    Written to this request's processing log line (core/processing_log.py) and
    never returned in the response. `age_confirmed` is recorded as sent: the
    server does not check it or refuse a request on it.
    """

    model_config = ConfigDict(extra="forbid")

    notice_version: str = Field(
        min_length=1,
        max_length=MAX_NOTICE_VERSION_LENGTH,
        pattern=r"^[0-9A-Za-z.\-]+$",
    )
    # The UI language code the notice was shown in ("hi", "en", ...).
    language: str = Field(
        min_length=2,
        max_length=MAX_LANGUAGE_CODE_LENGTH,
        pattern=r"^[a-z]{2,3}(-[A-Za-z0-9]{2,4})?$",
    )
    given_at: GivenAt
    age_confirmed: bool | None = None


class UnifiedAnalysisRequest(BaseModel):
    # Entrepreneur / location information
    business_category: str = Field(..., min_length=2, max_length=MAX_CATEGORY_LENGTH)
    state: str = Field(..., min_length=2, max_length=MAX_PLACE_LENGTH)

    # Every rupee field is capped and refuses Infinity and NaN, and the headcount
    # is capped; see limits.py for why. Every text field is capped as well.

    # Financial information
    available_capital: float = Field(..., ge=0, le=MAX_RUPEES, allow_inf_nan=False)
    monthly_expenses: float = Field(..., ge=0, le=MAX_RUPEES, allow_inf_nan=False)
    expected_monthly_revenue: float = Field(..., ge=0, le=MAX_RUPEES, allow_inf_nan=False)

    # Loan / repayment information
    monthly_emi: float = Field(..., ge=0, le=MAX_RUPEES, allow_inf_nan=False)

    # Business feasibility information
    initial_investment: float = Field(..., ge=0, le=MAX_RUPEES, allow_inf_nan=False)
    monthly_operating_expenses: float = Field(..., ge=0, le=MAX_RUPEES, allow_inf_nan=False)
    employees: int = Field(default=0, ge=0, le=MAX_EMPLOYEES, description=_IGNORED)
    existing_debt: float = Field(default=0, ge=0, le=MAX_RUPEES, allow_inf_nan=False)

    # Household information
    # The household's own monthly income, from all sources, used to check that
    # its loan repayments stay within half of it (see risk_service). Optional,
    # and None when it was not given, never 0: a 0 would be a real answer, "the
    # household earns nothing", and would put any loan over the limit.
    household_monthly_income: float | None = Field(
        default=None, ge=0, le=MAX_RUPEES, allow_inf_nan=False
    )

    # Local / hyperlocal market context
    district: str = Field(default="", max_length=MAX_PLACE_LENGTH)
    village: str = Field(default="", max_length=MAX_SHORT_TEXT, description=_IGNORED)
    market_type: str = Field(default="", max_length=MAX_SHORT_TEXT, description=_IGNORED)
    customers: str = Field(default="", max_length=MAX_LONG_TEXT, description=_IGNORED)

    # Accessibility and entrepreneur context, all accepted and ignored except
    # location_type, which decides which schemes are open to the reader.
    user_language: str = Field(
        default="Hindi", min_length=2, max_length=MAX_CODE_LENGTH, description=_IGNORED
    )
    preferred_dialect: str | None = Field(
        default=None, min_length=2, max_length=MAX_CODE_LENGTH, description=_IGNORED
    )
    literacy_level: str = Field(
        default="low", min_length=2, max_length=MAX_ENUM_LENGTH, description=_IGNORED
    )
    entrepreneur_type: str | None = Field(
        default=None, min_length=2, max_length=MAX_CODE_LENGTH, description=_IGNORED
    )
    location_type: str = Field(default="rural", min_length=2, max_length=MAX_ENUM_LENGTH)

    # The record of what the person agreed to. Optional here; required by
    # ConsentedAnalysisRequest, which the route uses when ARTHNITI_REQUIRE_CONSENT
    # is on (the default in production). Logged, never forwarded to the analysis
    # and never echoed.
    consent: Consent | None = Field(
        default=None,
        description=(
            "What the person agreed to and when. Written to this request's "
            "processing log line; never returned in the response."
        ),
    )


class ConsentedAnalysisRequest(UnifiedAnalysisRequest):
    # The same request with the consent record required: a request without one
    # is a 422 whose loc is ["body", "consent"].
    consent: Consent = Field(
        description=(
            "What the person agreed to and when. Required by this deployment. "
            "Written to this request's processing log line; never returned in "
            "the response."
        ),
    )


class UnifiedAnalysisResponse(BaseModel):
    financial_analysis: dict
    risk_analysis: dict
    financing_options: dict
    business_analysis: dict
    market_context: list[dict]
    # Untyped on purpose, so every key match_schemes builds reaches the UI --
    # including fit_basis, which is what each scheme card is labelled with. If
    # this is ever given a typed model, declare fit_basis on it: a response_model
    # drops an undeclared key silently, which is how match_level once vanished.
    scheme_matches: list[dict]
    scheme_funding: dict
    compliance: dict
    advisory: dict
    mvp_summary: dict
