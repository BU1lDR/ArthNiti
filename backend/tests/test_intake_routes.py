"""The voice-and-text helper's two routes (api/routes/intake.py).

The model is a fake that records what it is given and answers what the test set,
so these tests run the real routes, the real WAV check, the real answer
validation and the real error mapping, and never touch the network. What the
real client puts on the wire is tests/test_meta_client.py.

What must hold whatever the model does: the helper is not there at all unless it
is switched on; a recording or text that is not acceptable is refused before any
model call is made or counted; nothing the model or Meta sends back, other than
answers that survive validation, reaches the caller; and a model call never
holds up the server's other requests.
"""

import asyncio
import logging
import threading

import pytest
from fastapi.testclient import TestClient

from app.core.meta_client import MetaError
from app.core.settings import load_settings
from app.main import create_app
from app.schemas.limits import MAX_AUDIO_BYTES, MAX_TALK_TEXT
from app.services import intake_service as intake
from deployment_fixtures import PRODUCTION
from intake_fixtures import AI_ON, KEY, FakeModel, wav_bytes


TALK = "I stitch clothes in Lucknow, in Uttar Pradesh. I have 50,000 rupees saved and I pay no EMI."

EXTRACTION = {
    "text_answers": [
        {"field": "business_category", "value": "tailoring", "evidence": "I stitch clothes"},
        {"field": "district", "value": "Lucknow", "evidence": "Lucknow"},
    ],
    "money_answers": [
        {"field": "available_capital", "rupees": 50000, "evidence": "50,000 rupees"},
        {"field": "monthly_emi", "rupees": 0, "evidence": "no EMI"},
        # Words the person never said: dropped, and counted.
        {"field": "existing_debt", "rupees": 9, "evidence": "ten thousand owed"},
    ],
}

ANSWERS = {
    "answers": [
        {"field": "business_category", "value": "tailoring", "evidence": "I stitch clothes"},
        {"field": "district", "value": "Lucknow", "evidence": "Lucknow"},
        {"field": "available_capital", "value": 50000, "evidence": "50,000 rupees"},
        {"field": "monthly_emi", "value": 0, "evidence": "no EMI"},
    ],
    "ignored": 1,
}


def app_for(model, **environ):
    return create_app(load_settings({**AI_ON, **environ}), model_client=model)


@pytest.fixture
def model():
    fake = FakeModel()
    fake.extraction = EXTRACTION
    return fake


@pytest.fixture
def client(model):
    return TestClient(app_for(model))


def post_transcribe(client, wav=None, language="hi", **kwargs):
    return client.post(
        "/api/intake/transcribe",
        params={"language": language},
        content=wav_bytes() if wav is None else wav,
        headers={"Content-Type": "audio/wav"},
        **kwargs,
    )


def post_extract(client, text=TALK, language="en"):
    return client.post("/api/intake/extract", json={"text": text, "language": language})


POSTS = {"transcribe": post_transcribe, "extract": post_extract}


@pytest.fixture(params=sorted(POSTS))
def post(request):
    return POSTS[request.param]


# ---------------------------------------------------------------- the helper is off unless switched on


@pytest.mark.parametrize("environ", [{}, PRODUCTION], ids=["development", "production"])
def test_with_the_helper_off_neither_route_exists(post, environ):
    client = TestClient(create_app(load_settings(environ)))

    assert post(client).status_code == 404


def test_with_the_helper_off_the_dev_docs_do_not_list_them():
    paths = TestClient(create_app(load_settings({}))).get("/openapi.json").json()["paths"]

    assert not [path for path in paths if "intake" in path]


def test_the_dev_openapi_lists_both_routes_when_the_helper_is_on(client):
    paths = client.get("/openapi.json").json()["paths"]

    assert "/api/intake/transcribe" in paths
    assert "/api/intake/extract" in paths


def _dev_operations():
    schema = create_app(load_settings({})).openapi()

    return sorted((method, path) for path, operations in schema["paths"].items() for method in operations)


# FastAPI 0.141 keeps included routers as objects with no `.path`, so app.routes
# lists nothing useful (tests/test_production_app.py); app.openapi() still works
# when the docs are off.
PRODUCTION_WITH_THE_HELPER = {
    ("post", "/api/analysis/run"),
    ("get", "/health"),
    ("post", "/api/intake/transcribe"),
    ("post", "/api/intake/extract"),
}


