"""Nothing a person typed reaches a log, except the consent record.

Every text field is sent a marker that begins S3NT and every rupee field the
figure 987654.32, and then every place the server could write is searched for
them: the processing log, the app's other loggers, every logger at DEBUG
(caplog), and stdout and stderr (tests/privacy_fixtures.py). The 32 to 64
character hex runs (request ids and payload codes) are removed first, because a
digest can contain any digits. The voice-and-text helper's routes are
tests/test_intake_log_privacy.py.

The same markers are sent to the analysis in a request that is refused (a 422)
and in one whose response fails its model (a 500), since an error path is
where a value is most likely to be printed.
"""

import json
import logging

import pytest

from app.api.routes import analysis as analysis_route
from app.api.routes import market as market_route
from app.schemas.analysis import IGNORED_FIELDS, UnifiedAnalysisRequest
from deployment_fixtures import (
    ANALYSIS_BODY,
    CONSENT,
    DEVELOPMENT,
    PRODUCTION,
    VALID_BODIES,
    client_for,
    request_strings,
)
from market_fixtures import synthetic_market  # noqa: F401
from privacy_fixtures import FIGURE, HEADCOUNT, assert_clean, marker, numeric_fields, sinks  # noqa: F401


DEV = client_for(DEVELOPMENT)
PROD = client_for(PRODUCTION)

MVP_SUMMARY_KEYS = {
    "status",
    "simple_message",
    "message_code",
    "next_step",
    "next_step_code",
    "priority",
    "location_type",
}


def _string_limits(path):
    # Every string field of one route's body, from the dev app's OpenAPI with
    # consent required, so a field added later is covered without editing here.
    app = client_for({"ARTHNITI_REQUIRE_CONSENT": "true"}).app
    return {
        field: string["maxLength"]
        for _, route, field, string in request_strings(app.openapi())
        if route == path and not field.startswith("consent.")
    }


def _marked_analysis_body():
    body = dict(ANALYSIS_BODY)

    for field, limit in _string_limits("/api/analysis/run").items():
        body[field] = marker(field, limit)
    for field in numeric_fields(UnifiedAnalysisRequest):
        body[field] = HEADCOUNT if field == "employees" else FIGURE

    return body


MARKED = _marked_analysis_body()


def _marked_route_body(path):
    body = dict(VALID_BODIES[path])

    for field, limit in _string_limits(path).items():
        body[field] = marker(field, limit)
    for field, value in body.items():
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            body[field] = HEADCOUNT if field == "employees" else FIGURE

    return body


def test_the_marked_body_marks_every_field():
    # Not vacuous: every string field carries a marker and every number the
    # figure, and the body is valid.
    strings = _string_limits("/api/analysis/run")

    assert len(strings) == 11
    for field in strings:
        assert MARKED[field].startswith("S3NT-")
    for field in ("available_capital", "monthly_emi", "household_monthly_income", "existing_debt"):
        assert MARKED[field] == FIGURE
    assert MARKED["employees"] == HEADCOUNT
    UnifiedAnalysisRequest(**MARKED)


def test_the_check_would_see_a_marker_or_the_figure():
    # The refuter for assert_clean itself.
    for leaked in ("S3NT-village", "x s3nt-state", "987654.32", "9,87,654.32", "9871"):
        with pytest.raises(AssertionError):
            assert_clean(leaked)
    assert_clean("request fd7a96b6f701b8bb4a361b06ef3c0a42436402bb6cee44b8034b53f2b1fce6d4")


def test_the_search_sees_a_traceback_any_library_logged(sinks):
    # A record logged with its exception carries the exception's message in a
    # traceback, which is where a value is most likely to turn up.
    try:
        raise RuntimeError("S3NT-in-an-exception")
    except RuntimeError:
        logging.getLogger("some.library").exception("it failed")

    _, text = sinks()

    with pytest.raises(AssertionError):
        assert_clean(text)


@pytest.mark.parametrize(
    ("client", "consent"),
    [(DEV, None), (DEV, CONSENT), (PROD, CONSENT)],
    ids=["dev", "dev-with-consent", "prod"],
)
def test_no_answer_reaches_any_log_on_a_valid_request(sinks, client, consent):
    body = dict(MARKED) if consent is None else {**MARKED, "consent": consent}

    response = client.post("/api/analysis/run", json=body)
    assert response.status_code == 200

    lines, text = sinks()
    assert_clean(text)

    (line,) = lines
    assert line["consent"] == consent


@pytest.mark.parametrize(
    "bad",
    [
        {"customers": "S3NT-" * 41},
        {"monthly_emi": -FIGURE},
        {"state": "S"},
        {"consent": {**CONSENT, "notice_version": "S3NT bad"}},
    ],
    ids=["text-over-limit", "negative-figure", "short-state", "bad-consent"],
)
@pytest.mark.parametrize("client", [DEV, PROD], ids=["dev", "prod"])
def test_no_answer_reaches_any_log_on_a_refused_request(sinks, client, bad):
    body = {**MARKED, "consent": CONSENT, **bad}

    response = client.post("/api/analysis/run", json=body)
    assert response.status_code == 422

    lines, text = sinks()
    assert_clean(text)

    (line,) = lines
    assert line["consent"] is None


