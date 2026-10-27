"""Nothing a person says or types to the voice-and-text helper reaches a log.

The two /api/intake routes are sent a marker that begins S3NT and the figure
987654 in every form tests/privacy_fixtures.py looks for: in the typed text, in
what the fake model hears, in the bytes of the recording, and in what the model's
reply and error echo back. Then every place the server could write is searched
for them, as tests/test_log_privacy.py does for the analysis route.

An error path is where a value is most likely to be printed, so every way a
request can end is here: answers, a body the route refuses (422, 413), the hourly
limit (429) and each kind of model failure.

A helper request's processing line is the same eight keys as any other route's,
with no consent record and no payload code: the helper keeps nothing of the body.
"""

import pytest
from fastapi.testclient import TestClient

from app.api.routes import intake as intake_route
from app.core.meta_client import MetaError
from app.core.settings import load_settings
from app.main import create_app
from app.schemas.limits import MAX_AUDIO_BYTES
from deployment_fixtures import PRODUCTION
from intake_fixtures import AI_ON, KEY, FakeModel, wav_bytes
from privacy_fixtures import assert_clean, sinks  # noqa: F401


SAID = "S3NT-talk. I have 987654 rupees, 9,87,654 in the shop, 987,654 owed and 9871 hens."

# The sound of the recording is the marker, so a logger that wrote the body would
# have something to write.
SOUND = wav_bytes(fill=b"S3NT")

# Answers that survive validation, and so go back to the person with their words.
ECHOING = {
    "text_answers": [{"field": "business_category", "value": "tailoring", "evidence": "S3NT-talk"}],
    "money_answers": [{"field": "available_capital", "rupees": 987654, "evidence": "987654 rupees"}],
}

LINE_KEYS = {"event", "request_id", "ts", "tenant", "method", "path", "status", "duration_ms"}

EXTRACT = "/api/intake/extract"
TRANSCRIBE = "/api/intake/transcribe"

# Every field of an error that a client might copy into a message, carrying the
# marker, the figure or the key.
FAILURES = [
    (MetaError("auth", 401, code="invalid_api_key", param="Authorization", detail=f"S3NT 987654 {KEY}"), 503),
    (MetaError("billing", 402, code="S3NT-code", detail="S3NT-billing"), 503),
    (MetaError("unavailable", detail="S3NT-down"), 503),
    (MetaError("rate_limited", 429, detail="S3NT-slow", retry_after=5), 429),
    (MetaError("bad_request", 400, param="S3NT-param", detail="S3NT-bad"), 502),
    (MetaError("bad_output", detail="S3NT-output"), 502),
]


def extract(client, text=SAID, language="en"):
    return client.post(EXTRACT, json={"text": text, "language": language})


def transcribe(client, wav=SOUND, language="hi"):
    return client.post(
        TRANSCRIBE,
        params={"language": language},
        content=wav,
        headers={"Content-Type": "audio/wav"},
    )


SENDS = {EXTRACT: extract, TRANSCRIBE: transcribe}


@pytest.fixture(params=sorted(SENDS))
def route(request):
    return request.param, SENDS[request.param]


@pytest.fixture(params=[{}, PRODUCTION], ids=["dev", "prod"])
def helper(request):
    """Builds a client for the helper. Call it inside the test, after `sinks`, so the logs are watched from startup."""

    def make(model, **more):
        return TestClient(create_app(load_settings({**request.param, **AI_ON, **more}), model_client=model))

    return make


def assert_lines(lines, *expected):
    assert [(line["path"], line["status"]) for line in lines] == list(expected)
    for line in lines:
        assert set(line) == LINE_KEYS
        assert line["method"] == "POST"


# ---------------------------------------------------------------- a request that is answered


def test_answers_carry_the_words_back_to_the_person_and_to_no_log(sinks, helper):
    model = FakeModel()
    model.extraction = ECHOING

    response = extract(helper(model))

    # The answers are shown to the person with their words beside them, which is
    # their job. The check is that this does not make the words reach a log.
    assert response.status_code == 200
    assert "S3NT-talk" in response.text
    assert "987654" in response.text

    lines, text = sinks()
    assert_clean(text)
    assert KEY not in text
    assert_lines(lines, (EXTRACT, 200))


def test_answers_the_model_made_up_are_dropped_and_logged_nowhere(sinks, helper):
    model = FakeModel()
    model.extraction = {
        "text_answers": [{"field": "state", "value": "S3NT-Nowhere", "evidence": "S3NT-never said"}],
        "money_answers": [{"field": "monthly_emi", "rupees": 987654, "evidence": "S3NT-never said either"}],
    }

    response = extract(helper(model))

    assert response.json() == {"answers": [], "ignored": 2}

    lines, text = sinks()
    assert_clean(text)
    assert_lines(lines, (EXTRACT, 200))


