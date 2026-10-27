"""The only code that talks to Meta's model API (core/meta_client.py).

These tests run the real client against a small HTTP server on this machine, so
they check the bytes that would go on the wire: the path, the headers, the JSON
body, the hand-built multipart body for audio. Meta's own API is not called.

The wire format comes from Meta's documentation. Nothing here proves Meta
accepts it; `python -m app.smoke_meta`, run with a real key, is the only proof.

What must hold whatever Meta answers: the key goes only to the one URL it is
meant for (a redirect is not followed), a reply is read only up to a size cap,
and no error carries the key, the person's words or a body Meta sent back.
Meta's own error message may echo what was sent, so the client keeps it only
when asked to (the smoke script asks; the app never does).
"""

import http.server
import inspect
import json
import socket
import threading
import time
import urllib.error
import urllib.request
from types import SimpleNamespace

import pytest

from app.core.meta_client import MAX_RESPONSE_BYTES, MetaClient, MetaError
from app.core.spend import SpendCap


KEY = "LLM_1234567_" + "q" * 24

WORDS = "S3NT-persons-words"
UPSTREAM = "ECHO-from-upstream-body"

MESSAGES = [
    {"role": "developer", "content": "Fill in the form."},
    {"role": "user", "content": WORDS},
]
SCHEMA = {"type": "object", "properties": {"a": {"type": "string"}}, "required": ["a"]}

# Every byte value, and a line that looks like the end of a multipart part.
WAV = bytes(range(256)) * 4 + b"\r\n--not-the-boundary--\r\n" + b"RIFF"


class _Server(http.server.ThreadingHTTPServer):
    def handle_error(self, request, client_address):
        # A client that gave up (the timeout test) leaves a broken pipe behind.
        pass


class Stub:
    """A Meta stand-in: records every request, answers with what the test set."""

    def __init__(self):
        self.requests = []
        self.reply()

        stub = self

        class Handler(http.server.BaseHTTPRequestHandler):
            def do_POST(self):
                length = int(self.headers.get("Content-Length", 0))
                stub.requests.append(
                    {
                        # http.server collapses a leading "//" in self.path; the
                        # request line is what the client actually sent.
                        "target": self.requestline.split(" ")[1],
                        "path": self.path,
                        "headers": {name.lower(): value for name, value in self.headers.items()},
                        "body": self.rfile.read(length),
                    }
                )
                time.sleep(stub.delay)
                if stub.raw is not None:
                    # For replies that are not valid HTTP: these bytes, then hang up.
                    self.wfile.write(stub.raw)
                    self.close_connection = True
                    return
                self.send_response(stub.status)
                for name, value in stub.headers.items():
                    self.send_header(name, value)
                self.send_header("Content-Length", str(len(stub.body)))
                self.end_headers()
                self.wfile.write(stub.body)

            # A client that followed a redirect would turn the POST into a GET.
            # Without this the stub answers that with 501 and records nothing,
            # so the redirect tests could not see it happen.
            do_GET = do_POST

            def log_message(self, *args):
                pass

        self.server = _Server(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.server.server_port}"
        # The default poll of half a second would make every test wait that long to stop it.
        threading.Thread(target=self.server.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True).start()

    def reply(self, status=200, body=b"{}", headers=None, delay=0, raw=None):
        self.status, self.body, self.headers, self.delay, self.raw = status, body, headers or {}, delay, raw

    def reply_chat(self, content, usage=None):
        body = {"choices": [{"message": {"role": "assistant", "content": content}}]}
        if usage is not None:
            body["usage"] = usage
        self.reply(body=json.dumps(body).encode())

    def close(self):
        self.server.shutdown()
        self.server.server_close()


@pytest.fixture(autouse=True)
def direct_connections(monkeypatch):
    # The client honours the proxy settings in the environment, as urllib does.
    # Take them away, and say this machine is never proxied, so a proxy on the
    # machine running the tests cannot stand between the client and the stub.
    # (With any proxy variable set, Windows also stops reading its own registry.)
    for name in ("http_proxy", "https_proxy", "all_proxy"):
        monkeypatch.delenv(name, raising=False)
        monkeypatch.delenv(name.upper(), raising=False)
    monkeypatch.setenv("NO_PROXY", "127.0.0.1,localhost")


@pytest.fixture(scope="module")
def _stub_server():
    server = Stub()
    yield server
    server.close()


@pytest.fixture
def stub(_stub_server):
    # One server for the file, reset for each test: starting one costs more
    # than most of these tests.
    _stub_server.requests.clear()
    _stub_server.reply()
    return _stub_server


