"""The processing log (core/processing_log.py): one JSON line per request.

Each test attaches a capture to the "arthniti.processing" logger, sends
requests, and reads back exactly the lines they produced.
"""

import hashlib
import hmac
import json
import re
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.api.routes import analysis as analysis_route
from app.core import processing_log
from app.core.processing_log import PROCESSING_LOGGER
from app.schemas.analysis import UnifiedAnalysisRequest
from deployment_fixtures import ANALYSIS_BODY, CONSENT, DEVELOPMENT, PRODUCTION, client_for


DEV = client_for(DEVELOPMENT)
PROD = client_for(PRODUCTION)

KEY = "0123456789abcdef0123456789abcdef"

BASE_KEYS = ["event", "request_id", "ts", "tenant", "method", "path", "status", "duration_ms"]
ANALYSIS_KEYS = [*BASE_KEYS, "consent", "payload_sha256"]

# The published test vector (see the docs on the processing log). ANALYSIS_BODY
# as validated, every default filled in and consent left out, serialised with
# sorted keys, no spaces and UTF-8. Any new request field with a default
# changes these bytes and so every code.
CANONICAL = (
    '{"available_capital":50000.0,"business_category":"tailoring","customers":"",'
    '"district":"Lucknow","employees":0,"entrepreneur_type":null,"existing_debt":10000.0,'
    '"expected_monthly_revenue":30000.0,"household_monthly_income":20000.0,'
    '"initial_investment":100000.0,"literacy_level":"low","location_type":"urban",'
    '"market_type":"","monthly_emi":2000.0,"monthly_expenses":15000.0,'
    '"monthly_operating_expenses":18000.0,"preferred_dialect":null,'
    '"state":"Uttar Pradesh","user_language":"Hindi","village":""}'
)
CANONICAL_SHA256 = "fd7a96b6f701b8bb4a361b06ef3c0a42436402bb6cee44b8034b53f2b1fce6d4"


@pytest.fixture
def lines(capture_log):
    records = capture_log(PROCESSING_LOGGER.name)

    def read():
        found = [json.loads(record.getMessage()) for record in records]
        records.clear()
        return found

    return read


def _analysis(client, body=None, **kwargs):
    return client.post("/api/analysis/run", json=ANALYSIS_BODY if body is None else body, **kwargs)


def _hash_of(body, lines, client=DEV):
    assert _analysis(client, body).status_code == 200
    (line,) = lines()
    return line["payload_sha256"]


# ---------------------------------------------------------------- one line, these keys


