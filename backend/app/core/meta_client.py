"""The only code that talks to Meta's model API: one speech call, one chat call.

Everything else in the app works from plain values. A route hands this module a
recording or a prompt and gets text or a JSON object back, and the tests hand
the route a fake in its place. That swap is why this is a class in a codebase of
module-level functions: `create_app(model_client=...)` needs one object with two
methods to replace.

Standard library only. The app has no HTTP client dependency, and a JSON post
and a two-part form post do not justify adding one.

The wire format follows Meta's documentation. It has not been checked against
the live API; `python -m app.smoke_meta`, run with a real key, does that.

What an error may hold is decided here, once. A MetaError carries a kind, the
HTTP status, and Meta's own error code and parameter name (kept only if they are
short plain tokens). It never holds the key, the person's words or a response
body, and it is raised `from None` so a traceback does not print the cause. Meta's
error *message* can echo what was sent, so it is kept only when the client is
built with `keep_detail=True`, which only the smoke script does.
"""

import http.client
import json
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
# is not the shape documented).
_KIND_BY_STATUS = {
    401: "auth",
    402: "billing",
    403: "auth",
    429: "rate_limited",
}


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
    def __init__(self, api_key: str, base_url: str = DEFAULT_BASE_URL, timeout: float = 30, keep_detail: bool = False):
        if not _KEY.fullmatch(api_key):
            raise ValueError("The API key is empty or has a character that cannot go in a header.")

        # urllib would also open file: and ftp: addresses.
        if not base_url.startswith(("http://", "https://")):
            raise ValueError("The base URL must start with http:// or https://.")

        self._key = api_key
        self._base = base_url.rstrip("/")
        # ponytail: a timeout for each wait on the network, not for the whole
        # call; a server that sends a byte a second can hold a thread. A total
        # deadline needs a worker thread or an async client.
        self._timeout = timeout
        self._keep_detail = keep_detail
        # Built here and not at import: it reads the proxy settings of the
        # environment as they are now.
        self._opener = urllib.request.build_opener(_RefuseRedirects)

    def _post(self, path: str, body: bytes, content_type: str):
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
        """

        body = {
            "model": model,
            "messages": messages,
            "response_format": {"type": "json_schema", "json_schema": {"name": schema_name, "schema": schema}},
            "reasoning_effort": "low",
            "max_completion_tokens": max_tokens,
        }

        reply = self._post("/chat/completions", json.dumps(body).encode(), "application/json")

        try:
            return json.loads(json.loads(reply)["choices"][0]["message"]["content"])
        except (ValueError, LookupError, TypeError, RecursionError):
            raise MetaError("bad_output") from None

    def transcribe(self, wav: bytes, language: str, model: str):
        """The transcript of a mono 16-bit WAV, with `language` (a name such as "Hindi") as the bias."""

        # 128 random bits: the boundary cannot be found inside the audio.
        boundary = secrets.token_hex(16)
        settings = json.dumps({"model": model, "audioEncoding": "WAV", "mode": "PUSH_TO_TALK", "languageBias": [language]})

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

        reply = self._post("/asr/transcribe", body, f"multipart/form-data; boundary={boundary}")

        try:
            transcript = json.loads(reply)["transcript"]
        except (ValueError, LookupError, TypeError, RecursionError):
            raise MetaError("bad_output") from None

        # A recording of silence is an empty transcript, and is not an error.
        if not isinstance(transcript, str):
            raise MetaError("bad_output")

        return transcript
