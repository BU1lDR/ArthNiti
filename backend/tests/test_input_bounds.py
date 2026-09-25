"""Every number a request can carry is finite and capped, and a bad one is a 422.

Before the caps, POST /api/analysis/run with expected_monthly_revenue set to
Infinity returned 200 with every derived figure null beside "profitable", "low"
risk and status "good", and a typed 1e308 did the same with real-looking
figures. -Infinity and NaN were 500s on every route, because FastAPI's own 422
handler echoes the rejected input into a JSON body that cannot hold it.

The routes and fields under test are read from the app's own OpenAPI document,
so a new route or a new numeric field is tested the day it is added, and
test_every_route_that_takes_a_number_has_a_valid_body fails until it has a
valid body below.
"""

import json
import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.limits import MAX_EMPLOYEES, MAX_RUPEES


client = TestClient(app)

REPO_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_LIMITS = REPO_ROOT / "frontend" / "src" / "data" / "limits.js"


# One otherwise valid body per route that takes a number, with every numeric
# field present, including the ones that have a default.
VALID_BODIES = {
    "/api/analysis/run": {
        "business_category": "tailoring",
        "state": "Uttar Pradesh",
        "district": "Lucknow",
        "available_capital": 50000,
        "monthly_expenses": 15000,
        "expected_monthly_revenue": 30000,
        "monthly_emi": 2000,
        "initial_investment": 100000,
        "monthly_operating_expenses": 18000,
        "employees": 2,
        "existing_debt": 10000,
        "household_monthly_income": 20000,
    },
    "/api/business/analyze": {
        "business_type": "tailoring",
        "initial_investment": 100000,
        "expected_monthly_revenue": 30000,
        "monthly_operating_expenses": 18000,
        "employees": 2,
        "existing_debt": 10000,
    },
    "/api/financial/analyze": {
        "available_capital": 50000,
        "monthly_expenses": 15000,
        "expected_monthly_revenue": 30000,
        "initial_investment": 100000,
    },
    "/api/advisory/recommend": {
        "available_capital": 50000,
        "monthly_expenses": 15000,
        "expected_monthly_revenue": 30000,
        "monthly_emi": 2000,
        "household_monthly_income": 20000,
        "state": "Uttar Pradesh",
        "district": "Lucknow",
        "business_category": "tailoring",
    },
    "/api/entrepreneur/profile": {
        "name": "Asha",
        "location": "Lucknow",
        "business_type": "tailoring",
        "available_capital": 50000,
        "monthly_expenses": 15000,
        "expected_monthly_revenue_after_3_months": 30000,
        "goals": "Open a second shop",
    },
}

# Every numeric field is rupees except these, which count people.
HEADCOUNT_FIELDS = {"employees"}

BAD_LITERALS = ["Infinity", "-Infinity", "NaN", "1e308"]


def _is_numeric(prop):
    if prop.get("type") in ("number", "integer"):
        return True

    return any(_is_numeric(option) for option in prop.get("anyOf", []))


def _numeric_option(prop):
    """The part of a field's schema that carries its number bounds.

    A required number is {type, maximum, minimum}. An optional one, such as
    household_monthly_income, is anyOf [{type: number, maximum, minimum},
    {type: null}], and the bounds sit on the number option, not at the top.
    """
    if prop.get("type") in ("number", "integer"):
        return prop

    for option in prop.get("anyOf", []):
        found = _numeric_option(option)
        if found is not None:
            return found

    return None


def _is_nullable(prop):
    return any(option.get("type") == "null" for option in prop.get("anyOf", []))


def _field_schema(path, field):
    schema = app.openapi()
    ref = schema["paths"][path]["post"]["requestBody"]["content"][
        "application/json"
    ]["schema"]["$ref"]

    return schema["components"]["schemas"][ref.rsplit("/", 1)[-1]]["properties"][field]


def _numeric_body_fields():
    schema = app.openapi()
    components = schema["components"]["schemas"]
    found = {}

    for path, operations in schema["paths"].items():
        for operation in operations.values():
            body = operation.get("requestBody")

            if not body:
                continue

            ref = body["content"]["application/json"]["schema"]["$ref"]
            model = components[ref.rsplit("/", 1)[-1]]
            fields = sorted(
                name
                for name, prop in model.get("properties", {}).items()
                if _is_numeric(prop)
            )

            if fields:
                found[path] = fields

    return found


NUMERIC_FIELDS = _numeric_body_fields()

FIELD_CASES = [
    (path, field)
    for path, fields in sorted(NUMERIC_FIELDS.items())
    for field in fields
]


def _cap(field):
    return MAX_EMPLOYEES if field in HEADCOUNT_FIELDS else MAX_RUPEES


def _post_with(path, field, literal):
    """Post the valid body for `path` with `field` set to raw JSON `literal`.

    Built as text, because Infinity and NaN are not JSON and json= would refuse
    or rewrite them. Python's parser, which FastAPI uses, accepts all three.
    """
    body = dict(VALID_BODIES[path])
    body[field] = "__BAD__"
    raw = json.dumps(body).replace('"__BAD__"', literal)

    return client.post(
        path,
        content=raw,
        headers={"content-type": "application/json"},
    )


def _refuse_constant(name):
    raise ValueError(f"non-finite constant {name} in a response body")


def _strict_json(text):
    return json.loads(text, parse_constant=_refuse_constant)


def _keys_anywhere(value):
    if isinstance(value, dict):
        for key, inner in value.items():
            yield key
            yield from _keys_anywhere(inner)
    elif isinstance(value, list):
        for inner in value:
            yield from _keys_anywhere(inner)


