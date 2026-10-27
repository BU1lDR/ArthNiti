"""Isolate the tests from the shell's deployment settings.

app.main builds its module-level app from os.environ at import, and most test
files import that app. A shell with ARTHNITI_ENV=production would then either
refuse to import it (no CORS list) or quietly serve two routes, so that every
other route test 404s and test_input_bounds walks a shrunken OpenAPI schema.
This runs before any test module is imported, and pins the environment to the
development defaults. A test that wants other settings builds its own app with
create_app(load_settings({...})), which never reads os.environ.
"""

import logging
import logging.handlers
import os

import pytest


os.environ["ARTHNITI_ENV"] = "development"

for name in (
    "ARTHNITI_CORS_ORIGINS",
    "ARTHNITI_TENANT",
    "ARTHNITI_REQUIRE_CONSENT",
    "ARTHNITI_LOG_HASH_KEY",
):
    os.environ.pop(name, None)


@pytest.fixture
def capture_log():
    """Collect the records one of the app's own loggers handles.

    The "arthniti" loggers do not pass their records on to the root logger
    (core/processing_log.py). pytest 9.1 still shows them to caplog, but only
    because it attaches its handler to non-propagating loggers too, and caplog
    holds every logger's records mixed. This holds one logger's records and
    does not depend on how pytest captures. Call it with a logger name; it
    returns the list the records are appended to.
    """
    attached = []

    def capture(name):
        # A capacity nobody reaches, so the buffer is never flushed (emptied).
        handler = logging.handlers.BufferingHandler(capacity=1_000_000)
        logger = logging.getLogger(name)
        logger.addHandler(handler)
        attached.append((logger, handler))
        return handler.buffer

    yield capture

    for logger, handler in attached:
        logger.removeHandler(handler)
