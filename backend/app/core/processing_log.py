"""The processing log: one JSON line on stdout for every request.

It is the record a deploying organisation can keep of what this server did,
without keeping what anyone typed. Each line carries exactly these keys, in
this order:

  event          always "request"
  request_id     a fresh uuid4 hex, also sent back as the X-Request-ID header
                 (an incoming X-Request-ID is ignored)
  ts             when the request arrived, UTC, ISO 8601 with a "Z"
  tenant         ARTHNITI_TENANT
  method         the HTTP method, or "OTHER" for one this app never serves
  path           the route that was asked for, or "unmatched" for any path this
                 app does not serve; never the query string, because a path the
                 client made up could carry anything
  status         the response status, 500 when no response was started
  duration_ms    how long the request took, to 0.1 ms

and, for POST /api/analysis/run only:

  consent              the consent record as validated (schemas/analysis.py
                       Consent), or null when there was none or the request was
                       refused with a 422
  payload_sha256       a code computed from the answers (see payload_digest),
                       or null on a 422. Named payload_hmac_sha256 instead when
                       ARTHNITI_LOG_HASH_KEY is set, so the line says which
                       algorithm made it.

Nothing else from the request is written: not the body or any answer in it
(the consent record excepted), not the IP address, the user agent, any header
or a validation error's detail. tests/test_log_privacy.py sends a marker in
every text field and a distinctive figure in every rupee field and fails if any
of them reaches a log.

The code is pseudonymous personal data. The same answers always give the same
code, and the answers come from a small space (a category, a district, round
rupee figures), so anyone holding the log can test guesses against it. Keying
it with ARTHNITI_LOG_HASH_KEY stops that for anyone who does not hold the key.

The server's own access log is a different record, but it goes to the same
place. With its default settings uvicorn writes one plain-text line per request
to stdout, interleaved with these JSON lines, carrying the client address and
the path with its query string. Start uvicorn with --no-access-log for a stdout
that holds only this log.
"""

import hashlib
import hmac
import json
import logging
import sys
import time
import uuid
from datetime import datetime, timezone


PROCESSING_LOGGER = logging.getLogger("arthniti.processing")

# Startup notes and server errors, on stderr, kept apart from the JSON lines on
# stdout. "arthniti.startup" and "arthniti.errors" write through this one.
SERVER_LOGGER = logging.getLogger("arthniti")

ANALYSIS_PATH = "/api/analysis/run"

UNMATCHED = "unmatched"

# The body of Starlette's own 500.
INTERNAL_ERROR = b"Internal Server Error"

KNOWN_METHODS = frozenset({"GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"})


class _CurrentStreamHandler(logging.StreamHandler):
    # Writes to whatever sys.stdout or sys.stderr is when a line is written,
    # not when the handler was made, the way logging.lastResort does for
    # stderr. A handler holding the original stream would write past pytest's
    # capture, and past anything else that swaps the stream after import.
    def __init__(self, stream_name):
        logging.Handler.__init__(self)
        self.stream_name = stream_name

    @property
    def stream(self):
        return getattr(sys, self.stream_name)


def _attach(logger, stream_name, fmt):
    logger.setLevel(logging.INFO)
    # Not passed on to the root logger, so a deployer's own logging setup
    # neither duplicates these lines nor reformats the JSON.
    logger.propagate = False

    # create_app runs many times under test; one handler, however many apps.
    if any(isinstance(handler, _CurrentStreamHandler) for handler in logger.handlers):
        return

    handler = _CurrentStreamHandler(stream_name)
    handler.setFormatter(logging.Formatter(fmt))
    logger.addHandler(handler)


def configure_logging():
    _attach(PROCESSING_LOGGER, "stdout", "%(message)s")
    _attach(SERVER_LOGGER, "stderr", "%(levelname)s %(name)s: %(message)s")