class Meter:
    """A spend cap that allows everything. It remembers what it was asked to charge,
    and how many requests the stub had seen by then."""

    def __init__(self, stub):
        self.charges = []
        self.sent_before = []
        self._stub = stub

    def charge(self, usd):
        self.charges.append(usd)
        self.sent_before.append(len(self._stub.requests))


@pytest.fixture
def spend(stub):
    return Meter(stub)


@pytest.fixture
def client(stub, spend):
    return MetaClient(KEY, spend=spend, base_url=stub.url, timeout=5)


def complete(client, **overrides):
    arguments = {"model": "muse-spark-1.3", "messages": MESSAGES, "schema_name": "form_answers", "schema": SCHEMA, "max_tokens": 1234}
    return client.complete_json(**{**arguments, **overrides})


def transcribe(client, **overrides):
    arguments = {"wav": WAV, "language": "Hindi", "model": "muse-voice-transcribe-1.0"}
    return client.transcribe(**{**arguments, **overrides})


def multipart(request):
    """{part name: (headers, content)} from a recorded multipart/form-data request."""

    boundary = request["headers"]["content-type"].split("boundary=")[1].encode()
    segments = (b"\r\n" + request["body"]).split(b"\r\n--" + boundary)

    assert segments[0] == b""
    assert segments[-1] == b"--\r\n"

    parts = {}
    for segment in segments[1:-1]:
        head, _, content = segment[2:].partition(b"\r\n\r\n")
        headers = dict(line.split(": ", 1) for line in head.decode().split("\r\n"))
        name = headers["Content-Disposition"].split('name="')[1].split('"')[0]
        parts[name] = (headers, content)

    return parts


# ---------------------------------------------------------------- the chat call


def test_the_chat_call_goes_to_the_one_url_with_the_key_as_a_bearer_token(stub, client):
    stub.reply_chat("{}")

    complete(client)

    (request,) = stub.requests
    assert request["path"] == "/chat/completions"
    assert request["headers"]["authorization"] == f"Bearer {KEY}"
    assert request["headers"]["content-type"] == "application/json"
    assert request["headers"]["accept"] == "application/json"
    # Some gateways turn urllib's own agent string away.
    assert request["headers"]["user-agent"] == "arthniti-backend"


def test_the_chat_body_asks_for_the_schema_with_low_reasoning_and_sets_no_temperature(stub, client):
    stub.reply_chat("{}")

    complete(client)

    body = json.loads(stub.requests[0]["body"])
    assert body == {
        "model": "muse-spark-1.3",
        "messages": MESSAGES,
        "response_format": {
            "type": "json_schema",
            "json_schema": {"name": "form_answers", "schema": SCHEMA},
        },
        "reasoning_effort": "low",
        "max_completion_tokens": 1234,
        "prompt_cache_key": "form_answers",
    }


def test_the_cache_key_names_the_task_so_calls_for_one_task_share_a_prefix(stub, client):
    # Meta caches the start of a prompt by itself; the key only helps it route
    # the calls that begin alike to the same place. One key for one task, never
    # one per person, which would split the calls that could share.
    stub.reply_chat("{}")

    complete(client, schema_name="form_answers")
    complete(client, schema_name="another_task")

    keys = [json.loads(request["body"])["prompt_cache_key"] for request in stub.requests]
    assert keys == ["form_answers", "another_task"]


def test_the_chat_call_returns_the_json_the_model_wrote(client, stub):
    stub.reply_chat('{"text_answers": [], "money_answers": []}')

    assert complete(client) == {"text_answers": [], "money_answers": []}


def test_the_first_choice_is_the_one_used(stub, client):
    first = {"message": {"role": "assistant", "content": '{"n": 1}'}}
    second = {"message": {"role": "assistant", "content": '{"n": 2}'}}
    stub.reply(body=json.dumps({"choices": [first, second]}).encode())

    assert complete(client) == {"n": 1}


def test_a_trailing_slash_on_the_base_url_is_harmless(stub, spend):
    stub.reply_chat("{}")

    complete(MetaClient(KEY, spend=spend, base_url=stub.url + "/", timeout=5))

    assert stub.requests[0]["target"] == "/chat/completions"


# ---------------------------------------------------------------- what a chat call used


def test_a_new_client_has_no_token_counts(client):
    assert client.last_usage == {}


