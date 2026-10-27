"""The only code that talks to Meta's model API: one speech call, one chat call.

Everything else in the app works from plain values. A route hands this module a
recording or a prompt and gets text or a JSON object back, and the tests hand
the route a fake in its place. That swap is why this is a class in a codebase of
module-level functions: `create_app(model_client=...)` needs one object with two
methods to replace.

Standard library only. The app has no HTTP client dependency, and a JSON post
and a two-part form post do not justify adding one.

Every call is charged to a spend cap (core/spend.py) before it is sent, at a
price that is too high rather than too low, and a client cannot be built
without one. A call that fails after it was sent is charged all the same,
because Meta may have billed it.

The wire format follows Meta's documentation, and `python -m app.smoke_meta` has
run against the live API (the owner, 27 Oct 2026): the chat and speech calls were
accepted. The speech call has only heard one second of silence. What was seen is in
docs/HACKATHON.md section 4.

What an error may hold is decided here, once. A MetaError carries a kind, the
HTTP status, and Meta's own error code and parameter name (kept only if they are
short plain tokens). It never holds the key, the person's words or a response
body, and it is raised `from None` so a traceback does not print the cause. Meta's
error *message* can echo what was sent, so it is kept only when the client is
built with `keep_detail=True`, which only the smoke script does.
"""

import http.client
import json
import math
import re
import secrets
import urllib.error
import urllib.request


DEFAULT_BASE_URL = "https://api.meta.ai/v1"

# The longest reply that is read. A transcript, or a form's worth of answers, is
# a few kilobytes; anything near this is not what was asked for.
MAX_RESPONSE_BYTES = 1 << 20

MAX_DETAIL = 300

# The longest wait that Meta's Retry-After is allowed to ask of us.
MAX_RETRY_AFTER = 3600

# The same rule as the settings layer. It is checked again here because
# http.client puts a bad header value in its own error message, and that value
# is the key.
_KEY = re.compile(r"[\x21-\x7e]{1,512}")

# A code or parameter name worth keeping: "invalid_api_key", "messages[0].content".
_TOKEN = re.compile(r"[A-Za-z0-9_.\[\]-]{1,64}")

_SECONDS = re.compile(r"[0-9]{1,9}")

# Why a call failed, which is all a route needs to choose what to tell the
# person: bad_request (we sent something Meta refuses: 400, 404, 413, 422 and
# any other 4xx), auth (the key), billing, rate_limited, unavailable (the
# network, a timeout, a 5xx), bad_output (Meta answered 200 with something that
# is not the shape documented), spend_cap (our own ceiling refused the call, and
# nothing was sent).
_KIND_BY_STATUS = {
    401: "auth",
    402: "billing",
    403: "auth",
    429: "rate_limited",
}

# Dollars per million tokens, (input, output), from Meta's price list as read on
# 26 Oct 2026. A model that is not listed is charged as the dearest one, so a
# model that is new or misspelt can only look dearer than it is.
_SPARK = (1.25, 4.25)
_DEAREST = (4.00, 20.00)
_CHAT_PRICES = {"muse-spark-1.3": _SPARK, "muse-spark-1.2": _SPARK, "muse-spark-1.1": _SPARK}

# Speech is billed by the whole second of audio. A recording is charged as at
# least ten seconds, because no minimum charge is documented and none is
# assumed. The app records 16 kHz mono 16-bit sound, 32,000 bytes a second, and
# a 24 kHz recording is taken for longer than it is.
_SPEECH_PER_HOUR = 0.18
_SPEECH_FLOOR_SECONDS = 10
_WAV_BYTES_PER_SECOND = 32_000


def _chat_cost(model: str, request_bytes: int, max_tokens: int):
    """The most a chat call can cost, in dollars: a token for every byte sent and the whole allowance written.

    No tokenizer makes a token of less than a byte. The allowance counts the
    reasoning tokens, which Meta bills as output.
    """

    input_price, output_price = _CHAT_PRICES.get(model, _DEAREST)

    return (request_bytes * input_price + max_tokens * output_price) / 1_000_000