def test_production_documents_the_two_intake_routes_besides_its_usual_two_when_the_helper_is_on(model):
    schema = create_app(load_settings({**PRODUCTION, **AI_ON}), model_client=model).openapi()

    assert {(method, path) for path, operations in schema["paths"].items() for method in operations} == PRODUCTION_WITH_THE_HELPER


def test_production_documents_only_its_usual_two_when_the_helper_is_off():
    schema = create_app(load_settings(PRODUCTION)).openapi()

    assert set(schema["paths"]) == {"/health", "/api/analysis/run"}


@pytest.mark.parametrize(
    ("method", "path"),
    [operation for operation in _dev_operations() if operation not in PRODUCTION_WITH_THE_HELPER],
)
def test_production_with_the_helper_on_still_404s_every_other_dev_path(model, method, path):
    client = TestClient(create_app(load_settings({**PRODUCTION, **AI_ON}), model_client=model))

    assert client.request(method.upper(), path, json={}).status_code == 404


def test_production_with_the_helper_on_still_serves_no_docs(model):
    client = TestClient(create_app(load_settings({**PRODUCTION, **AI_ON}), model_client=model))

    for path in ("/docs", "/redoc", "/openapi.json"):
        assert client.get(path).status_code == 404


def test_production_with_the_helper_on_serves_it(model):
    client = TestClient(create_app(load_settings({**PRODUCTION, **AI_ON}), model_client=model))

    assert post_extract(client).status_code == 200
    assert post_transcribe(client).status_code == 200


@pytest.mark.parametrize("environ", [{}, PRODUCTION], ids=["development", "production"])
def test_the_startup_log_says_the_helper_is_on_and_what_it_sends_but_never_the_key(capture_log, environ):
    records = capture_log("arthniti.startup")

    create_app(load_settings({**environ, **AI_ON}), model_client=FakeModel())

    (message,) = [r.getMessage() for r in records if r.levelno == logging.INFO]

    assert "ARTHNITI_AI_ENABLED" in message
    assert "/api/intake/transcribe" in message and "/api/intake/extract" in message
    assert "muse-spark-1.3" in message and "muse-voice-transcribe-1.0" in message
    assert "100 calls an hour" in message
    assert KEY not in " ".join(r.getMessage() for r in records)


def test_the_startup_log_says_nothing_about_the_helper_when_it_is_off(capture_log):
    records = capture_log("arthniti.startup")

    create_app(load_settings(PRODUCTION))

    assert not [r for r in records if "ARTHNITI_AI_ENABLED" in r.getMessage()]


def test_a_model_client_given_to_an_app_with_the_helper_off_is_refused(model):
    with pytest.raises(ValueError, match="ARTHNITI_AI_ENABLED"):
        create_app(load_settings({}), model_client=model)


def test_with_the_helper_on_and_no_client_given_one_is_built_from_the_key(monkeypatch):
    from app import main

    made = []

    class Spy:
        def __init__(self, *arguments, **keywords):
            made.append((arguments, keywords))

    monkeypatch.setattr(main, "MetaClient", Spy)

    create_app(load_settings(AI_ON))
    create_app(load_settings({}))

    assert made == [((KEY,), {})]


# ---------------------------------------------------------------- transcribe


def test_a_recording_is_sent_to_the_speech_model_in_the_language_asked_for(model, client):
    wav = wav_bytes(frames=3200)

    response = post_transcribe(client, wav, language="ta")

    assert response.status_code == 200
    assert response.json() == {"transcript": "main silai karti hoon"}
    # The language goes to the model by name, and the bytes are the ones sent.
    assert model.calls == [("transcribe", wav, "Tamil", "muse-voice-transcribe-1.0")]


def test_the_speech_model_is_the_one_in_the_settings(model):
    client = TestClient(app_for(model, ARTHNITI_AI_ASR_MODEL="muse-voice-transcribe-9.9"))

    post_transcribe(client)

    assert model.calls[0][3] == "muse-voice-transcribe-9.9"


@pytest.mark.parametrize("code", sorted(intake.ASR_LANGUAGES))
def test_each_language_with_a_speech_model_is_accepted(model, client, code):
    assert post_transcribe(client, language=code).status_code == 200
    assert model.calls[0][2] == intake.ASR_LANGUAGES[code]