def test_the_token_counts_meta_reports_are_kept_for_the_caller_to_read(stub, client):
    stub.reply_chat(
        "{}",
        usage={
            "prompt_tokens": 412,
            "completion_tokens": 95,
            "total_tokens": 507,
            "prompt_tokens_details": {"cached_tokens": 256},
            "completion_tokens_details": {"reasoning_tokens": 31},
        },
    )

    complete(client)

    # total_tokens is not kept: it is the sum of two figures that are.
    assert client.last_usage == {
        "prompt_tokens": 412,
        "cached_tokens": 256,
        "completion_tokens": 95,
        "reasoning_tokens": 31,
    }


def test_a_reply_without_token_counts_leaves_none(stub, client):
    stub.reply_chat("{}")

    complete(client)

    assert client.last_usage == {}


@pytest.mark.parametrize("odd", [True, -1, 1.5, "12", None, [3], {"n": 3}], ids=repr)
def test_a_count_that_is_not_a_whole_number_is_left_out(stub, client, odd):
    # These figures are printed by the smoke script; nothing else Meta sends
    # should reach a terminal through them.
    stub.reply_chat("{}", usage={"prompt_tokens": odd, "completion_tokens": 7})

    complete(client)

    assert client.last_usage == {"completion_tokens": 7}


@pytest.mark.parametrize("usage", ["lots", [1, 2], 5], ids=repr)
def test_token_counts_that_are_not_an_object_leave_none(stub, client, usage):
    stub.reply_chat("{}", usage=usage)

    complete(client)

    assert client.last_usage == {}


def test_details_that_are_null_do_not_hide_the_main_counts(stub, client):
    stub.reply_chat(
        "{}",
        usage={
            "prompt_tokens": 5,
            "completion_tokens": 3,
            "prompt_tokens_details": None,
            "completion_tokens_details": None,
        },
    )

    complete(client)

    assert client.last_usage == {"prompt_tokens": 5, "completion_tokens": 3}


def test_a_count_of_zero_is_a_count(stub, client):
    stub.reply_chat(
        "{}",
        usage={"prompt_tokens": 5, "completion_tokens": 3, "prompt_tokens_details": {"cached_tokens": 0}},
    )

    complete(client)

    assert client.last_usage["cached_tokens"] == 0


def test_the_counts_of_a_reply_that_could_not_be_used_are_still_kept(stub, client):
    # Meta billed the tokens whether or not the answer was any good.
    stub.reply_chat("not json", usage={"prompt_tokens": 40, "completion_tokens": 9})

    with pytest.raises(MetaError) as bad:
        complete(client)

    assert bad.value.kind == "bad_output"
    assert client.last_usage == {"prompt_tokens": 40, "completion_tokens": 9}


def test_the_counts_of_one_call_are_not_shown_for_the_next(stub, client):
    stub.reply_chat("{}", usage={"prompt_tokens": 40, "completion_tokens": 9})
    complete(client)

    stub.reply(status=500)
    with pytest.raises(MetaError):
        complete(client)

    assert client.last_usage == {}


# ---------------------------------------------------------------- the speech call


def test_the_speech_call_sends_a_request_part_and_an_audio_part(stub, client):
    stub.reply(body=json.dumps({"sessionId": "s", "transcript": "namaste", "audioDurationMs": 1000, "turns": []}).encode())

    transcribe(client)

    (request,) = stub.requests
    assert request["path"] == "/asr/transcribe"
    assert request["headers"]["authorization"] == f"Bearer {KEY}"
    assert request["headers"]["accept"] == "application/json"
    assert request["headers"]["content-type"].startswith("multipart/form-data; boundary=")

    parts = multipart(request)
    assert set(parts) == {"request", "audio"}

    head, content = parts["request"]
    assert head["Content-Type"] == "application/json"
    assert "filename" not in head["Content-Disposition"]
    assert json.loads(content) == {
        "model": "muse-voice-transcribe-1.0",
        "audioEncoding": "WAV",
        "mode": "PUSH_TO_TALK",
        "languageBias": ["Hindi"],
    }

    head, content = parts["audio"]
    assert head["Content-Type"] == "audio/wav"
    assert 'filename="recording.wav"' in head["Content-Disposition"]
    # Byte for byte, whatever the audio contains.
    assert content == WAV


def test_the_words_to_favour_go_in_the_request_part(stub, client):
    stub.reply(body=b'{"transcript": ""}')

    transcribe(client, keywords=("lakh", "EMI"))

    _, content = multipart(stub.requests[0])["request"]
    assert json.loads(content) == {
        "model": "muse-voice-transcribe-1.0",
        "audioEncoding": "WAV",
        "mode": "PUSH_TO_TALK",
        "languageBias": ["Hindi"],
        "keywords": ["lakh", "EMI"],
    }