def _speech_cost(wav_bytes: int):
    seconds = max(math.ceil(wav_bytes / _WAV_BYTES_PER_SECOND), _SPEECH_FLOOR_SECONDS)

    return seconds * _SPEECH_PER_HOUR / 3600


# The token counts of a chat reply, and where Meta's documentation puts each.
_USAGE_FIELDS = {
    "prompt_tokens": ("usage", "prompt_tokens"),
    "cached_tokens": ("usage", "prompt_tokens_details", "cached_tokens"),
    "completion_tokens": ("usage", "completion_tokens"),
    "reasoning_tokens": ("usage", "completion_tokens_details", "reasoning_tokens"),
}


def _count(reply: object, *path: str):
    for step in path:
        reply = reply.get(step) if isinstance(reply, dict) else None

    # A bool is an int in Python and is not a count.
    return reply if type(reply) is int and reply >= 0 else None


def _usage(reply: object):
    found = {name: _count(reply, *path) for name, path in _USAGE_FIELDS.items()}

    return {name: count for name, count in found.items() if count is not None}


class MetaError(Exception):
    def __init__(self, kind: str, status=None, code=None, param=None, detail="", retry_after=None):
        # Only the kind and the status go in `args`, which is what str() and a
        # log line print. The rest are attributes for code that wants them.
        super().__init__(kind, status)
        self.kind = kind
        self.status = status
        self.code = code
        self.param = param
        self.detail = detail
        self.retry_after = retry_after

    def __str__(self):
        return self.kind if self.status is None else f"{self.kind} (HTTP {self.status})"


class _RefuseRedirects(urllib.request.HTTPRedirectHandler):
    # urllib resends the Authorization header to wherever a redirect points.
    # The key goes to the one address it is meant for, so a redirect is an error.
    def redirect_request(self, *args, **kwargs):
        return None


def _read(response):
    data = response.read(MAX_RESPONSE_BYTES + 1)

    if len(data) > MAX_RESPONSE_BYTES:
        raise MetaError("bad_output")

    return data


def _plain(value: object, pattern):
    return value if isinstance(value, str) and pattern.fullmatch(value) else None


def _details(error, keep_detail: bool):
    """(code, param, detail) from the documented {"error": {...}} reply, else Nones."""

    try:
        fields = json.loads(_read(error))["error"]
    except (ValueError, LookupError, TypeError, RecursionError, OSError, http.client.HTTPException, MetaError):
        return None, None, ""

    if not isinstance(fields, dict):
        return None, None, ""

    message = fields.get("message")
    detail = " ".join(message.split())[:MAX_DETAIL] if keep_detail and isinstance(message, str) else ""

    return _plain(fields.get("code"), _TOKEN), _plain(fields.get("param"), _TOKEN), detail


def _failure(error: urllib.error.HTTPError, keep_detail: bool):
    status = error.code
    code, param, detail = _details(error, keep_detail)

    wait = error.headers.get("Retry-After") or ""
    retry_after = min(int(wait), MAX_RETRY_AFTER) if _SECONDS.fullmatch(wait) else None

    kind = _KIND_BY_STATUS.get(status) or ("bad_request" if 400 <= status < 500 else "unavailable")

    return MetaError(kind, status, code, param, detail, retry_after)


