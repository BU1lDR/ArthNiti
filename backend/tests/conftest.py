"""Isolate the tests from the shell's deployment settings.

app.main builds its module-level app from os.environ at import, and most test
files import that app. A shell with ARTHNITI_ENV=production would then either
refuse to import it (no CORS list) or quietly serve two routes, so that every
other route test 404s and test_input_bounds walks a shrunken OpenAPI schema.
This runs before any test module is imported, and pins the environment to the
development defaults. A test that wants other settings builds its own app with
create_app(load_settings({...})), which never reads os.environ.
"""

import ipaddress
import logging
import logging.handlers
import os
import socket
from pathlib import Path

import pytest


os.environ["ARTHNITI_ENV"] = "development"

for name in (
    "ARTHNITI_CORS_ORIGINS",
    "ARTHNITI_TENANT",
    "ARTHNITI_REQUIRE_CONSENT",
    "ARTHNITI_LOG_HASH_KEY",
    # The voice-and-text helper. A shell that has a key exported for the smoke
    # script must not switch it on for every test that imports app.main.
    "ARTHNITI_AI_ENABLED",
    "MODEL_API_KEY",
    "ARTHNITI_AI_MODEL",
    "ARTHNITI_AI_ASR_MODEL",
    "ARTHNITI_AI_HOURLY_LIMIT",
    "ARTHNITI_AI_SPEND_CAP_USD",
    "ARTHNITI_AI_SPEND_FILE",
):
    os.environ.pop(name, None)


# The owner's running total of what the helper has asked Meta to bill
# (core/spend.py). It is theirs: no test may create or change it.
REAL_LEDGER = Path(__file__).resolve().parents[1] / ".ai_spend"


def _is_this_machine(address):
    # A path (AF_UNIX) cannot leave the machine. Anything else is (host, port, ...),
    # and by the time create_connection connects, the host is an address.
    if not isinstance(address, tuple):
        return True

    if address[0] == "localhost":
        return True

    try:
        return ipaddress.ip_address(address[0]).is_loopback
    except ValueError:
        return False


@pytest.fixture(autouse=True)
def only_this_machine(monkeypatch):
    """No test reaches a real server.

    The owner's free model-API credit is all there is, and a test that built the
    real client by mistake would spend it. For every test a socket may connect to
    this machine and to nothing else, so the client tests keep their stub server
    (127.0.0.1) and nothing else answers. It raises RuntimeError and not OSError
    on purpose: the client turns an OSError into "unavailable", which a test could
    then mistake for the outcome it wanted.

    This covers blocking sockets, which is what urllib, http.client and httpx's
    sync client use. asyncio on Windows connects through the OS directly and is
    not covered; no test here opens an outgoing asyncio connection.
    """
    connect, connect_ex = socket.socket.connect, socket.socket.connect_ex

    def check(address):
        if not _is_this_machine(address):
            raise RuntimeError(f"A test tried to connect to {address[0]!r}. No test may reach a real server.")

    def guarded_connect(self, address):
        check(address)
        return connect(self, address)

    def guarded_connect_ex(self, address):
        check(address)
        return connect_ex(self, address)

    monkeypatch.setattr(socket.socket, "connect", guarded_connect)
    monkeypatch.setattr(socket.socket, "connect_ex", guarded_connect_ex)


@pytest.fixture(autouse=True)
def real_spend_ledger_untouched():
    """A test that built an app or a client on the default ledger path would charge the owner's."""

    def state():
        return REAL_LEDGER.read_bytes() if REAL_LEDGER.exists() else None

    before = state()
    yield
    assert state() == before, "A test wrote to the real spend ledger, backend/.ai_spend. Give it a path under tmp_path."


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