@pytest.mark.parametrize("none", [(), []], ids=["tuple", "list"])
def test_an_empty_list_of_words_is_not_sent(stub, client, none):
    # What Meta does with "keywords": [] is not documented; leaving it out is.
    stub.reply(body=b'{"transcript": ""}')

    transcribe(client, keywords=none)

    _, content = multipart(stub.requests[0])["request"]
    assert "keywords" not in json.loads(content)


def test_each_speech_call_uses_a_new_boundary(stub, client):
    stub.reply(body=b'{"transcript": ""}')

    transcribe(client)
    transcribe(client)

    first, second = (request["headers"]["content-type"].split("boundary=")[1] for request in stub.requests)
    assert first != second
    # Long enough that the audio cannot happen to contain it.
    assert min(len(first), len(second)) >= 32


def test_the_speech_call_returns_the_transcript(stub, client):
    stub.reply(body=json.dumps({"transcript": "मेरे पास पचास हज़ार हैं"}).encode())

    assert transcribe(client) == "मेरे पास पचास हज़ार हैं"


def test_a_recording_of_silence_is_an_empty_transcript_and_not_an_error(stub, client):
    stub.reply(body=b'{"sessionId": "s", "transcript": "", "turns": []}')

    assert transcribe(client) == ""


# ---------------------------------------------------------------- errors, by kind


CALLS = {"chat": complete, "speech": transcribe}


@pytest.fixture(params=sorted(CALLS))
def call(request, client):
    return lambda: CALLS[request.param](client)


@pytest.mark.parametrize(
    ("status", "kind"),
    [
        (400, "bad_request"),
        (401, "auth"),
        (402, "billing"),
        (403, "auth"),
        (404, "bad_request"),
        (413, "bad_request"),
        (422, "bad_request"),
        (429, "rate_limited"),
        (500, "unavailable"),
        (502, "unavailable"),
        (503, "unavailable"),
        (504, "unavailable"),
        # Not in Meta's list: any other refusal is ours to fix, any other failure is theirs.
        (405, "bad_request"),
        (409, "bad_request"),
        (418, "bad_request"),
        (499, "bad_request"),
        (501, "unavailable"),
        (599, "unavailable"),
    ],
)
def test_an_http_error_is_sorted_into_a_kind_for_both_calls(stub, call, status, kind):
    stub.reply(status=status, body=b'{"error": {"message": "x"}}')

    with pytest.raises(MetaError) as raised:
        call()

    assert raised.value.kind == kind
    assert raised.value.status == status
    # Raised without the error it came from, so a traceback shows no cause.
    assert raised.value.__suppress_context__ is True


def test_meta_s_error_code_and_the_parameter_it_blames_are_kept_for_the_smoke_script(stub, call):
    stub.reply(
        status=400,
        body=json.dumps(
            {"error": {"message": "Unsupported parameter", "type": "invalid_request_error", "param": "reasoning_effort", "code": "invalid_value"}}
        ).encode(),
    )

    with pytest.raises(MetaError) as raised:
        call()

    assert raised.value.code == "invalid_value"
    assert raised.value.param == "reasoning_effort"


@pytest.mark.parametrize("name", sorted(CALLS))
def test_meta_s_message_is_kept_only_when_the_client_is_asked_to_keep_it(stub, spend, name):
    body = json.dumps({"error": {"message": "Unsupported   parameter\nreasoning_effort"}}).encode()
    stub.reply(status=400, body=body)

    with pytest.raises(MetaError) as quiet:
        CALLS[name](MetaClient(KEY, spend=spend, base_url=stub.url, timeout=5))
    with pytest.raises(MetaError) as asked:
        CALLS[name](MetaClient(KEY, spend=spend, base_url=stub.url, timeout=5, keep_detail=True))

    assert quiet.value.detail == ""
    # Kept with its white space tidied, for a person reading the smoke output.
    assert asked.value.detail == "Unsupported parameter reasoning_effort"


@pytest.mark.parametrize(
    "body",
    [
        b"<html>Bad gateway</html>",
        b"",
        b"[]",
        b'{"detail": "no error key"}',
        b'{"error": "text"}',
        b'{"error": {"code": 5, "param": ["x"], "message": 7}}',
        b'{"error": {"code": "has spaces and a \\n newline", "param": "' + b"p" * 200 + b'"}}',
        b'{"error": {"code": "two words", "param": "<b>x</b>"}}',
    ],
)
def test_an_error_body_that_is_not_the_expected_shape_gives_no_code_and_does_not_crash(stub, call, body):
    stub.reply(status=500, body=body)

    with pytest.raises(MetaError) as raised:
        call()

    assert raised.value.kind == "unavailable"
    assert raised.value.code is None
    assert raised.value.param is None