@pytest.mark.parametrize("code", ["ml", "fr", "", "HI", "hindi"])
def test_a_language_without_a_speech_model_is_refused(model, client, code):
    # Meta's speech model lists no Malayalam.
    response = post_transcribe(client, language=code)

    assert response.status_code == 422
    assert ["query", "language"] in [item["loc"] for item in response.json()["detail"]]
    assert model.calls == []


def test_the_language_is_required(model, client):
    response = client.post("/api/intake/transcribe", content=wav_bytes(), headers={"Content-Type": "audio/wav"})

    assert response.status_code == 422
    assert model.calls == []


def test_silence_is_an_empty_transcript_and_not_an_error(model, client):
    model.transcript = ""

    response = post_transcribe(client)

    assert response.status_code == 200
    assert response.json() == {"transcript": ""}


@pytest.mark.parametrize("rate", [16000, 24000])
def test_mono_16_bit_at_16_or_24_khz_is_accepted(model, client, rate):
    assert post_transcribe(client, wav_bytes(rate=rate)).status_code == 200
    assert len(model.calls) == 1


@pytest.mark.parametrize(
    "wav",
    [
        wav_bytes(channels=2),
        wav_bytes(width=1),
        wav_bytes(width=3),
        wav_bytes(width=4),
        wav_bytes(rate=8000),
        wav_bytes(rate=44100),
        wav_bytes(rate=48000),
        wav_bytes(rate=16001),
        # A header and no sound at all.
        wav_bytes(frames=0),
    ],
    ids=["stereo", "8-bit", "24-bit", "32-bit", "8 kHz", "44.1 kHz", "48 kHz", "16.001 kHz", "no sound"],
)
def test_any_other_wav_format_is_refused_before_the_model(model, client, wav):
    response = post_transcribe(client, wav)

    assert response.status_code == 422
    assert model.calls == []


def _float_wav():
    # The same file with its format tag changed from 1 (PCM) to 3 (floating point).
    data = bytearray(wav_bytes())
    data[20:22] = (3).to_bytes(2, "little")
    return bytes(data)


def _riff(*chunks):
    body = b"WAVE" + b"".join(name + len(content).to_bytes(4, "little") + content for name, content in chunks)
    return b"RIFF" + len(body).to_bytes(4, "little") + body


PCM_FORMAT = (1).to_bytes(2, "little") + (1).to_bytes(2, "little") + (16000).to_bytes(4, "little")
PCM_FORMAT += (32000).to_bytes(4, "little") + (2).to_bytes(2, "little") + (16).to_bytes(2, "little")


@pytest.mark.parametrize(
    "body",
    [
        b"",
        b"RIFF",
        b"not a recording at all",
        bytes(range(256)) * 8,
        wav_bytes()[:30],
        wav_bytes()[:12],
        # The format chunk is shorter than a format chunk is.
        _riff((b"fmt ", b"\x01\x00\x01\x00")),
        # A format with no sound after it.
        _riff((b"fmt ", PCM_FORMAT)),
        # Not PCM.
        _float_wav(),
        # Some other file that starts like a WAV.
        b"RIFF" + bytes(4) + b"AVI " + bytes(100),
    ],
    ids=["empty", "RIFF", "text", "bytes", "cut in the format", "cut before it", "short format", "no data", "float", "avi"],
)
def test_something_that_is_not_a_wav_is_refused_before_the_model(model, client, body):
    response = post_transcribe(client, body)

    assert response.status_code == 422
    assert model.calls == []


def test_a_refused_recording_is_a_422_in_the_same_shape_as_every_other(client):
    response = post_transcribe(client, b"not a recording at all")

    (item,) = response.json()["detail"]

    assert set(item) == {"type", "loc", "msg"}
    assert item["loc"] == ["body"]
    assert "WAV" in item["msg"]
    # Nothing of the body is echoed back.
    assert "not a recording" not in response.text


