"""Settings, bodies and a consent record shared by the deployment tests.

Each app here is built with create_app(load_settings({...})), so it never reads
the process environment (see conftest.py).
"""

from fastapi.testclient import TestClient

from app.core.settings import load_settings
from app.main import create_app


DEVELOPMENT = {}

PRODUCTION = {
    "ARTHNITI_ENV": "production",
    "ARTHNITI_CORS_ORIGINS": "https://advisor.example.org",
    "ARTHNITI_TENANT": "test-tenant",
}

# What FinancePage sends: the 12 answers the analysis reads.
ANALYSIS_BODY = {
    "business_category": "tailoring",
    "state": "Uttar Pradesh",
    "district": "Lucknow",
    "available_capital": 50000,
    "monthly_expenses": 15000,
    "expected_monthly_revenue": 30000,
    "monthly_emi": 2000,
    "household_monthly_income": 20000,
    "initial_investment": 100000,
    "monthly_operating_expenses": 18000,
    "existing_debt": 10000,
    "location_type": "urban",
}

CONSENT = {
    "notice_version": "2026-09-25.1",
    "language": "hi",
    "given_at": "2026-09-25T10:15:30.123Z",
    "age_confirmed": True,
}


# One valid body per route that takes one.
VALID_BODIES = {
    "/api/analysis/run": {**ANALYSIS_BODY, "consent": CONSENT},
    "/api/business/analyze": {
        "business_type": "tailoring",
        "initial_investment": 100000,
        "expected_monthly_revenue": 30000,
        "monthly_operating_expenses": 18000,
    },
    "/api/financial/analyze": {
        "available_capital": 50000,
        "monthly_expenses": 15000,
        "expected_monthly_revenue": 30000,
    },
    "/api/advisory/recommend": {
        "available_capital": 50000,
        "monthly_expenses": 15000,
        "expected_monthly_revenue": 30000,
        "monthly_emi": 2000,
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
    "/api/schemes/match": {
        "business_category": "tailoring",
        "state": "Uttar Pradesh",
    },
    "/api/market/context": {
        "state": "Uttar Pradesh",
        "district": "Lucknow",
        "business_category": "tailoring",
    },
}


def client_for(environ, **kwargs):
    return TestClient(create_app(load_settings(environ)), **kwargs)


def _resolve(node, components):
    while "$ref" in node:
        node = components[node["$ref"].rsplit("/", 1)[-1]]
    return node


def _string_fields(node, components, name, seen=()):
    """Yield (dotted field name, string schema) for every string under `node`.

    Follows $ref into components, and properties, anyOf, oneOf, allOf, items
    and additionalProperties, so an optional, nested or listed string is found
    as surely as a plain one.
    """
    ref = node.get("$ref")
    if ref in seen:
        return
    if ref:
        seen = (*seen, ref)

    node = _resolve(node, components)

    if node.get("type") == "string":
        yield name, node

    for key in ("anyOf", "oneOf", "allOf"):
        for option in node.get(key, []):
            yield from _string_fields(option, components, name, seen)

    for field, inner in node.get("properties", {}).items():
        yield from _string_fields(inner, components, f"{name}.{field}" if name else field, seen)

    if isinstance(node.get("items"), dict):
        yield from _string_fields(node["items"], components, f"{name}[]", seen)

    if isinstance(node.get("additionalProperties"), dict):
        yield from _string_fields(node["additionalProperties"], components, f"{name}{{}}", seen)


def request_strings(schema):
    """(method, path, dotted field, string schema) for every request-body string."""
    components = schema.get("components", {}).get("schemas", {})
    found = []

    for path, operations in schema["paths"].items():
        for method, operation in operations.items():
            body = operation.get("requestBody")
            if not body:
                continue
            for content in body["content"].values():
                for field, string in _string_fields(content["schema"], components, ""):
                    found.append((method, path, field, string))

    return found