@pytest.mark.parametrize("name", sorted(CALLS))
def test_a_long_error_message_is_cut_short(stub, spend, name):
    stub.reply(status=400, body=json.dumps({"error": {"message": "m" * 5000}}).encode())

    with pytest.raises(MetaError) as raised:
        CALLS[name](MetaClient(KEY, spend=spend, base_url=stub.url, timeout=5, keep_detail=True))

    assert raised.value.detail == "m" * 300


@pytest.mark.parametrize(
    ("header", "expected"),
    [
        ("7", 7),
        ("0", 0),
        ("99999", 3600),
        ("Wed, 21 Oct 2026 07:28:00 GMT", None),
        ("-5", None),
        ("1.5", None),
        ("", None),
        # Too many digits to be a wait. Python refuses to read a number of
        # thousands of digits, and that must not become an unhandled error.
        pytest.param("9" * 10, None, id="ten digits"),
        pytest.param("9" * 5000, None, id="five thousand digits"),
    ],
)
def test_how_long_to_wait_is_read_from_retry_after(stub, call, header, expected):
    stub.reply(status=429, headers={"Retry-After": header})

    with pytest.raises(MetaError) as raised:
        call()

    assert raised.value.retry_after == expected


def test_there_is_no_wait_to_report_when_meta_sent_none(stub, call):
    stub.reply(status=429)

    with pytest.raises(MetaError) as raised:
        call()

    assert raised.value.retry_after is None


# ---------------------------------------------------------------- answers that are not usable


@pytest.mark.parametrize(
    "body",
    [
        b"not json at all",
        b"",
        b"{}",
        b'{"choices": []}',
        b'{"choices": "x"}',
        b'{"choices": [null]}',
        b'{"choices": [{}]}',
        b'{"choices": [{"message": {}}]}',
        b'{"choices": [{"message": {"content": null}}]}',
        b'{"choices": [{"message": {"content": ["a"]}}]}',
        b'{"choices": [{"message": {"content": "not json"}}]}',
        b'{"choices": [{"message": {"content": "{\\"a\\":"}}]}',
        b'{"choices": [{"message": {"content": ""}}]}',
    ],
    ids=repr,
)
def test_a_chat_reply_without_json_content_is_bad_output(stub, client, body):
    stub.reply(body=body)

    with pytest.raises(MetaError) as raised:
        complete(client)

    assert raised.value.kind == "bad_output"


@pytest.mark.parametrize(
    "body",
    [b"not json at all", b"", b"{}", b"[]", b'{"transcript": null}', b'{"transcript": 5}', b'{"transcript": ["a"]}'],
    ids=repr,
)
def test_a_speech_reply_without_a_transcript_is_bad_output(stub, client, body):
    stub.reply(body=body)

    with pytest.raises(MetaError) as raised:
        transcribe(client)

    assert raised.value.kind == "bad_output"


# ---------------------------------------------------------------- the network


@pytest.mark.parametrize(
    "failure",
    [ConnectionRefusedError(10061, "refused"), socket.gaierror(11001, "no such host"), OSError(10051, "network unreachable")],
    ids=["refused", "no such host", "unreachable"],
)
def test_a_server_that_cannot_be_reached_is_unavailable(monkeypatch, call, failure):
    # Made up here and not with a closed port: on Windows a refused connection
    # to this machine takes two seconds to be reported.
    def cannot_connect(*args, **kwargs):
        raise failure

    monkeypatch.setattr(socket, "create_connection", cannot_connect)

    with pytest.raises(MetaError) as raised:
        call()

    assert raised.value.kind == "unavailable"
    assert raised.value.status is None
    assert raised.value.__suppress_context__ is True


def test_a_server_that_takes_too_long_is_unavailable(stub, spend):
    stub.reply(delay=0.8)

    with pytest.raises(MetaError) as raised:
        complete(MetaClient(KEY, spend=spend, base_url=stub.url, timeout=0.2))

    assert raised.value.kind == "unavailable"


@pytest.mark.parametrize("status", [301, 302, 303, 307, 308])
def test_a_redirect_is_never_followed_because_the_key_would_go_with_it(stub, call, status):
    # A second server is the "other address": it must never hear from the client.
    elsewhere = Stub()

    try:
        stub.reply(status=status, headers={"Location": elsewhere.url + "/elsewhere"})

        with pytest.raises(MetaError) as raised:
            call()
    finally:
        elsewhere.close()

    assert raised.value.kind == "unavailable"
    assert len(stub.requests) == 1
    assert elsewhere.requests == []


