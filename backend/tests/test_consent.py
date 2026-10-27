"""The consent record on POST /api/analysis/run (schemas/analysis.py Consent).

It says what the person agreed to and when. It is checked strictly, written to
the processing log line, and never sent back.
"""

import pytest

from deployment_fixtures import ANALYSIS_BODY, CONSENT, DEVELOPMENT, PRODUCTION, client_for


DEV = client_for(DEVELOPMENT)
PROD = client_for(PRODUCTION)


def _post(client, consent):
    return client.post("/api/analysis/run", json={**ANALYSIS_BODY, "consent": consent})


def _locs(response):
    return [item["loc"] for item in response.json()["detail"]]


def _everything_in(value):
    # Every key and every scalar in a JSON value, as text.
    if isinstance(value, dict):
        for key, inner in value.items():
            yield str(key)
            yield from _everything_in(inner)
    elif isinstance(value, list):
        for inner in value:
            yield from _everything_in(inner)
    else:
        yield str(value)


def test_consent_is_optional_in_development():
    without = DEV.post("/api/analysis/run", json=ANALYSIS_BODY)
    with_null = _post(DEV, None)
    with_consent = _post(DEV, CONSENT)

    assert without.status_code == 200
    assert with_null.status_code == 200
    assert with_consent.status_code == 200
    # The record changes nothing in the analysis.
    assert without.json() == with_consent.json() == with_null.json()


@pytest.mark.parametrize("client", [DEV, PROD], ids=["dev", "prod"])
def test_extra_key_is_422_extra_forbidden(client):
    response = _post(client, {**CONSENT, "x": "anything"})

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert [item["loc"] for item in detail] == [["body", "consent", "x"]]
    assert detail[0]["type"] == "extra_forbidden"


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("notice_version", ""),
        ("notice_version", "v 1"),
        ("notice_version", "v1/2"),
        ("notice_version", "1" * 41),
        ("notice_version", 1),
        ("language", "h"),
        ("language", "Hindi"),
        ("language", "HI"),
        ("language", "hi-IN-x-very"),
        ("language", "hi_IN"),
        ("given_at", "2026-09-25T10:15:30"),
        ("given_at", "2026-09-25"),
        ("given_at", "yesterday"),
        ("given_at", "2026-09-25T10:15:30+0530"),
        ("given_at", "2026-09-25 10:15:30Z"),
        ("given_at", "2026-09-31T10:15:30Z"),
        ("given_at", "2026-09-25T25:15:30Z"),
        ("given_at", "1758795330"),
        ("given_at", 1758795330),
        ("given_at", 1758795330.5),
        ("given_at", "2026-09-25T10:15:30.123456789012345678901234Z"),
        ("given_at", None),
        ("age_confirmed", "maybe"),
        ("age_confirmed", 2),
    ],
)
@pytest.mark.parametrize("client", [DEV, PROD], ids=["dev", "prod"])
def test_bad_notice_version_language_naive_or_numeric_or_long_given_at_are_422(client, field, value):
    response = _post(client, {**CONSENT, field: value})

    assert response.status_code == 422
    assert _locs(response) == [["body", "consent", field]]
    for item in response.json()["detail"]:
        assert set(item) == {"type", "loc", "msg"}


@pytest.mark.parametrize("field", ["notice_version", "language", "given_at"])
@pytest.mark.parametrize("client", [DEV, PROD], ids=["dev", "prod"])
def test_each_required_consent_field_is_named_when_missing(client, field):
    consent = {key: value for key, value in CONSENT.items() if key != field}
    response = _post(client, consent)

    assert response.status_code == 422
    assert _locs(response) == [["body", "consent", field]]


def test_age_confirmed_is_optional_and_recorded_not_checked():
    # The server does not refuse a request on age_confirmed; it only records it.
    for value in (True, False, None):
        assert _post(PROD, {**CONSENT, "age_confirmed": value}).status_code == 200

    missing = {key: value for key, value in CONSENT.items() if key != "age_confirmed"}
    assert _post(PROD, missing).status_code == 200


@pytest.mark.parametrize("client", [DEV, PROD], ids=["dev", "prod"])
def test_consent_is_never_in_the_response(client):
    consent = {**CONSENT, "notice_version": "N0TICE-VERSION-7", "given_at": "2026-09-25T03:17:59.987Z"}
    response = _post(client, consent)

    assert response.status_code == 200
    body = response.json()
    everything = list(_everything_in(body))

    assert "consent" not in everything
    for key in ("notice_version", "given_at", "age_confirmed"):
        assert key not in everything
    assert not any("N0TICE-VERSION-7" in text for text in everything)
    assert not any("03:17:59" in text for text in everything)
    assert "N0TICE" not in response.text


@pytest.mark.parametrize(
    "given_at",
    [
        "2026-09-25T10:15:30Z",
        "2026-09-25T10:15:30.123Z",
        "2026-09-25T15:45:30+05:30",
        "2026-09-25T10:15:30.123+00:00",
        "2026-09-25T10:15:30-04:00",
    ],
)
def test_z_and_offset_timestamps_are_accepted(given_at):
    assert _post(PROD, {**CONSENT, "given_at": given_at}).status_code == 200


def test_the_consent_limits_are_in_the_schema():
    schema = DEV.get("/openapi.json").json()["components"]["schemas"]["Consent"]

    assert schema["additionalProperties"] is False
    assert schema["properties"]["notice_version"]["maxLength"] == 40
    assert schema["properties"]["language"]["maxLength"] == 8
    assert schema["properties"]["given_at"]["maxLength"] == 40
    assert schema["properties"]["given_at"]["format"] == "date-time"
    assert set(schema["required"]) == {"notice_version", "language", "given_at"}
