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
from app.services import plan_service
from app.services.intake_service import LANGUAGES
from intake_fixtures import wav_bytes
from plan_fixtures import analyse

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


# The plan route. The fake writes the plan the plan tests use, in the language the
# real prompt asks for, so a browser gate would drive the real route, the real checks
# and the real rendering of the figures. No gate does yet (see the header of
# tools/verify/talk-ui.mjs); these tests keep the fake in step with the route.


def post_plan(client, answers, language="en"):
    return client.post("/api/advisor/plan", json={"answers": answers, "language": language, "send_to_meta": True})


def plan_calls(client):
    return [call for call in client.get("/__fake").json() if call["call"] == "plan"]


def test_the_fake_backend_writes_a_plan_in_each_language():
    client = TestClient(load_fake_backend().app)
    answers, analysis = analyse()
    required = list(plan_service.build_context(answers, analysis)["required"])

    for code in LANGUAGES:
        written = post_plan(client, answers, code)
        assert written.status_code == 200, (code, written.text)
        assert written.json()["language"] == code
        assert written.json()["attempts"] == 1

    asked = plan_calls(client)
    assert [call["language"] for call in asked] == list(LANGUAGES)
    assert all(call["required"] == required for call in asked)


def test_a_plan_the_checks_refuse_is_asked_for_twice_and_then_given_up_on():
    client = TestClient(load_fake_backend().app)
    answers, _ = analyse()
    client.post("/__fake", json={"plan": {"summary": "You earn 5000 a month.", "steps": ["a", "b", "c"], "cautions": ["x"]}})

    refused = post_plan(client, answers)

    assert refused.status_code == 502
    assert refused.json()["detail"] == plan_service.NO_PLAN
    asked = plan_calls(client)
    assert len(asked) == 2
    assert "Your last reply was rejected" not in asked[0]["text"]
    assert "Your last reply was rejected" in asked[1]["text"]


def test_the_fake_fails_a_plan_the_way_meta_does():
    client = TestClient(load_fake_backend().app)
    answers, _ = analyse()

    for kind, status in (("rate_limited", 429), ("unavailable", 503)):
        client.post("/__fake", json={"reset": True, "fail": kind})
        assert post_plan(client, answers).status_code == status, kind
        assert len(plan_calls(client)) == 1, kind