def canonical_payload(body):
    """The exact bytes the payload code is computed over.

    Every field of the validated request, defaults included, as pydantic's JSON
    dump, minus `consent`; then json.dumps with sorted keys, no spaces,
    ensure_ascii=False and allow_nan=False, encoded as UTF-8. Numbers are as
    Python writes them after validation, so 50000 and 50000.0 give the same
    bytes ("50000.0"), and a field left out gives the same bytes as the same
    field sent with its default. Adding a field to the request model changes
    every code, because its default joins the dump.
    """
    data = body.model_dump(mode="json", exclude={"consent"})

    return json.dumps(
        data,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")


def payload_digest(body, key=None):
    # Plain SHA-256 without a key; HMAC-SHA256 with one.
    payload = canonical_payload(body)

    if key is None:
        return hashlib.sha256(payload).hexdigest()

    return hmac.new(key.encode("utf-8"), payload, hashlib.sha256).hexdigest()


def digest_field(key=None):
    return "payload_hmac_sha256" if key else "payload_sha256"


def note_analysis(request, body, key=None):
    """Hand the analysis route's two log values to the middleware.

    Called by the route with the validated request. The middleware reads this
    back when it writes the line; nothing else is stored.
    """
    consent = getattr(body, "consent", None)

    request.state.processing = {
        "consent": consent.model_dump(mode="json") if consent is not None else None,
        "digest": payload_digest(body, key),
    }


def _utc_now():
    return (
        datetime.now(timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )


def _route_path(scope):
    # The path the app routes on: scope["path"] less any root_path a proxy
    # mounted the app under (what Starlette's router strips before matching).
    path = scope.get("path", "")
    root_path = scope.get("root_path", "")

    if root_path and path.startswith(root_path):
        rest = path[len(root_path):]
        if not rest or rest.startswith("/"):
            return rest or "/"

    return path


def processing_log_middleware(app, tenant, known_paths, hash_key=None):
    """ASGI middleware that writes one processing line per HTTP request.

    Added last in main.create_app, so it is the outermost of the app's own
    middleware (Starlette's ServerErrorMiddleware sits outside it) and a CORS
    preflight gets a line and an X-Request-ID too. `known_paths` is every path
    the app serves: a path outside it is logged as "unmatched".
    """
    known_paths = frozenset(known_paths)
    field = digest_field(hash_key)

    async def middleware(scope, receive, send):
        if scope["type"] != "http":
            await app(scope, receive, send)
            return

        request_id = uuid.uuid4().hex
        ts = _utc_now()
        started = time.perf_counter()
        status = 500
        response_started = False

        # The route's request.state is this same dict, which is how
        # note_analysis hands its values back.
        state = scope.setdefault("state", {})
        state["request_id"] = request_id

        async def send_with_request_id(message):
            nonlocal status, response_started

            if message["type"] == "http.response.start":
                status = message["status"]
                response_started = True
                message = {
                    **message,
                    "headers": [
                        *message.get("headers", []),
                        (b"x-request-id", request_id.encode("ascii")),
                    ],
                }

            await send(message)

        try:
            await app(scope, receive, send_with_request_id)
        except Exception:
            # ServerErrorMiddleware, outside this one, would answer with its own
            # bare 500, which never passes through send_with_request_id and so
            # has no X-Request-ID. The same 500 is sent from here instead, so
            # the client gets the id this line is logged under. The exception
            # still goes on up: ServerErrorMiddleware sees that a response has
            # started, sends nothing more, and the server logs it as before.
            if not response_started:
                await send_with_request_id({
                    "type": "http.response.start",
                    "status": 500,
                    "headers": [
                        (b"content-type", b"text/plain; charset=utf-8"),
                        (b"content-length", str(len(INTERNAL_ERROR)).encode("ascii")),
                    ],
                })
                await send_with_request_id({"type": "http.response.body", "body": INTERNAL_ERROR})
            raise
        finally:
            method = scope.get("method", "")
            path = _route_path(scope)

            record = {
                "event": "request",
                "request_id": request_id,
                "ts": ts,
                "tenant": tenant,
                "method": method if method in KNOWN_METHODS else "OTHER",
                "path": path if path in known_paths else UNMATCHED,
                "status": status,
                "duration_ms": round((time.perf_counter() - started) * 1000, 1),
            }

            if record["method"] == "POST" and record["path"] == ANALYSIS_PATH:
                # Both keys are present on every analysis line, and both are
                # null when the route never ran (a 422).
                noted = state.get("processing") or {}
                record["consent"] = noted.get("consent")
                record[field] = noted.get("digest")

            PROCESSING_LOGGER.info(json.dumps(record, separators=(",", ":")))

    return middleware