@pytest.mark.parametrize(
    "raw",
    [
        b"",
        b"this is not http\r\n\r\n",
        # A chunk that promises 32 bytes and stops after 17.
        b'HTTP/1.0 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n20\r\n{"transcript": "p',
    ],
    ids=["hangs up", "not http", "chunk cut off"],
)
def test_a_reply_that_is_not_a_whole_http_reply_is_unavailable(stub, call, raw):
    stub.reply(raw=raw)

    with pytest.raises(MetaError) as raised:
        call()

    assert raised.value.kind == "unavailable"
    assert raised.value.status is None
    assert raised.value.__suppress_context__ is True


def test_a_body_shorter_than_it_promised_is_not_taken_as_an_answer(stub, call):
    # http.client hands back what arrived without complaint; the half-written
    # JSON is what stops it being used.
    stub.reply(raw=b'HTTP/1.0 200 OK\r\nContent-Length: 90\r\n\r\n{"transcript": "part')

    with pytest.raises(MetaError) as raised:
        call()

    assert raised.value.kind == "bad_output"


# ---------------------------------------------------------------- what is read back


def speech_body_of_size(size):
    start, end = b'{"transcript": "', b'"}'

    return start + b"a" * (size - len(start) - len(end)) + end


def test_a_reply_of_exactly_the_size_cap_is_read(stub, client):
    stub.reply(body=speech_body_of_size(MAX_RESPONSE_BYTES))

    assert len(transcribe(client)) > MAX_RESPONSE_BYTES - 100


def test_a_reply_one_byte_over_the_size_cap_is_refused(stub, client):
    stub.reply(body=speech_body_of_size(MAX_RESPONSE_BYTES + 1))

    with pytest.raises(MetaError) as raised:
        transcribe(client)

    assert raised.value.kind == "bad_output"


def test_an_oversized_error_reply_still_gives_its_kind_and_no_details(stub, call):
    stub.reply(status=429, body=b'{"error": {"code": "slow_down"}}' + b" " * MAX_RESPONSE_BYTES)

    with pytest.raises(MetaError) as raised:
        call()

    assert raised.value.kind == "rate_limited"
    assert raised.value.code is None


def test_a_reply_nested_too_deeply_to_read_is_bad_output_and_not_a_crash(stub, call):
    stub.reply(body=b"[" * 200_000)

    with pytest.raises(MetaError) as raised:
        call()

    assert raised.value.kind == "bad_output"


def test_an_error_reply_nested_too_deeply_to_read_still_gives_its_kind(stub, call):
    stub.reply(status=503, body=b'{"error": ' + b"[" * 200_000)

    with pytest.raises(MetaError) as raised:
        call()

    assert raised.value.kind == "unavailable"
    assert raised.value.code is None


def test_an_error_reply_cut_off_in_the_middle_still_gives_its_kind(stub, call):
    # A chunk that promises 64 bytes and stops after 20.
    stub.reply(raw=b'HTTP/1.0 503 Service Unavailable\r\nTransfer-Encoding: chunked\r\n\r\n40\r\n{"error": {"code": "x"')

    with pytest.raises(MetaError) as raised:
        call()

    assert (raised.value.kind, raised.value.status, raised.value.code) == ("unavailable", 503, None)


# ---------------------------------------------------------------- replies a real server cannot be made to send


class _Endless:
    """A reply with no end. Remembers the most it was asked for in one read."""

    def __init__(self):
        self.most = 0

    def __enter__(self):
        return self

    def __exit__(self, *exc_info):
        return False

    def read(self, amt=-1):
        assert amt is not None and amt >= 0, "the reply was read with no limit"
        self.most = max(self.most, amt)
        return b"x" * amt


class _DyingBody:
    """The body of an error reply whose connection drops while it is being read."""

    closed = False

    def read(self, amt=-1):
        raise ConnectionResetError(10054, "reset by peer")

    def close(self):
        self.closed = True


def next_call_ends_with(monkeypatch, outcome):
    """The client's next request returns `outcome`, or raises it if it is an exception."""

    def open_(self, request, data=None, timeout=None):
        if isinstance(outcome, BaseException):
            raise outcome
        return outcome

    monkeypatch.setattr(urllib.request.OpenerDirector, "open", open_)


def test_a_reply_is_never_read_past_the_size_cap(monkeypatch, client):
    endless = _Endless()
    next_call_ends_with(monkeypatch, endless)

    with pytest.raises(MetaError) as raised:
        complete(client)

    assert raised.value.kind == "bad_output"
    assert endless.most <= MAX_RESPONSE_BYTES + 1


