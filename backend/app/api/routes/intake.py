"""The voice-and-text helper: two routes that turn a person's words into candidate form answers.

POST /api/intake/transcribe   a recording in, the words said out.
POST /api/intake/extract      the words in, candidate form answers out.

They exist only when ARTHNITI_AI_ENABLED is true (main.py). Neither works out a
number or gives advice. The answers are shown to the person with the words they
came from, and only what the person accepts goes into the form;
POST /api/analysis/run is still the one route that works out a result, by rules.

What reaches Meta is the recording or the text, and what comes back is checked
before the caller sees it (services/intake_service.py). A failed model call is
told to the caller by status and one fixed sentence. Nothing Meta said and
nothing the person said is in an error body or a log line.
"""

import logging
import math
import time
from collections import deque

from fastapi import APIRouter, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from starlette.concurrency import run_in_threadpool

from app.core.meta_client import MetaError
from app.schemas.intake import ExtractRequest, ExtractResponse, SpokenLanguage, TranscribeResponse
from app.schemas.limits import MAX_AUDIO_BYTES
from app.services import intake_service as intake


ERRORS_LOGGER = logging.getLogger("arthniti.errors")

# The most the model may write in reply. Its reasoning tokens count against
# this, and the answers themselves are a few hundred.
MAX_COMPLETION_TOKENS = 4000

# The hourly limit counts calls over a sliding hour.
WINDOW_SECONDS = 3600

# The wait to suggest when Meta, which is busy, did not say how long.
DEFAULT_WAIT_SECONDS = 30

UNAVAILABLE = "The helper is not available right now."
UNUSABLE = "The helper could not make sense of that."
BUSY = "The helper is busy. Try again later."
TOO_LARGE = "The recording is too large."
NOT_A_WAV = "Send a mono 16-bit WAV recording at 16 or 24 kHz."


def _now():
    return time.monotonic()


def _busy(wait: int):
    return HTTPException(429, BUSY, headers={"Retry-After": str(wait)})


def _refusal(error: MetaError):
    # The kind and status are ours; Meta's message and the person's words are
    # in neither (core/meta_client.py).
    ERRORS_LOGGER.warning("the model call failed: %s", error)

    if error.kind == "rate_limited":
        return _busy(error.retry_after or DEFAULT_WAIT_SECONDS)
    if error.kind in ("bad_request", "bad_output"):
        return HTTPException(502, UNUSABLE)

    # auth, billing, unavailable, and any kind added later: nothing the caller
    # can fix, and nothing about the key or the account is theirs to know.
    return HTTPException(503, UNAVAILABLE)


def _limiter(limit: int):
    """A function that counts one model call, or raises 429 once `limit` were counted in the last hour.

    ponytail: kept in this process's memory, so it resets on a restart and with
    several workers each has its own count. It is a cap on spend, not on abuse;
    per-person limits belong at the proxy.
    """

    taken = deque()

    def take():
        now = _now()

        while taken and now - taken[0] >= WINDOW_SECONDS:
            taken.popleft()

        if len(taken) >= limit:
            raise _busy(math.ceil(taken[0] + WINDOW_SECONDS - now))

        taken.append(now)

    return take


async def _body(request: Request):
    # Counted as it arrives, so a body with no length, or a false one, cannot
    # fill memory before the cap is looked at.
    body = bytearray()

    async for chunk in request.stream():
        body += chunk

        if len(body) > MAX_AUDIO_BYTES:
            raise HTTPException(413, TOO_LARGE)

    return bytes(body)


def build_router(client, chat_model: str, asr_model: str, hourly_limit: int):
    router = APIRouter(prefix="/api/intake", tags=["Intake"])

    # Only the event loop calls this (the routes are async), so it needs no lock.
    take = _limiter(hourly_limit)

    @router.post("/transcribe", response_model=TranscribeResponse)
    async def transcribe(request: Request, language: SpokenLanguage):
        wav = await _body(request)

        if not intake.usable_wav(wav):
            raise RequestValidationError([{"type": "value_error", "loc": ("body",), "msg": NOT_A_WAV}])

        take()

        # The call waits on the network, so it runs on a worker thread: the
        # event loop keeps answering other requests meanwhile.
        try:
            transcript = await run_in_threadpool(client.transcribe, wav, intake.LANGUAGES[language], asr_model)
        except MetaError as error:
            raise _refusal(error) from None

        return {"transcript": transcript}

    @router.post("/extract", response_model=ExtractResponse)
    async def extract(body: ExtractRequest):
        take()

        messages = intake.extraction_messages(body.text, body.language)

        try:
            raw = await run_in_threadpool(
                client.complete_json,
                chat_model,
                messages,
                intake.SCHEMA_NAME,
                intake.extraction_schema(),
                MAX_COMPLETION_TOKENS,
            )
        except MetaError as error:
            raise _refusal(error) from None

        try:
            return intake.validate_extraction(raw, body.text)
        except intake.BadModelOutput:
            ERRORS_LOGGER.warning("the model's reply was not the shape asked for")
            raise HTTPException(502, UNUSABLE) from None

    return router