def _assert_clean_422(response, field):
    assert response.status_code == 422, response.text

    data = _strict_json(response.text)

    assert "input" not in set(_keys_anywhere(data))
    assert isinstance(data["detail"], list) and data["detail"]

    for item in data["detail"]:
        assert set(item) == {"type", "loc", "msg"}
        assert isinstance(item["loc"], list)

    # The frontend names the field to fix from the last element of loc.
    assert ["body", field] in [item["loc"] for item in data["detail"]]


def test_the_routes_that_take_a_number_are_the_five_expected():
    assert set(NUMERIC_FIELDS) == {
        "/api/analysis/run",
        "/api/business/analyze",
        "/api/financial/analyze",
        "/api/advisory/recommend",
        "/api/entrepreneur/profile",
    }


def test_every_route_that_takes_a_number_has_a_valid_body():
    assert set(NUMERIC_FIELDS) <= set(VALID_BODIES)

    for path, fields in NUMERIC_FIELDS.items():
        missing = set(fields) - set(VALID_BODIES[path])
        assert not missing, f"{path} valid body lacks {sorted(missing)}"


@pytest.mark.parametrize("path", sorted(VALID_BODIES))
def test_the_valid_bodies_are_valid(path):
    response = client.post(path, json=VALID_BODIES[path])

    assert response.status_code == 200, response.text


@pytest.mark.parametrize("path,field", FIELD_CASES)
def test_the_documented_maximum_is_the_cap(path, field):
    prop = _numeric_option(_field_schema(path, field))

    assert prop is not None
    assert prop["maximum"] == _cap(field)
    assert prop["minimum"] == 0


# The optional numbers. Only these may be sent as null; every other number is
# either required or has a numeric default, and null there is a 422.
NULLABLE_FIELDS = {
    ("/api/analysis/run", "household_monthly_income"),
    ("/api/advisory/recommend", "household_monthly_income"),
}


def test_the_nullable_numbers_are_the_expected_ones():
    assert {
        (path, field)
        for path, field in FIELD_CASES
        if _is_nullable(_field_schema(path, field))
    } == NULLABLE_FIELDS


@pytest.mark.parametrize("path,field", sorted(NULLABLE_FIELDS))
def test_a_nullable_number_accepts_null_and_omission(path, field):
    # The frontend sends null for a question left blank, never 0, because 0 is
    # a real answer. Both null and leaving the key out must be accepted.
    assert client.post(path, json=dict(VALID_BODIES[path], **{field: None})).status_code == 200

    omitted = {key: value for key, value in VALID_BODIES[path].items() if key != field}
    assert client.post(path, json=omitted).status_code == 200


@pytest.mark.parametrize("path,field", sorted(NULLABLE_FIELDS))
def test_a_nullable_number_still_refuses_a_negative(path, field):
    _assert_clean_422(_post_with(path, field, "-1"), field)


@pytest.mark.parametrize("literal", BAD_LITERALS)
@pytest.mark.parametrize("path,field", FIELD_CASES)
def test_a_non_finite_or_huge_number_is_a_clean_422(path, field, literal):
    _assert_clean_422(_post_with(path, field, literal), field)


@pytest.mark.parametrize("path,field", FIELD_CASES)
def test_one_over_the_cap_is_a_clean_422(path, field):
    _assert_clean_422(_post_with(path, field, str(_cap(field) + 1)), field)


@pytest.mark.parametrize("path,field", FIELD_CASES)
def test_exactly_the_cap_is_accepted(path, field):
    response = _post_with(path, field, str(_cap(field)))

    assert response.status_code == 200, response.text
    _strict_json(response.text)


@pytest.mark.parametrize("path", sorted(VALID_BODIES))
def test_every_field_at_the_cap_at_once_is_accepted(path):
    body = dict(VALID_BODIES[path])

    for field in NUMERIC_FIELDS[path]:
        body[field] = _cap(field)

    response = client.post(path, json=body)

    assert response.status_code == 200, response.text
    _strict_json(response.text)


@pytest.mark.parametrize(
    "raw",
    [
        "not json",
        "",
        "[1, 2]",
        '{"business_category": 1}',
    ],
)
def test_other_422s_carry_only_type_loc_and_msg(raw):
    response = client.post(
        "/api/analysis/run",
        content=raw,
        headers={"content-type": "application/json"},
    )

    assert response.status_code == 422
    data = _strict_json(response.text)

    assert data["detail"]
    for item in data["detail"]:
        assert set(item) == {"type", "loc", "msg"}


def test_a_short_text_field_still_names_itself():
    body = dict(VALID_BODIES["/api/analysis/run"], state="U")
    response = client.post("/api/analysis/run", json=body)

    assert response.status_code == 422
    data = _strict_json(response.text)

    assert ["body", "state"] in [item["loc"] for item in data["detail"]]
    assert "input" not in set(_keys_anywhere(data))


def _frontend_constant(source, name):
    match = re.search(
        rf"export\s+const\s+{name}\s*=\s*([0-9][0-9_]*)\s*(?:;|$)",
        source,
        re.MULTILINE,
    )

    assert match, f"{FRONTEND_LIMITS} does not export {name} as a plain number"

    return int(match.group(1).replace("_", ""))


def test_the_frontend_limits_match_the_backend():
    assert FRONTEND_LIMITS.is_file(), f"{FRONTEND_LIMITS} does not exist"

    source = FRONTEND_LIMITS.read_text(encoding="utf-8")

    assert MAX_RUPEES == 1_000_000_000
    assert MAX_EMPLOYEES == 10_000
    assert _frontend_constant(source, "MAX_RUPEES") == MAX_RUPEES
    assert _frontend_constant(source, "MAX_EMPLOYEES") == MAX_EMPLOYEES