def test_the_marker_would_be_caught_in_a_422_body():
    # The 422 body itself carries no input, and so no marker; if it ever did,
    # this is where a logger that wrote it would show it.
    response = DEV.post("/api/analysis/run", json={**MARKED, "customers": "S3NT-" * 41})

    assert response.status_code == 422
    assert "S3NT" not in response.text


ROUTES = sorted(path for path in VALID_BODIES if path != "/api/analysis/run")


@pytest.mark.parametrize("path", ROUTES)
def test_no_answer_reaches_any_log_from_the_other_dev_routes(sinks, path, synthetic_market):
    body = _marked_route_body(path)

    response = DEV.post(path, json=body)
    # The market route answers 404 for a made-up district; that is still a
    # request whose values must not be logged.
    assert response.status_code in (200, 404)

    _, text = sinks()
    assert_clean(text)


def test_every_dev_route_with_a_text_field_is_covered():
    schema = DEV.app.openapi()
    with_strings = {path for _, path, _, _ in request_strings(schema)}

    assert with_strings <= set(VALID_BODIES)


# ---------------------------------------------------------------- a response that fails its model


def test_a_response_validation_error_logs_no_values(sinks, monkeypatch):
    def bad_rows(state, district, business_category):
        # The shape is wrong (no source, no metric, a word for a count), and
        # the values are the reader's, as a real bug would return them.
        return [{"state": state, "district": district, "business_category": business_category, "count": "S3NT-count"}]

    monkeypatch.setattr(market_route, "get_market_context", bad_rows)

    response = DEV.post("/api/market/context", json=_marked_route_body("/api/market/context"))

    assert response.status_code == 500
    assert response.json() == {"detail": "Internal Server Error"}

    lines, text = sinks()
    assert_clean(text)

    # The error is still reported, by field name.
    assert "response failed its model on /api/market/context" in text
    assert "'source'" in text or '"source"' in text
    (line,) = lines
    assert line["status"] == 500


@pytest.mark.parametrize("client", [DEV, PROD], ids=["dev", "prod"])
def test_a_unified_response_validation_error_logs_no_values(sinks, monkeypatch, client):
    def bad_analysis(**kwargs):
        # Six of the seven sections missing, and the one present made of the
        # reader's own values.
        return {"financial_analysis": {key: kwargs[key] for key in ("business_category", "state", "available_capital")}}

    monkeypatch.setattr(analysis_route, "run_unified_analysis", bad_analysis)

    response = client.post("/api/analysis/run", json={**MARKED, "consent": CONSENT})

    assert response.status_code == 500
    assert response.json() == {"detail": "Internal Server Error"}

    lines, text = sinks()
    assert_clean(text)
    assert "response failed its model on /api/analysis/run" in text
    (line,) = lines
    assert line["status"] == 500


# ---------------------------------------------------------------- nothing typed is echoed back


@pytest.mark.parametrize("client", [DEV, PROD], ids=["dev", "prod"])
def test_unified_mvp_summary_has_exactly_these_keys(client):
    response = client.post("/api/analysis/run", json={**MARKED, "consent": CONSENT})

    assert response.status_code == 200
    assert set(response.json()["mvp_summary"]) == MVP_SUMMARY_KEYS


def test_no_local_context_in_unified_market_or_advisory_rows(synthetic_market):
    place = {"state": "Uttar Pradesh", "district": "Lucknow", "business_category": "tailoring"}
    extras = {"village": "S3NT-village", "market_type": "S3NT-market", "customers": "S3NT-customers"}

    unified = DEV.post("/api/analysis/run", json={**ANALYSIS_BODY, **place, **extras}).json()["market_context"]
    market = DEV.post("/api/market/context", json=place).json()
    advisory = DEV.post("/api/advisory/recommend", json={**VALID_BODIES["/api/advisory/recommend"], **place}).json()[
        "market_context"
    ]

    for rows in (unified, market, advisory):
        assert rows, "expected the synthetic Lucknow tailoring row"
        for row in rows:
            assert "local_context" not in row


def test_ignored_fields_change_nothing_but_the_hash(capture_log):
    records = capture_log("arthniti.processing")
    ignored = {field: MARKED[field] for field in IGNORED_FIELDS}

    without = DEV.post("/api/analysis/run", json=ANALYSIS_BODY)
    with_them = DEV.post("/api/analysis/run", json={**ANALYSIS_BODY, **ignored})

    assert without.status_code == with_them.status_code == 200
    assert without.json() == with_them.json()
    assert "S3NT" not in with_them.text

    first, second = (json.loads(record.getMessage()) for record in records)
    # The code is of the request as sent, so it does tell them apart.
    assert first["payload_sha256"] != second["payload_sha256"]