def test_a_recording_exactly_at_the_size_cap_is_accepted(model, client):
    body = wav_bytes(frames=(MAX_AUDIO_BYTES - 44) // 2)
    assert len(body) == MAX_AUDIO_BYTES

    assert post_transcribe(client, body).status_code == 200
    assert len(model.calls) == 1


def test_a_recording_one_byte_over_the_size_cap_is_refused(model, client):
    body = wav_bytes(frames=(MAX_AUDIO_BYTES - 44) // 2) + b"\x00"
    assert len(body) == MAX_AUDIO_BYTES + 1

    assert post_transcribe(client, body).status_code == 413
    assert model.calls == []


def test_the_size_cap_is_checked_before_the_format(model, client):
    # Not a WAV and too large: the answer is about the size.
    assert post_transcribe(client, b"x" * (MAX_AUDIO_BYTES + 1)).status_code == 413
    assert model.calls == []


def test_a_body_sent_in_pieces_with_no_length_is_capped_too(model, client):
    piece = b"\x00" * 500_000
    pieces = (piece for _ in range(MAX_AUDIO_BYTES // len(piece) + 2))

    response = client.post(
        "/api/intake/transcribe",
        params={"language": "hi"},
        content=pieces,
        headers={"Content-Type": "audio/wav"},
    )

    assert response.status_code == 413
    assert model.calls == []


def test_a_body_that_keeps_coming_is_cut_off_at_the_cap_and_not_read_to_the_end(model):
    # Driven by ASGI directly, because the test client hands the whole body over
    # at once. A server that read the body to the end before looking at its
    # size would have asked for all 100 pieces.
    piece = b"\x00" * 100_000
    asked = []
    answers = []

    async def receive():
        asked.append(len(piece))
        return {"type": "http.request", "body": piece, "more_body": len(asked) < 100}

    async def send(message):
        answers.append(message)

    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": "/api/intake/transcribe",
        "raw_path": b"/api/intake/transcribe",
        "query_string": b"language=hi",
        "root_path": "",
        "headers": [(b"content-type", b"audio/wav")],
        "client": ("127.0.0.1", 1),
        "server": ("testserver", 80),
    }

    asyncio.run(app_for(model)(scope, receive, send))

    assert answers[0]["status"] == 413
    # The cap is 30 pieces; the 31st is the one that went over it.
    assert len(asked) == MAX_AUDIO_BYTES // len(piece) + 1
    assert model.calls == []


def test_a_body_sent_in_pieces_is_put_back_together(model, client):
    wav = wav_bytes(frames=4000)
    pieces = (wav[start:start + 1000] for start in range(0, len(wav), 1000))

    response = client.post(
        "/api/intake/transcribe",
        params={"language": "hi"},
        content=pieces,
        headers={"Content-Type": "audio/wav"},
    )

    assert response.status_code == 200
    assert model.calls[0][1] == wav


def test_the_content_type_does_not_decide_whether_a_recording_is_accepted(model, client):
    response = client.post(
        "/api/intake/transcribe",
        params={"language": "hi"},
        content=wav_bytes(),
        headers={"Content-Type": "application/octet-stream"},
    )

    assert response.status_code == 200


# ---------------------------------------------------------------- extract


def test_the_text_goes_to_the_chat_model_with_our_instructions_and_schema(model, client):
    response = post_extract(client, TALK, "hi")

    assert response.status_code == 200
    assert model.calls == [
        (
            "complete_json",
            "muse-spark-1.3",
            intake.extraction_messages(TALK, "hi"),
            intake.SCHEMA_NAME,
            intake.extraction_schema(),
            4000,
        )
    ]


def test_the_chat_model_is_the_one_in_the_settings(model):
    client = TestClient(app_for(model, ARTHNITI_AI_MODEL="muse-spark-9.9"))

    post_extract(client)

    assert model.calls[0][1] == "muse-spark-9.9"


def test_only_answers_that_quote_the_persons_words_come_back_in_form_order(client):
    response = post_extract(client)

    assert response.status_code == 200
    assert response.json() == ANSWERS


def test_money_comes_back_as_a_number_and_text_as_text(client):
    answers = post_extract(client).json()["answers"]

    assert {answer["field"]: type(answer["value"]) for answer in answers} == {
        "business_category": str,
        "district": str,
        "available_capital": int,
        "monthly_emi": int,
    }


def test_the_words_are_checked_against_the_text_that_was_sent(model, client):
    # The model quotes something the person did not type.
    model.extraction = {
        "text_answers": [{"field": "district", "value": "Varanasi", "evidence": "I live in Varanasi"}],
        "money_answers": [],
    }

    assert post_extract(client).json() == {"answers": [], "ignored": 1}


def test_a_reply_that_is_not_the_shape_asked_for_is_a_bad_gateway(model, client):
    model.extraction = {"text_answers": "none"}

    response = post_extract(client)

    assert response.status_code == 502
    assert set(response.json()) == {"detail"}


def test_the_text_is_trimmed_and_may_not_be_blank(model, client):
    assert post_extract(client, "   ").status_code == 422
    assert post_extract(client, "").status_code == 422
    assert model.calls == []

    post_extract(client, "  " + TALK + "\n")

    assert model.calls[0][2][1]["content"] == TALK


def test_the_text_may_be_as_long_as_the_limit_and_no_longer(model, client):
    assert post_extract(client, "a" * MAX_TALK_TEXT).status_code == 200

    over = post_extract(client, "a" * (MAX_TALK_TEXT + 1))

    assert over.status_code == 422
    assert ["body", "text"] in [item["loc"] for item in over.json()["detail"]]
    assert len(model.calls) == 1


@pytest.mark.parametrize("language", ["fr", "", "EN", "hindi", None, 5])
def test_a_language_that_is_not_one_of_the_eight_is_refused(model, client, language):
    response = client.post("/api/intake/extract", json={"text": TALK, "language": language})

    assert response.status_code == 422
    assert ["body", "language"] in [item["loc"] for item in response.json()["detail"]]
    assert model.calls == []


@pytest.mark.parametrize("code", sorted(intake.LANGUAGES))
def test_all_eight_languages_can_be_extracted_including_malayalam(model, client, code):
    assert post_extract(client, language=code).status_code == 200


@pytest.mark.parametrize("body", [{}, {"text": TALK}, {"language": "en"}, [], "text"], ids=repr)
def test_a_body_missing_a_field_or_not_an_object_is_refused(model, client, body):
    assert client.post("/api/intake/extract", json=body).status_code == 422
    assert model.calls == []


# ---------------------------------------------------------------- what goes wrong with the model


FAILURES = [
    (MetaError("auth", 401, code="invalid_api_key"), 503),
    (MetaError("auth", 403), 503),
    (MetaError("billing", 402, code="billing_not_configured"), 503),
    (MetaError("unavailable"), 503),
    (MetaError("unavailable", 503), 503),
    (MetaError("bad_request", 400, param="messages[0].content"), 502),
    (MetaError("bad_output"), 502),
    (MetaError("rate_limited", 429), 429),
    (MetaError("a_kind_added_later"), 503),
]


@pytest.mark.parametrize(("failure", "status"), FAILURES, ids=[str(failure) for failure, _ in FAILURES])
def test_a_failed_model_call_becomes_the_status_that_says_what_to_do(model, client, post, failure, status):
    model.failure = failure

    response = post(client)

    assert response.status_code == status
    assert set(response.json()) == {"detail"}
    assert isinstance(response.json()["detail"], str) and response.json()["detail"]


def test_the_three_kinds_of_failure_each_have_their_own_sentence_and_no_kind_has_two(model, client, post):
    seen = {}

    for failure, status in FAILURES:
        model.failure = failure
        seen.setdefault(status, set()).add(post(client).json()["detail"])

    assert all(len(sentences) == 1 for sentences in seen.values())
    assert len({next(iter(sentences)) for sentences in seen.values()}) == len(seen) == 3


def test_what_meta_said_never_reaches_the_caller(model, client, post):
    model.failure = MetaError("auth", 401, code="invalid_api_key", param="Authorization", detail="ECHO S3NT-upstream", retry_after=5)

    response = post(client)

    for leaked in ("ECHO", "S3NT", "invalid_api_key", "Authorization", KEY, "401"):
        assert leaked not in response.text


def test_a_busy_model_says_how_long_to_wait(model, client, post):
    model.failure = MetaError("rate_limited", 429, retry_after=7)
    assert post(client).headers["retry-after"] == "7"

    # Meta sent no wait, or a wait of nothing, which would only bring the retry straight back.
    for unknown in (None, 0):
        model.failure = MetaError("rate_limited", 429, retry_after=unknown)
        assert post(client).headers["retry-after"] == "30"


def test_only_a_busy_model_sends_retry_after(model, client, post):
    model.failure = MetaError("unavailable")

    assert "retry-after" not in post(client).headers


# ---------------------------------------------------------------- the hourly limit


class Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


@pytest.fixture
def clock(monkeypatch):
    from app.api.routes import intake as route

    clock = Clock()
    monkeypatch.setattr(route, "_now", clock)
    return clock


def limited(model, limit):
    return TestClient(app_for(model, ARTHNITI_AI_HOURLY_LIMIT=str(limit)))


def test_the_hour_is_counted_on_a_clock_that_does_not_jump(monkeypatch):
    # Wall-clock time steps (a time sync, a host set wrong), and a step back
    # would keep calls counted for longer than an hour or a step forward forget them.
    from app.api.routes import intake as route

    monkeypatch.setattr(route.time, "monotonic", lambda: 123.5)
    monkeypatch.setattr(route.time, "time", lambda: 9.0)

    assert route._now() == 123.5


def test_the_calls_over_the_hourly_limit_are_refused_without_reaching_the_model(model, clock, post):
    client = limited(model, 2)

    assert [post(client).status_code for _ in range(2)] == [200, 200]

    refused = post(client)

    assert refused.status_code == 429
    assert len(model.calls) == 2


def test_the_two_routes_share_one_count(model, clock):
    client = limited(model, 2)

    assert post_transcribe(client).status_code == 200
    assert post_extract(client).status_code == 200
    assert post_extract(client).status_code == 429
    assert post_transcribe(client).status_code == 429


def test_a_refused_call_says_when_the_oldest_one_leaves_the_hour(model, clock):
    client = limited(model, 2)

    post_extract(client)
    clock.now += 1000
    post_extract(client)
    clock.now += 500

    refused = post_extract(client)

    # The first call was 1500 seconds ago, so it counts for 2100 more.
    assert refused.headers["retry-after"] == "2100"
    assert set(refused.json()) == {"detail"}


def test_the_wait_is_rounded_up_to_a_whole_second(model, clock):
    client = limited(model, 1)

    post_extract(client)
    clock.now += 3599.9

    assert post_extract(client).headers["retry-after"] == "1"


def test_a_call_counts_for_exactly_one_hour(model, clock):
    client = limited(model, 1)

    assert post_extract(client).status_code == 200
    clock.now += 3599
    assert post_extract(client).status_code == 429
    clock.now += 1
    assert post_extract(client).status_code == 200
    # And that one counts from now.
    assert post_extract(client).status_code == 429


def test_a_request_the_server_refuses_is_not_counted(model, clock):
    client = limited(model, 1)

    assert post_extract(client, "").status_code == 422
    assert post_transcribe(client, b"not a recording").status_code == 422
    assert post_transcribe(client, language="ml").status_code == 422
    assert post_transcribe(client, b"x" * (MAX_AUDIO_BYTES + 1)).status_code == 413

    assert post_extract(client).status_code == 200


def test_a_call_that_fails_at_the_model_is_counted_because_it_may_have_been_billed(model, clock):
    client = limited(model, 1)
    model.failure = MetaError("unavailable")

    assert post_extract(client).status_code == 503

    model.failure = None
    assert post_extract(client).status_code == 429


def test_a_reply_that_fails_validation_is_counted_too(model, clock):
    client = limited(model, 1)
    model.extraction = "not an object"

    assert post_extract(client).status_code == 502
    assert post_extract(client).status_code == 429


def test_each_app_keeps_its_own_count(clock):
    first, second = FakeModel(), FakeModel()
    one, two = limited(first, 1), limited(second, 1)

    assert post_extract(one).status_code == 200
    assert post_extract(two).status_code == 200
    assert post_extract(one).status_code == 429


def test_the_default_limit_is_a_hundred_an_hour(model, clock):
    client = TestClient(app_for(model))

    statuses = [post_extract(client).status_code for _ in range(101)]

    assert statuses == [200] * 100 + [429]


# ---------------------------------------------------------------- a model call does not hold up the server


@pytest.mark.parametrize("route", sorted(POSTS))
def test_a_slow_model_call_does_not_stop_the_server_answering_other_requests(route):
    entered = threading.Event()
    release = threading.Event()

    def slow(call):
        def wrapper(self, *args):
            entered.set()
            # Bounded, so a regression fails this test instead of hanging it.
            assert release.wait(15)
            return call(self, *args)

        return wrapper

    class Slow(FakeModel):
        transcribe = slow(FakeModel.transcribe)
        complete_json = slow(FakeModel.complete_json)

    result = {}

    with TestClient(app_for(Slow())) as client:
        worker = threading.Thread(target=lambda: result.update(response=POSTS[route](client)))
        worker.start()

        try:
            assert entered.wait(10)
            # The model call is still in progress; the server must still answer.
            assert client.get("/health").status_code == 200
        finally:
            release.set()
            worker.join(20)

    assert result["response"].status_code == 200
