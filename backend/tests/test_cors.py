"""Which web pages a browser lets call this API, in both modes.

The API takes a person's money answers, so a page from any other origin must
not be able to send them here from that person's browser. No cookies or
credentials are used, so none are allowed, and only what the frontend sends is
allowed: GET and POST with a JSON body.
"""

import pytest

from deployment_fixtures import ANALYSIS_BODY, CONSENT, DEVELOPMENT, PRODUCTION, client_for


DEV = client_for(DEVELOPMENT)
PROD = client_for(PRODUCTION)

PROD_ORIGIN = "https://advisor.example.org"

# (client, an origin it allows)
ALLOWED = [
    pytest.param(DEV, "http://localhost:5173", id="dev-localhost-5173"),
    pytest.param(DEV, "http://127.0.0.1:5174", id="dev-loopback-5174"),
    pytest.param(PROD, PROD_ORIGIN, id="prod-listed"),
]

# (client, an origin it refuses)
REFUSED = [
    pytest.param(DEV, "https://evil.example", id="dev-other-site"),
    pytest.param(DEV, "http://localhost.evil.example:5173", id="dev-lookalike"),
    pytest.param(DEV, "https://localhost:5173", id="dev-https-loopback"),
    pytest.param(PROD, "https://evil.example", id="prod-other-site"),
    pytest.param(PROD, "http://advisor.example.org", id="prod-http"),
    pytest.param(PROD, "http://localhost:5173", id="prod-localhost"),
]


def _preflight(client, origin, method="POST", headers="content-type"):
    return client.options(
        "/api/analysis/run",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": method,
            "Access-Control-Request-Headers": headers,
        },
    )


@pytest.mark.parametrize(("client", "origin"), ALLOWED)
def test_allowed_origin_is_echoed_not_star(client, origin):
    preflight = _preflight(client, origin)
    body = {**ANALYSIS_BODY, "consent": CONSENT}
    simple = client.post("/api/analysis/run", json=body, headers={"Origin": origin})

    assert preflight.status_code == 200
    assert simple.status_code == 200
    for response in (preflight, simple):
        assert response.headers["access-control-allow-origin"] == origin
    assert "origin" in simple.headers["vary"].lower()


@pytest.mark.parametrize(("client", "origin"), ALLOWED)
def test_no_allow_credentials_header(client, origin):
    for response in (
        _preflight(client, origin),
        client.get("/health", headers={"Origin": origin, "Cookie": "session=x"}),
    ):
        assert "access-control-allow-credentials" not in response.headers


@pytest.mark.parametrize(("client", "origin"), ALLOWED)
def test_methods_are_get_and_post_only(client, origin):
    allowed = _preflight(client, origin).headers["access-control-allow-methods"]

    assert {method.strip() for method in allowed.split(",")} == {"GET", "POST"}

    for method in ("PUT", "PATCH", "DELETE"):
        refused = _preflight(client, origin, method=method)
        assert refused.status_code == 400


@pytest.mark.parametrize(("client", "origin"), ALLOWED)
def test_headers_include_content_type_and_no_star(client, origin):
    allowed = _preflight(client, origin).headers["access-control-allow-headers"]
    names = {name.strip().lower() for name in allowed.split(",")}

    assert "content-type" in names
    assert "*" not in allowed
    assert "authorization" not in names

    assert _preflight(client, origin, headers="authorization").status_code == 400
    assert _preflight(client, origin, headers="x-anything").status_code == 400


@pytest.mark.parametrize(("client", "origin"), REFUSED)
def test_disallowed_origin_preflight_is_refused(client, origin):
    preflight = _preflight(client, origin)
    simple = client.get("/health", headers={"Origin": origin})

    assert preflight.status_code == 400
    assert "access-control-allow-origin" not in preflight.headers
    # A simple request still reaches the app (CORS is enforced by the browser),
    # but without the header the browser will not hand the reply to the page.
    assert "access-control-allow-origin" not in simple.headers


def test_dev_regex_still_allows_localhost_5173():
    response = _preflight(DEV, "http://localhost:5173")

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_a_dev_origin_list_replaces_the_loopback_regex():
    listed = client_for({"ARTHNITI_CORS_ORIGINS": "http://localhost:5173"})

    assert _preflight(listed, "http://localhost:5173").status_code == 200
    assert _preflight(listed, "http://localhost:5174").status_code == 400
