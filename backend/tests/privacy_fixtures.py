"""What the log-privacy tests share: the markers, and a search of everywhere the server could write.

tests/test_log_privacy.py (the analysis route and the dev routes) and
tests/test_intake_log_privacy.py (the voice-and-text helper) send a marker that
begins S3NT in every text and the figure 987654.32 in every money field, then
search the processing log, the app's other loggers, every logger at DEBUG
(caplog), and stdout and stderr. The 32 to 64 character hex runs (request ids
and payload codes) are removed first, because a digest can contain any digits.
"""

import json
import logging
import re

import pytest


MARKER = "s3nt"
FIGURE = 987654.32
HEADCOUNT = 9871
# The figure as Python, JSON or an Indian or Western grouping would write it.
FIGURE_TEXTS = ("987654", "9,87,654", "987,654", str(HEADCOUNT))

HEX_RUN = re.compile(r"[0-9a-f]{32,64}")

# The test client logs the URL it requested, query string included. That line is
# the caller's, not the server's, so it is left out of the search.
CLIENT_LOGGERS = ("httpx", "httpx2")


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


def assert_clean(text):
    scrubbed = HEX_RUN.sub("", text).lower()

    assert MARKER not in scrubbed
    for figure in FIGURE_TEXTS:
        assert figure not in scrubbed