def test_a_transcript_goes_back_to_the_person_and_to_no_log(sinks, helper):
    model = FakeModel()
    model.transcript = SAID

    response = transcribe(helper(model))

    assert response.json() == {"transcript": SAID}
    # The recording that reached the model had the marker in its sound.
    assert b"S3NT" in model.calls[0][1]

    lines, text = sinks()
    assert_clean(text)
    assert KEY not in text
    assert_lines(lines, (TRANSCRIBE, 200))


# ---------------------------------------------------------------- a request the model fails


@pytest.mark.parametrize(("failure", "status"), FAILURES, ids=[failure.kind for failure, _ in FAILURES])
def test_a_failed_model_call_logs_only_its_kind(sinks, capture_log, helper, route, failure, status):
    path, send = route
    errors = capture_log("arthniti.errors")
    model = FakeModel()
    model.failure = failure

    response = send(helper(model))

    assert response.status_code == status
    assert "S3NT" not in response.text

    lines, text = sinks()
    assert_clean(text)
    assert KEY not in text
    # What is logged, once, is the kind and the status when there was one: enough
    # to tell an operator what to look at.
    assert [record.getMessage() for record in errors] == [f"the model call failed: {failure}"]
    assert_lines(lines, (path, status))


def test_a_reply_in_the_wrong_shape_logs_nothing_of_it(sinks, capture_log, helper):
    errors = capture_log("arthniti.errors")
    model = FakeModel()
    model.extraction = {"text_answers": SAID, "money_answers": [SAID]}

    response = extract(helper(model))

    assert response.status_code == 502
    assert "S3NT" not in response.text

    lines, text = sinks()
    assert_clean(text)
    assert [record.getMessage() for record in errors] == ["the model's reply was not the shape asked for"]
    assert_lines(lines, (EXTRACT, 502))


# ---------------------------------------------------------------- a request the route refuses


REFUSED = [
    ("text over the limit", lambda c: extract(c, text="S3NT-" * 401), 422),
    ("unknown language", lambda c: extract(c, language="S3NT-xx"), 422),
    ("not a recording", lambda c: transcribe(c, wav=b"S3NT-987654" * 100), 422),
    ("the wrong kind of recording", lambda c: transcribe(c, wav=wav_bytes(channels=2, fill=b"S3NT")), 422),
    ("unknown spoken language", lambda c: transcribe(c, language="S3NT-xx"), 422),
    ("a recording over the limit", lambda c: transcribe(c, wav=b"S3NT" * (MAX_AUDIO_BYTES // 4 + 1)), 413),
]


@pytest.mark.parametrize(("send", "status"), [case[1:] for case in REFUSED], ids=[case[0] for case in REFUSED])
def test_a_refused_request_logs_none_of_it(sinks, helper, send, status):
    model = FakeModel()

    response = send(helper(model))

    assert response.status_code == status
    assert "S3NT" not in response.text
    # Refused before the model was asked.
    assert model.calls == []

    lines, text = sinks()
    assert_clean(text)
    (line,) = lines
    assert line["status"] == status
    assert set(line) == LINE_KEYS


def test_the_hourly_limit_logs_no_words(sinks, helper):
    model = FakeModel()
    client = helper(model, ARTHNITI_AI_HOURLY_LIMIT="1")

    assert extract(client).status_code == 200
    refused = extract(client)

    assert refused.status_code == 429
    assert "S3NT" not in refused.text

    lines, text = sinks()
    assert_clean(text)
    assert_lines(lines, (EXTRACT, 200), (EXTRACT, 429))


# ---------------------------------------------------------------- the search itself


def test_the_sinks_would_see_what_the_helper_logs(sinks):
    # The refuter for the search: a line written through the logger the routes
    # use is found, and the check fails on it.
    intake_route.ERRORS_LOGGER.warning("S3NT-refuter")

    _, text = sinks()

    with pytest.raises(AssertionError):
        assert_clean(text)


def test_a_leak_through_a_route_would_be_caught(sinks, helper, monkeypatch):
    # The same, through a whole request: a validation step that wrote the
    # person's words to the log makes the check fail.
    real = intake_route.intake.validate_extraction

    def leaky(raw, text):
        intake_route.ERRORS_LOGGER.warning("heard %s", text)
        return real(raw, text)

    monkeypatch.setattr(intake_route.intake, "validate_extraction", leaky)

    assert extract(helper(FakeModel())).status_code == 200

    _, text = sinks()

    with pytest.raises(AssertionError):
        assert_clean(text)
