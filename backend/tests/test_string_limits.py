"""Every text field a request can carry has a maximum length (schemas/limits.py).

Without one, a single request could carry megabytes in a field nothing reads,
and every copy of it (a log, a crash report) would too. The fields are read
from the apps' own OpenAPI documents, so a new route or a new text field is
checked the day it is added: test_every_string_in_every_request_body_has_max_length
fails on any string anywhere in a request body, nested or not, without a
maxLength.
"""

from typing import Literal

import pytest
from fastapi import FastAPI
from pydantic import BaseModel

from app.core.settings import load_settings
from app.main import create_app
from app.schemas.limits import MAX_TALK_TEXT
from deployment_fixtures import PRODUCTION, VALID_BODIES, client_for, request_strings
from intake_fixtures import AI_ON


# Development with consent required, so the analysis body is
# ConsentedAnalysisRequest and the consent fields are walked and posted too.
CONSENTED_DEV = {"ARTHNITI_REQUIRE_CONSENT": "true"}

client = client_for(CONSENTED_DEV)

# Fields with a pattern, where a run of one letter is not a valid value: a
# value exactly at the limit, and one a character over it.
PATTERNED = {
    "consent.notice_version": ("1" * 40, "1" * 41),
    "consent.language": ("abc-ABCD", "abc-ABCDE"),
    "consent.given_at": (
        "2026-09-25T10:15:30.1234567890123456789Z",
        "2026-09-25T10:15:30.12345678901234567890Z",
    ),
}


def _without_max_length(schema):
    # A string that is one of a list (a Literal) is as long as its longest
    # member and needs no limit.
    return sorted(
        f"{method.upper()} {path} {field}"
        for method, path, field, string in request_strings(schema)
        if "maxLength" not in string and "enum" not in string
    )


SETTINGS_TO_CHECK = {
    "development": {},
    "development, consent required": CONSENTED_DEV,
    "development, helper on": AI_ON,
    "production": PRODUCTION,
    "production, helper on": {**PRODUCTION, **AI_ON},
}


@pytest.mark.parametrize("environ", SETTINGS_TO_CHECK.values(), ids=SETTINGS_TO_CHECK.keys())
def test_every_string_in_every_request_body_has_max_length(environ):
    schema = create_app(load_settings(environ)).openapi()

    assert _without_max_length(schema) == []


def test_the_walker_is_not_vacuous():
    found = {
        (path, field): string["maxLength"]
        for _, path, field, string in request_strings(client.get("/openapi.json").json())
    }

    assert len(found) >= 28
    assert found[("/api/analysis/run", "consent.given_at")] == 40
    assert found[("/api/analysis/run", "consent.language")] == 8
    assert found[("/api/analysis/run", "business_category")] == 100
    # Optional (anyOf with null) and nested strings are found too.
    assert found[("/api/advisory/recommend", "district")] == 60
    assert found[("/api/analysis/run", "preferred_dialect")] == 40


def test_the_walker_reaches_the_helpers_text_when_it_is_on():
    found = {
        (path, field): string["maxLength"]
        for _, path, field, string in request_strings(create_app(load_settings(AI_ON)).openapi())
        if "maxLength" in string
    }

    assert found[("/api/intake/extract", "text")] == MAX_TALK_TEXT


def test_the_walker_reports_a_string_without_max_length():
    # The refuter: a route whose body has a bare str, one nested in a list and
    # one behind Optional must be reported, all three. A Literal is not.
    class Inner(BaseModel):
        note: str

    class Loose(BaseModel):
        name: str
        maybe: str | None = None
        inners: list[Inner] = []
        kind: Literal["a", "b"] = "a"

    loose = FastAPI()

    @loose.post("/loose")
    def take(body: Loose):
        return {}

    assert _without_max_length(loose.openapi()) == [
        "POST /loose inners[].note",
        "POST /loose maybe",
        "POST /loose name",
    ]


LIMIT_CASES = sorted(
    (path, field, string["maxLength"])
    for _, path, field, string in request_strings(client.get("/openapi.json").json())
)


def _body_with(path, field, value):
    body = {key: (dict(inner) if isinstance(inner, dict) else inner) for key, inner in VALID_BODIES[path].items()}
    target = body
    *parents, last = field.split(".")
    for parent in parents:
        target = target[parent]
    target[last] = value
    return body


def _values(field, limit):
    if field in PATTERNED:
        return PATTERNED[field]
    return "a" * limit, "a" * (limit + 1)


def test_every_route_with_a_string_has_a_valid_body():
    assert {path for path, _, _ in LIMIT_CASES} <= set(VALID_BODIES)


@pytest.mark.parametrize(("path", "field", "limit"), LIMIT_CASES, ids=[f"{p} {f}" for p, f, _ in LIMIT_CASES])
def test_each_limit_rejects_one_over_and_accepts_at_limit(path, field, limit):
    at_limit, over_limit = _values(field, limit)
    assert len(at_limit) == limit
    assert len(over_limit) == limit + 1

    at = client.post(path, json=_body_with(path, field, at_limit))
    over = client.post(path, json=_body_with(path, field, over_limit))

    # At the limit the field is not refused; the route may still answer 404
    # (no market row for a made-up state) but never 422.
    assert at.status_code != 422, at.text
    assert over.status_code == 422
    assert ["body", *field.split(".")] in [item["loc"] for item in over.json()["detail"]]
    # The refused text is not echoed back in the error.
    assert over_limit not in over.text