def test_an_error_reply_that_dies_while_being_read_still_gives_its_status(monkeypatch, client):
    body = _DyingBody()
    next_call_ends_with(monkeypatch, urllib.error.HTTPError("http://127.0.0.1/", 503, "Service Unavailable", {}, body))

    with pytest.raises(MetaError) as raised:
        complete(client)

    assert (raised.value.kind, raised.value.status, raised.value.code) == ("unavailable", 503, None)
    assert raised.value.__suppress_context__ is True
    # The connection behind an error reply is let go of, whatever became of it.
    assert body.closed


# ---------------------------------------------------------------- the spend cap
#
# The owner has no budget for the model API beyond a free credit, so a call is
# charged to the cap before it is sent, at a price that is too high and not too
# low. What the cap does with the charge is tested in test_spend_cap.py.


def answer(stub, name):
    """Have the stub answer this kind of call the way Meta would, so the call succeeds."""

    if name == "chat":
        stub.reply_chat("{}")
    else:
        stub.reply(body=b'{"transcript": ""}')


def dollars(input_bytes, output_tokens, rates=(1.25, 4.25)):
    """The most a chat call can cost: a token for every byte sent, and the whole allowance written."""

    return (input_bytes * rates[0] + output_tokens * rates[1]) / 1_000_000


# Bytes in a second of 16 kHz mono 16-bit sound, which is what the app records.
SECOND = 32_000


@pytest.mark.parametrize("name", sorted(CALLS))
def test_each_call_is_charged_once_and_before_anything_is_sent(stub, spend, client, name):
    answer(stub, name)

    CALLS[name](client)

    assert len(spend.charges) == 1
    assert spend.sent_before == [0]
    assert len(stub.requests) == 1


@pytest.mark.parametrize("name", sorted(CALLS))
def test_a_call_the_cap_refuses_is_never_sent(stub, tmp_path, name):
    answer(stub, name)
    client = MetaClient(KEY, spend=SpendCap(tmp_path / "ledger", 0.0001), base_url=stub.url, timeout=5)

    with pytest.raises(MetaError) as raised:
        CALLS[name](client)

    assert raised.value.kind == "spend_cap"
    assert stub.requests == []
    assert not (tmp_path / "ledger").exists()


@pytest.mark.parametrize("name", sorted(CALLS))
@pytest.mark.parametrize("status", [400, 429, 500])
def test_a_call_that_fails_is_still_charged(stub, spend, client, name, status):
    stub.reply(status=status)

    with pytest.raises(MetaError):
        CALLS[name](client)

    assert len(spend.charges) == 1


def test_a_chat_call_is_charged_a_token_for_every_byte_sent_and_the_whole_allowance_written(stub, spend, client):
    stub.reply_chat("{}")

    complete(client)

    assert spend.charges == [pytest.approx(dollars(len(stub.requests[0]["body"]), 1234))]


@pytest.mark.parametrize(
    ("model", "rates"),
    [
        ("muse-spark-1.3", (1.25, 4.25)),
        ("muse-spark-1.2", (1.25, 4.25)),
        ("muse-spark-1.1", (1.25, 4.25)),
        ("muse-wonder-1.0", (4.00, 20.00)),
        # A name that is not on the list is charged as the dearest model, so a
        # new model can only look dearer than it is.
        ("muse-spark-9.9", (4.00, 20.00)),
        ("a-model-nobody-listed", (4.00, 20.00)),
    ],
)
def test_a_model_is_charged_its_listed_price_and_an_unlisted_one_the_dearest(stub, spend, client, model, rates):
    stub.reply_chat("{}")

    complete(client, model=model)

    assert spend.charges == [pytest.approx(dollars(len(stub.requests[0]["body"]), 1234, rates))]


@pytest.mark.parametrize(
    ("size", "seconds"),
    [
        (30 * SECOND, 30),
        # A second begun is a second billed.
        (30 * SECOND + 1, 31),
        (100 * SECOND, 100),
    ],
)
def test_a_recording_is_charged_by_its_length_rounded_up_to_whole_seconds(stub, spend, client, size, seconds):
    stub.reply(body=b'{"transcript": ""}')

    transcribe(client, wav=b"\0" * size)

    assert spend.charges == [pytest.approx(seconds * 0.18 / 3600)]


