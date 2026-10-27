"""What the log-privacy tests share: the markers, and a search of everywhere the server could write.

tests/test_log_privacy.py (the analysis route and the dev routes),
tests/test_intake_log_privacy.py (the voice-and-text helper) and
tests/test_advisor_log_privacy.py (the plan route) send a marker that
begins S3NT in every text and the figure 987654.32 in every money field, then
search the processing log, the app's other loggers, every logger at DEBUG
(caplog), and stdout and stderr. The 32 to 64 character hex runs (request ids
and payload codes) are removed first, because a digest can contain any digits.
"""

import json
import logging
import re
from typing import get_args

import pytest
from fastapi.testclient import TestClient

from app.core.meta_client import MetaError
from app.core.settings import load_settings
from app.main import create_app
from deployment_fixtures import PRODUCTION
from intake_fixtures import AI_ON, KEY


MARKER = "s3nt"
FIGURE = 987654.32
HEADCOUNT = 9871
# The figure as Python, JSON or an Indian or Western grouping would write it.
FIGURE_TEXTS = ("987654", "9,87,654", "987,654", str(HEADCOUNT))

HEX_RUN = re.compile(r"[0-9a-f]{32,64}")

# The test client logs the URL it requested, query string included. That line is
# the caller's, not the server's, so it is left out of the search.
CLIENT_LOGGERS = ("httpx", "httpx2")

# A processing line is the same eight keys on every route but the analysis one,
# which adds the consent record and the payload code. The routes that call the
# model keep nothing of the body, so theirs is these eight.
LINE_KEYS = {"event", "request_id", "ts", "tenant", "method", "path", "status", "duration_ms"}

# Each way the model call can fail, with every field of the error that a client
# might copy into a message carrying the marker, the figure or the key, and the
# status the route answers with.
FAILURES = [
    (MetaError("auth", 401, code="invalid_api_key", param="Authorization", detail=f"S3NT 987654 {KEY}"), 503),
    (MetaError("billing", 402, code="S3NT-code", detail="S3NT-billing"), 503),
    (MetaError("unavailable", detail="S3NT-down"), 503),
    (MetaError("rate_limited", 429, detail="S3NT-slow", retry_after=5), 429),
    (MetaError("bad_request", 400, param="S3NT-param", detail="S3NT-bad"), 502),
    (MetaError("bad_output", detail="S3NT-output"), 502),
]


@pytest.fixture
def sinks(capture_log, caplog, capsys):
    """Everything the server wrote anywhere, as one text, once the requests are sent."""
    caplog.set_level(logging.DEBUG)
    for name in ("arthniti", "arthniti.processing", "arthniti.startup", "arthniti.errors"):
        caplog.set_level(logging.DEBUG, logger=name)

    processing = capture_log("arthniti.processing")
    server = capture_log("arthniti")
    capsys.readouterr()

    def read():
        captured = capsys.readouterr()
        # Formatted, so that a traceback logged with a record is searched too.
        logged = [
            caplog.handler.format(record)
            for record in caplog.records
            if record.name.split(".")[0] not in CLIENT_LOGGERS
        ]
        texts = [
            *(record.getMessage() for record in processing),
            *(record.getMessage() for record in server),
            *logged,
            captured.out,
            captured.err,
        ]
        return [json.loads(record.getMessage()) for record in processing], "\n".join(texts)

    return read


@pytest.fixture(params=[{}, PRODUCTION], ids=["dev", "prod"])
def helper(request):
    """Builds a client for the routes that call the model, in development and in production. Call it inside the test, after `sinks`, so the logs are watched from startup."""

    def make(model, **more):
        return TestClient(create_app(load_settings({**request.param, **AI_ON, **more}), model_client=model))

    return make


def assert_lines(lines, *expected):
    """The processing lines are exactly these (path, status) pairs, each a POST with the eight keys and no more."""
    assert [(line["path"], line["status"]) for line in lines] == list(expected)
    for line in lines:
        assert set(line) == LINE_KEYS
        assert line["method"] == "POST"


def marker(field, limit):
    """The text sent in a text field: S3NT and the field's name, cut to the field's limit."""
    return f"S3NT-{field}"[:limit]


def numeric_fields(model):
    """The names of a request model's number fields, whether the number is optional or not."""
    return [
        name
        for name, field in model.model_fields.items()
        if field.annotation in (int, float) or {int, float} & set(get_args(field.annotation))
    ]


def assert_clean(text):
    scrubbed = HEX_RUN.sub("", text).lower()

    assert MARKER not in scrubbed
    for figure in FIGURE_TEXTS:
        assert figure not in scrubbed