def test_one_json_line_per_request(lines):
    requests = [
        (lambda: DEV.get("/health"), 200),
        (lambda: DEV.get("/no/such/path"), 404),
        (lambda: _analysis(DEV, {}), 422),
        (lambda: _analysis(DEV), 200),
        (
            lambda: DEV.options(
                "/api/analysis/run",
                headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"},
            ),
            200,
        ),
        (lambda: DEV.options("/api/analysis/run", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"}), 400),
    ]

    for send, status in requests:
        response = send()
        assert response.status_code == status

        found = lines()
        assert len(found) == 1
        assert found[0]["status"] == status


def test_line_has_exactly_the_documented_fields(lines):
    DEV.get("/health")
    (health,) = lines()
    assert list(health) == BASE_KEYS
    assert health["event"] == "request"

    _analysis(DEV, {**ANALYSIS_BODY, "consent": CONSENT})
    (analysis,) = lines()
    assert list(analysis) == ANALYSIS_KEYS

    # A preflight on the analysis path is not the analysis: no consent, no code.
    DEV.options(
        "/api/analysis/run",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"},
    )
    (preflight,) = lines()
    assert list(preflight) == BASE_KEYS
    assert (preflight["method"], preflight["path"]) == ("OPTIONS", "/api/analysis/run")


def test_the_values_have_the_documented_types(lines):
    _analysis(DEV)
    (line,) = lines()

    assert line["method"] == "POST"
    assert line["path"] == "/api/analysis/run"
    assert line["status"] == 200
    assert isinstance(line["duration_ms"], float) and line["duration_ms"] >= 0
    assert re.fullmatch(r"[0-9a-f]{64}", line["payload_sha256"])


def test_request_id_matches_the_x_request_id_header_and_is_uuid4_hex(lines):
    seen = set()

    for send in (lambda: DEV.get("/health"), lambda: DEV.get("/nowhere"), lambda: _analysis(DEV, {})):
        response = send()
        (line,) = lines()
        request_id = response.headers["x-request-id"]

        assert line["request_id"] == request_id
        assert re.fullmatch(r"[0-9a-f]{32}", request_id)
        assert uuid.UUID(hex=request_id).version == 4
        seen.add(request_id)

    assert len(seen) == 3


def test_incoming_x_request_id_is_ignored(lines):
    response = DEV.get("/health", headers={"X-Request-ID": "caller-chosen-id"})
    (line,) = lines()

    assert line["request_id"] != "caller-chosen-id"
    assert response.headers.get_list("x-request-id") == [line["request_id"]]
    assert "caller-chosen-id" not in json.dumps(line)


def test_ts_is_utc_iso_with_z(lines):
    before = datetime.now(timezone.utc)
    DEV.get("/health")
    (line,) = lines()

    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z", line["ts"])
    ts = datetime.strptime(line["ts"], "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=timezone.utc)
    assert before - timedelta(seconds=1) <= ts <= datetime.now(timezone.utc)


def test_tenant_comes_from_settings(lines):
    DEV.get("/health")
    PROD.get("/health")
    dev, prod = lines()

    assert dev["tenant"] == "default"
    assert prod["tenant"] == PRODUCTION["ARTHNITI_TENANT"]


def test_path_has_no_query_string(lines):
    DEV.get("/health?name=Q-SENTINEL&phone=9876543210")
    (line,) = lines()

    assert line["path"] == "/health"
    assert "Q-SENTINEL" not in json.dumps(line)
    assert "9876543210" not in json.dumps(line)


@pytest.mark.parametrize(
    "path",
    ["/api/secret/P-SENTINEL", "/P-SENTINEL", "/api/analysis/run/P-SENTINEL", "/api/analysis/run/"],
)
def test_unknown_path_logs_unmatched_not_the_path(lines, path):
    DEV.get(path, follow_redirects=False)
    (line,) = lines()

    assert line["path"] == "unmatched"
    assert "P-SENTINEL" not in json.dumps(line)


def test_a_documented_dev_path_is_named_and_the_same_path_in_production_is_not(lines):
    DEV.get("/docs")
    PROD.get("/docs")
    dev, prod = lines()

    assert dev["path"] == "/docs"
    assert prod["path"] == "unmatched"


def test_an_unusual_method_is_logged_as_other(lines):
    DEV.request("PROPFIND", "/health")
    (line,) = lines()

    assert line["method"] == "OTHER"


# ---------------------------------------------------------------- the payload code


def test_payload_sha256_equals_the_canonical_recipe(lines):
    # Recomputed here from the recipe as the docs state it, not by calling
    # processing_log.
    validated = UnifiedAnalysisRequest(**ANALYSIS_BODY).model_dump(mode="json", exclude={"consent"})
    canonical = json.dumps(
        validated, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False
    ).encode("utf-8")

    assert _hash_of(ANALYSIS_BODY, lines) == hashlib.sha256(canonical).hexdigest()


def test_hash_test_vector_is_pinned(lines):
    body = UnifiedAnalysisRequest(**ANALYSIS_BODY)

    assert processing_log.canonical_payload(body) == CANONICAL.encode("utf-8")
    assert hashlib.sha256(CANONICAL.encode("utf-8")).hexdigest() == CANONICAL_SHA256
    assert _hash_of(ANALYSIS_BODY, lines) == CANONICAL_SHA256


def test_hash_ignores_consent_and_key_order_and_changes_with_any_answer(lines):
    plain = _hash_of(ANALYSIS_BODY, lines)

    # The consent record is not part of the answers.
    assert _hash_of({**ANALYSIS_BODY, "consent": CONSENT}, lines) == plain
    assert _hash_of({**ANALYSIS_BODY, "consent": {**CONSENT, "language": "en"}}, lines) == plain
    # Neither is the order the keys arrive in, nor 50000 against 50000.0.
    assert _hash_of(dict(reversed(list(ANALYSIS_BODY.items()))), lines) == plain
    assert _hash_of({**ANALYSIS_BODY, "available_capital": 50000.0}, lines) == plain
    # A field sent with its default is the same request as one left out.
    assert _hash_of({**ANALYSIS_BODY, "village": "", "employees": 0}, lines) == plain

    changed = {
        "business_category": "handicrafts",
        "state": "Bihar",
        "district": "Varanasi",
        "available_capital": 50001,
        "monthly_expenses": 15001,
        "expected_monthly_revenue": 30001,
        "monthly_emi": 2001,
        "household_monthly_income": None,
        "initial_investment": 100001,
        "monthly_operating_expenses": 18001,
        "existing_debt": 10001,
        "location_type": "rural",
        # Accepted and ignored by the analysis, but still part of the request.
        "village": "Khera",
    }
    assert set(ANALYSIS_BODY) <= set(changed)

    codes = {plain}
    for field, value in changed.items():
        code = _hash_of({**ANALYSIS_BODY, field: value}, lines)
        assert code not in codes, field
        codes.add(code)


def test_the_keyed_variant_names_its_algorithm(lines):
    keyed = client_for({"ARTHNITI_LOG_HASH_KEY": KEY})

    assert _analysis(keyed).status_code == 200
    (line,) = lines()

    assert list(line) == [*BASE_KEYS, "consent", "payload_hmac_sha256"]
    assert "payload_sha256" not in line
    assert line["payload_hmac_sha256"] == hmac.new(
        KEY.encode("utf-8"), CANONICAL.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    assert line["payload_hmac_sha256"] != CANONICAL_SHA256
    assert KEY not in json.dumps(line)


def test_consent_and_hash_are_null_on_422(lines):
    for client, body in (
        (DEV, {**ANALYSIS_BODY, "state": "U"}),
        (DEV, {**ANALYSIS_BODY, "consent": {**CONSENT, "x": 1}}),
        (PROD, ANALYSIS_BODY),
    ):
        assert _analysis(client, body).status_code == 422
        (line,) = lines()

        assert list(line) == ANALYSIS_KEYS
        assert line["status"] == 422
        assert line["consent"] is None
        assert line["payload_sha256"] is None


# ---------------------------------------------------------------- consent in the line


def test_the_logged_consent_is_the_one_sent(lines):
    for consent in (
        CONSENT,
        {**CONSENT, "given_at": "2026-09-25T15:45:30+05:30", "age_confirmed": False},
    ):
        _analysis(PROD, {**ANALYSIS_BODY, "consent": consent})
        (line,) = lines()

        # given_at is the text as sent, not a re-rendering of it.
        assert line["consent"] == consent


def test_a_consent_without_age_confirmed_is_logged_with_null(lines):
    consent = {key: value for key, value in CONSENT.items() if key != "age_confirmed"}

    _analysis(PROD, {**ANALYSIS_BODY, "consent": consent})
    (line,) = lines()

    assert line["consent"] == {**consent, "age_confirmed": None}


def test_no_consent_in_development_is_logged_as_null(lines):
    _analysis(DEV)
    (line,) = lines()

    assert line["consent"] is None
    assert line["payload_sha256"] == CANONICAL_SHA256


# ---------------------------------------------------------------- failures and repeats


def test_status_is_500_when_the_app_raises(lines, monkeypatch):
    def broken(**kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr(analysis_route, "run_unified_analysis", broken)
    client = client_for(DEVELOPMENT, raise_server_exceptions=False)

    response = _analysis(client)
    (line,) = lines()

    assert response.status_code == 500
    assert response.text == "Internal Server Error"
    assert line["status"] == 500
    assert line["path"] == "/api/analysis/run"
    # The 500 carries the id it was logged under, like every other response.
    assert response.headers["x-request-id"] == line["request_id"]


def test_create_app_twice_still_logs_once(lines):
    first = client_for(DEVELOPMENT)
    client_for(DEVELOPMENT)

    first.get("/health")
    assert len(lines()) == 1

    own = [
        handler
        for handler in PROCESSING_LOGGER.handlers
        if isinstance(handler, processing_log._CurrentStreamHandler)
    ]
    assert len(own) == 1


def test_the_line_goes_to_stdout_and_nowhere_else(lines, capsys):
    capsys.readouterr()
    DEV.get("/health")
    captured = capsys.readouterr()
    (line,) = lines()

    assert captured.out.splitlines() == [json.dumps(line, separators=(",", ":"))]
    assert "request_id" not in captured.err
