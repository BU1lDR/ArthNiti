"""What a production app serves: the one endpoint the frontend calls and a
health check, with no docs and no schema.

FastAPI 0.141 keeps included routers as objects with no `.path`, so listing
app.routes says little. These tests are behavioural instead: every path the
development app documents is requested from the production app, which must
answer 404 for all but two.
"""

import pytest

from app.core.settings import load_settings
from app.main import create_app
from deployment_fixtures import ANALYSIS_BODY, CONSENT, DEVELOPMENT, PRODUCTION, client_for


client = client_for(PRODUCTION)

SERVED = {("post", "/api/analysis/run"), ("get", "/health")}


def _dev_operations():
    schema = create_app(load_settings(DEVELOPMENT)).openapi()

    return sorted(
        (method, path)
        for path, operations in schema["paths"].items()
        for method in operations
    )


DEV_OPERATIONS = _dev_operations()


def test_the_dev_app_documents_more_than_production_serves():
    # Not vacuous: all 8 routers are documented in development.
    assert SERVED < set(DEV_OPERATIONS)
    assert len(DEV_OPERATIONS) == 8


def test_production_serves_analysis_and_health():
    health = client.get("/health")
    analysis = client.post("/api/analysis/run", json={**ANALYSIS_BODY, "consent": CONSENT})

    assert health.status_code == 200
    assert analysis.status_code == 200
    assert set(analysis.json()) == {
        "financial_analysis",
        "risk_analysis",
        "financing_options",
        "business_analysis",
        "market_context",
        "scheme_matches",
        "advisory",
        "mvp_summary",
    }


@pytest.mark.parametrize(("method", "path"), [op for op in DEV_OPERATIONS if op not in SERVED])
def test_production_404s_every_other_dev_path(method, path):
    response = client.request(method.upper(), path, json={})

    assert response.status_code == 404


@pytest.mark.parametrize("path", ["/docs", "/redoc", "/openapi.json", "/docs/oauth2-redirect"])
def test_production_serves_no_docs(path):
    assert client.get(path).status_code == 404


def test_the_dev_app_does_serve_the_docs():
    # The same four requests against a development app, so the 404s above are
    # the production setting and not a wrong path.
    dev = client_for(DEVELOPMENT)

    for path in ("/docs", "/redoc", "/openapi.json", "/docs/oauth2-redirect"):
        assert dev.get(path).status_code == 200


def test_production_requires_consent_422_loc_body_consent():
    response = client.post("/api/analysis/run", json=ANALYSIS_BODY)

    assert response.status_code == 422
    detail = response.json()["detail"]

    assert [item["loc"] for item in detail] == [["body", "consent"]]
    assert detail[0]["type"] == "missing"
    for item in detail:
        assert set(item) == {"type", "loc", "msg"}


def test_production_refuses_a_null_consent():
    response = client.post("/api/analysis/run", json={**ANALYSIS_BODY, "consent": None})

    assert response.status_code == 422
    assert [item["loc"] for item in response.json()["detail"]] == [["body", "consent"]]


def test_production_names_the_bad_consent_field():
    response = client.post(
        "/api/analysis/run",
        json={**ANALYSIS_BODY, "consent": {**CONSENT, "language": "Hindi"}},
    )

    assert response.status_code == 422
    assert [item["loc"] for item in response.json()["detail"]] == [["body", "consent", "language"]]


def test_production_accepts_a_valid_consent():
    response = client.post("/api/analysis/run", json={**ANALYSIS_BODY, "consent": CONSENT})

    assert response.status_code == 200


def test_production_with_consent_off_accepts_a_request_without_one():
    relaxed = client_for({**PRODUCTION, "ARTHNITI_REQUIRE_CONSENT": "false"})

    assert relaxed.post("/api/analysis/run", json=ANALYSIS_BODY).status_code == 200
    assert relaxed.get("/docs").status_code == 404


def test_development_can_require_consent_too():
    strict = client_for({"ARTHNITI_REQUIRE_CONSENT": "true"})
    response = strict.post("/api/analysis/run", json=ANALYSIS_BODY)

    assert response.status_code == 422
    assert [item["loc"] for item in response.json()["detail"]] == [["body", "consent"]]