class MetaClient:
    def __init__(self, api_key: str, *, spend, base_url: str = DEFAULT_BASE_URL, timeout: float = 30, keep_detail: bool = False):
        if not _KEY.fullmatch(api_key):
            raise ValueError("The API key is empty or has a character that cannot go in a header.")

        # urllib would also open file: and ftp: addresses.
        if not base_url.startswith(("http://", "https://")):
            raise ValueError("The base URL must start with http:// or https://.")

        # Anything with charge(usd) will do, which lets a test pass a fake.
        if not callable(getattr(spend, "charge", None)):
            raise ValueError("A spend cap is required: spend must have a charge(usd) method.")

        self._key = api_key
        self._spend = spend
        self._base = base_url.rstrip("/")
        # ponytail: a timeout for each wait on the network, not for the whole
        # call; a server that sends a byte a second can hold a thread. A total
        # deadline needs a worker thread or an async client.
        self._timeout = timeout
        self._keep_detail = keep_detail
        # The token counts Meta reported for the last chat call (see _usage), or
        # {}. ponytail: one slot for every thread, so under concurrent calls it
        # holds whichever finished last. Only the smoke script reads it, and it
        # makes its calls one at a time.
        self.last_usage = {}
        # Built here and not at import: it reads the proxy settings of the
        # environment as they are now.
        self._opener = urllib.request.build_opener(_RefuseRedirects)

    def _post(self, path: str, body: bytes, content_type: str, cost: float):
        # Before the request exists, so a refusal leaves nothing sent.
        self._spend.charge(cost)

        request = urllib.request.Request(
            self._base + path,
            data=body,
            method="POST",
            headers={
                "Authorization": f"Bearer {self._key}",
                "Content-Type": content_type,
                "Accept": "application/json",
                "User-Agent": "arthniti-backend",
            },
        )

        try:
            with self._opener.open(request, timeout=self._timeout) as response:
                return _read(response)
        except urllib.error.HTTPError as error:
            try:
                raise _failure(error, self._keep_detail) from None
            finally:
                error.close()
        except (OSError, http.client.HTTPException):
            raise MetaError("unavailable") from None

    def complete_json(self, model: str, messages: list, schema_name: str, schema: dict, max_tokens: int):
        """One chat call whose reply is constrained to `schema`; returns the parsed JSON.

        Reasoning is set to low: this is reading a few sentences, not solving a
        problem, and reasoning tokens are billed and count against max_tokens.
        No temperature is set; Meta documents a default of 1.0 for these models.

        Meta caches the start of a prompt by itself, so the instructions go
        first and the person's words last (services/intake_service.py). The
        cache key only helps it send the calls that begin alike, all the calls
        of one task, to the same cache.
        """

        body = {
            "model": model,
            "messages": messages,
            "response_format": {"type": "json_schema", "json_schema": {"name": schema_name, "schema": schema}},
            "reasoning_effort": "low",
            "max_completion_tokens": max_tokens,
            "prompt_cache_key": schema_name,
        }

        payload = json.dumps(body).encode()

        self.last_usage = {}

        reply = self._post("/chat/completions", payload, "application/json", _chat_cost(model, len(payload), max_tokens))

        try:
            parsed = json.loads(reply)
            # Before the answer is read: Meta billed these tokens whether or not
            # the answer is any use.
            self.last_usage = _usage(parsed)
            return json.loads(parsed["choices"][0]["message"]["content"])
        except (ValueError, LookupError, TypeError, RecursionError):
            raise MetaError("bad_output") from None

    def transcribe(self, wav: bytes, language: str, model: str, keywords=()):
        """The transcript of a mono 16-bit WAV, with `language` (a name such as "Hindi") as the bias.

        `keywords` are words the model is asked to favour: names, places, jargon.
        Meta does not promise their spelling.
        """

        # 128 random bits: the boundary cannot be found inside the audio.
        boundary = secrets.token_hex(16)
        request = {"model": model, "audioEncoding": "WAV", "mode": "PUSH_TO_TALK", "languageBias": [language]}

        if keywords:
            request["keywords"] = keywords

        settings = json.dumps(request)

        body = b"".join(
            [
                (
                    f'--{boundary}\r\nContent-Disposition: form-data; name="request"\r\n'
                    f"Content-Type: application/json\r\n\r\n{settings}\r\n"
                ).encode(),
                (
                    f'--{boundary}\r\nContent-Disposition: form-data; name="audio"; filename="recording.wav"\r\n'
                    "Content-Type: audio/wav\r\n\r\n"
                ).encode(),
                wav,
                f"\r\n--{boundary}--\r\n".encode(),
            ]
        )

        reply = self._post("/asr/transcribe", body, f"multipart/form-data; boundary={boundary}", _speech_cost(len(wav)))

        try:
            transcript = json.loads(reply)["transcript"]
        except (ValueError, LookupError, TypeError, RecursionError):
            raise MetaError("bad_output") from None

        # A recording of silence is an empty transcript, and is not an error.
        if not isinstance(transcript, str):
            raise MetaError("bad_output")

        return transcript