@pytest.mark.parametrize("size", [0, 44, len(WAV), 9 * SECOND, 10 * SECOND])
def test_a_short_recording_is_charged_as_ten_seconds_at_least(stub, spend, client, size):
    # Meta documents no minimum charge; this does not rely on there being none.
    stub.reply(body=b'{"transcript": ""}')

    transcribe(client, wav=b"\0" * size)

    assert spend.charges == [pytest.approx(10 * 0.18 / 3600)]


def test_a_charge_reaches_the_ledger_in_dollars_and_not_in_some_other_unit(stub, tmp_path):
    stub.reply_chat("{}")
    client = MetaClient(KEY, spend=SpendCap(tmp_path / "ledger", 1.0), base_url=stub.url, timeout=5)

    complete(client)

    (entry,) = (tmp_path / "ledger").read_text().split()
    # The ledger counts millionths of a dollar; one of rounding is allowed.
    assert abs(int(entry) - dollars(len(stub.requests[0]["body"]), 1234) * 1_000_000) <= 1


def test_a_client_cannot_be_built_without_a_spend_cap():
    with pytest.raises(TypeError):
        MetaClient(KEY)


@pytest.mark.parametrize("cap", [None, object(), "ten dollars", 10, SimpleNamespace(charge="free")], ids=repr)
def test_something_that_cannot_charge_is_not_a_spend_cap(cap):
    with pytest.raises(ValueError, match="spend cap"):
        MetaClient(KEY, spend=cap)


# ---------------------------------------------------------------- what the client is built from


@pytest.mark.parametrize("key", ["", " ", "has space", "new\nline", "tab\there", "é", "x" * 513], ids=repr)
def test_a_key_that_cannot_go_in_a_header_is_refused(spend, key):
    with pytest.raises(ValueError):
        MetaClient(key, spend=spend)


def test_a_refused_key_is_not_echoed_back(spend):
    secret = "LLM_9_" + "zQ" * 8

    with pytest.raises(ValueError) as raised:
        MetaClient(secret + " trailing", spend=spend)

    assert secret not in str(raised.value) + repr(raised.value.args)


@pytest.mark.parametrize(
    "url",
    [
        "file:///etc/passwd",
        "ftp://example.com/",
        "data:text/plain,x",
        "api.meta.ai/v1",
        "",
        "//api.meta.ai/v1",
        "httpx://example.com",
        "https:example.com",
    ],
    ids=repr,
)
def test_a_base_url_that_is_not_http_or_https_is_refused(spend, url):
    with pytest.raises(ValueError):
        MetaClient(KEY, spend=spend, base_url=url)


def test_the_default_address_is_meta_s_over_https():
    # Not called here. The key is sent to this address and no other.
    assert inspect.signature(MetaClient).parameters["base_url"].default == "https://api.meta.ai/v1"


# ---------------------------------------------------------------- what an error may contain


@pytest.mark.parametrize("name", sorted(CALLS))
def test_no_error_carries_the_key_the_persons_words_or_what_meta_sent_back(stub, spend, name):
    # The client that keeps Meta's message is the strict case: the text is in
    # the object, and still must not be in anything that gets printed.
    client = MetaClient(KEY, spend=spend, base_url=stub.url, timeout=5, keep_detail=True)

    for status in (400, 401, 402, 429, 500, 503):
        stub.reply(status=status, body=json.dumps({"error": {"message": f"{UPSTREAM} {WORDS} {KEY}", "code": "c"}}).encode())

        with pytest.raises(MetaError) as raised:
            CALLS[name](client)

        # What str(), repr() and the arguments show is what a log line or an
        # unhandled traceback would print.
        shown = " ".join([str(raised.value), repr(raised.value), repr(raised.value.args)])
        for secret in (KEY, WORDS, UPSTREAM):
            assert secret not in shown


def test_an_error_prints_as_its_kind_and_its_status():
    assert str(MetaError("auth", 401)) == "auth (HTTP 401)"
    assert str(MetaError("unavailable")) == "unavailable"


@pytest.mark.parametrize("name", sorted(CALLS))
def test_a_bad_output_error_does_not_carry_the_body_either(stub, client, name):
    if name == "chat":
        stub.reply_chat(f"{UPSTREAM} {WORDS} but not json")
    else:
        stub.reply(body=f"{UPSTREAM} {WORDS} but not json".encode())

    with pytest.raises(MetaError) as raised:
        CALLS[name](client)

    assert UPSTREAM not in str(raised.value) + repr(raised.value) + repr(raised.value.args)
    assert raised.value.__cause__ is None
    assert raised.value.__suppress_context__ is True


def test_printing_the_client_never_prints_the_key(client):
    assert KEY not in repr(client)
    assert KEY not in str(client)
