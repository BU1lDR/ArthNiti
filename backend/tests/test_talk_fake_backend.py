"""The fake model behind tools/verify/talk-ui.mjs (tools/verify/talk_fake_backend.py).

That browser gate runs the real app with this fake in Meta's place, and nothing
else checks the fake. When the real client gained `keywords`, the fake did not,
and every voice scenario in the gate failed with a 500 that said nothing about
the page under test. These tests keep the fake able to serve the real routes and
keep its two methods shaped like the real client's.
"""

import importlib.util
import inspect
from pathlib import Path

from fastapi.testclient import TestClient

from app.core.meta_client import MetaClient
from intake_fixtures import wav_bytes

FAKE_FILE = Path(__file__).resolve().parents[2] / "tools" / "verify" / "talk_fake_backend.py"


def load_fake_backend():
    spec = importlib.util.spec_from_file_location("talk_fake_backend", FAKE_FILE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def shape(function):
    """Each parameter after self as (name, kind, default). Annotations are not compared."""
    parameters = list(inspect.signature(function).parameters.values())[1:]
    return [(parameter.name, parameter.kind, parameter.default) for parameter in parameters]


def test_the_fake_takes_what_the_real_client_takes():
    fake = load_fake_backend().Fake

    assert shape(fake.transcribe) == shape(MetaClient.transcribe)
    assert shape(fake.complete_json) == shape(MetaClient.complete_json)


def test_the_fake_backend_serves_both_real_routes():
    backend = load_fake_backend()
    client = TestClient(backend.app)

    heard = client.post(
        "/api/intake/transcribe",
        params={"language": "en"},
        content=wav_bytes(),
        headers={"Content-Type": "audio/wav"},
    )
    assert heard.status_code == 200
    assert heard.json() == {"transcript": backend.DEFAULTS["transcript"]}

    found = client.post("/api/intake/extract", json={"text": heard.json()["transcript"], "language": "en"})
    assert found.status_code == 200
    assert found.json()["ignored"] == 0
    assert {answer["field"] for answer in found.json()["answers"]} == {
        "business_category",
        "state",
        "district",
        "location_type",
        "initial_investment",
    }
