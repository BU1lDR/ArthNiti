"""The AI plan's route (api/routes/advisor.py).

The model is a fake that gives the replies the test set, so these tests run the
real route, the real analysis, the real plan checks and the real error mapping,
and never touch the network. What the checks accept and refuse is
tests/test_plan_service.py; what the real client puts on the wire is
tests/test_meta_client.py.

What must hold whatever the model does: the route is not there at all unless the
helper is switched on; it does nothing without the person's explicit tick; the
figures in a plan are the rules' and never the model's; a reply that fails the
checks is never passed on; the model is told no figure, place or scheme name; and
a model call never holds up the server's other requests.
"""

import logging
import re
import threading
import unicodedata
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.meta_client import MetaError
from app.core.settings import load_settings
from app.main import create_app
from app.schemas.limits import MAX_RUPEES
from app.services import plan_service as plan
from deployment_fixtures import PRODUCTION
from intake_fixtures import AI_ON, KEY, FakeModel
from plan_fixtures import GOOD_PLANS, TYPICAL, analyse, good_plan


PLAN = "/api/advisor/plan"
API_JS = Path(__file__).resolve().parents[2] / "frontend" / "src" / "services" / "api.js"


def app_for(model, **environ):
    return create_app(load_settings({**AI_ON, **environ}), model_client=model)


@pytest.fixture
def model():
    fake = FakeModel()
    fake.extraction = good_plan("en")
    return fake


@pytest.fixture
def client(model):
    return TestClient(app_for(model))


def request_body(language="en", **changes):
    return {"answers": TYPICAL, "language": language, "send_to_meta": True, **changes}


def post_plan(client, **changes):
    return client.post(PLAN, json=request_body(**changes))


def rules_context(**answers):
    """What the rules make of TYPICAL (with `answers` changed), which the route has to arrive at as well."""
    return plan.build_context(*analyse(**answers))


def fills(parts):
    return [part["v"] for part in parts if part["t"] == "fill"]


def written(parts):
    return "".join(part["v"] for part in parts)


def spoiled(language="en"):
    """A plan the checks refuse: a figure typed in as digits."""
    reply = good_plan(language)
    reply["steps"][2] = "Save 5000 each month." if language == "en" else "5000"
    return reply


def refusal_of(reply, language="en", **answers):
    with pytest.raises(plan.BadPlan) as refused:
        plan.verify_plan(reply, rules_context(**answers), language)

    return refused.value.reasons


# ---------------------------------------------------------------- the route is off unless the helper is switched on


@pytest.mark.parametrize("environ", [{}, PRODUCTION], ids=["development", "production"])
def test_with_the_helper_off_the_plan_route_does_not_exist(environ):
    client = TestClient(create_app(load_settings(environ)))

    assert post_plan(client).status_code == 404


def test_with_the_helper_off_the_dev_docs_do_not_list_it():
    paths = TestClient(create_app(load_settings({}))).get("/openapi.json").json()["paths"]

    assert not [path for path in paths if path.startswith("/api/advisor/")]


def test_the_dev_openapi_lists_it_when_the_helper_is_on(client):
    assert PLAN in client.get("/openapi.json").json()["paths"]


def test_the_documented_body_asks_for_the_tick_as_a_fixed_true(client):
    schema = client.get("/openapi.json").json()["components"]["schemas"]["PlanRequest"]

    assert sorted(schema["required"]) == ["answers", "language", "send_to_meta"]
    assert schema["properties"]["send_to_meta"]["const"] is True


def test_production_documents_it_when_the_helper_is_on(model):
    schema = create_app(load_settings({**PRODUCTION, **AI_ON}), model_client=model).openapi()

    assert PLAN in schema["paths"]


def test_production_with_the_helper_on_serves_it(model):
    client = TestClient(create_app(load_settings({**PRODUCTION, **AI_ON}), model_client=model))

    assert post_plan(client).status_code == 200


PREFLIGHT = {"Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"}


@pytest.mark.parametrize(
    ("environ", "origin", "other"),
    [
        ({}, "http://localhost:5173", "https://evil.example"),
        (PRODUCTION, "https://advisor.example.org", "http://localhost:5173"),
    ],
    ids=["development", "production"],
)
def test_a_browser_on_the_apps_own_page_may_ask_and_then_post_but_one_on_another_page_may_not(model, environ, origin, other):
    client = TestClient(create_app(load_settings({**environ, **AI_ON}), model_client=model))

    asked = client.options(PLAN, headers={"Origin": origin, **PREFLIGHT})
    assert asked.status_code == 200
    assert asked.headers["access-control-allow-origin"] == origin
    assert "POST" in asked.headers["access-control-allow-methods"]
    assert "content-type" in asked.headers["access-control-allow-headers"].lower()
    assert "access-control-allow-credentials" not in asked.headers

    sent = client.post(PLAN, json=request_body(), headers={"Origin": origin})
    assert sent.status_code == 200
    assert sent.headers["access-control-allow-origin"] == origin

    refused = client.options(PLAN, headers={"Origin": other, **PREFLIGHT})
    assert refused.status_code == 400
    assert "access-control-allow-origin" not in refused.headers
    assert len(model.calls) == 1


def test_the_startup_log_names_the_plan_route_and_says_what_it_sends(capture_log):
    records = capture_log("arthniti.startup")

    create_app(load_settings(AI_ON), model_client=FakeModel())

    (message,) = [r.getMessage() for r in records if r.levelno == logging.INFO]

    assert "POST /api/advisor/plan" in message
    assert "no figure, name or place" in message
    assert KEY not in message


# ---------------------------------------------------------------- nothing is sent without the tick


@pytest.mark.parametrize("ticked", [False, 0, 1, 1.0, "true", "True", "yes", "1", None, [], {}], ids=repr)
def test_without_a_real_true_tick_nothing_is_sent_to_the_model(model, client, ticked):
    response = post_plan(client, send_to_meta=ticked)

    assert response.status_code == 422
    assert model.calls == []


def test_a_body_with_no_tick_is_refused(model, client):
    body = request_body()
    del body["send_to_meta"]

    assert client.post(PLAN, json=body).status_code == 422
    assert model.calls == []


# ---------------------------------------------------------------- a request the route refuses


@pytest.mark.parametrize("language", ["xx", "", "EN", "english", "en ", None, 5, ["en"]], ids=repr)
def test_a_language_the_app_does_not_have_is_refused(model, client, language):
    assert post_plan(client, language=language).status_code == 422
    assert model.calls == []


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"language": "en", "send_to_meta": True},
        {"answers": TYPICAL, "send_to_meta": True},
        [],
        "plan",
    ],
    ids=["empty", "no answers", "no language", "a list", "a string"],
)
def test_a_body_missing_a_part_or_not_an_object_is_refused(model, client, body):
    assert client.post(PLAN, json=body).status_code == 422
    assert model.calls == []


def test_answers_the_analysis_would_refuse_are_refused_with_the_field_named_and_not_echoed(model, client):
    response = post_plan(client, answers={**TYPICAL, "monthly_emi": -7654321})

    assert response.status_code == 422
    assert [error["loc"] for error in response.json()["detail"]] == [["body", "answers", "monthly_emi"]]
    assert "7654321" not in response.text
    assert model.calls == []


def test_an_answer_that_is_missing_is_named(model, client):
    answers = {key: value for key, value in TYPICAL.items() if key != "state"}

    response = post_plan(client, answers=answers)

    assert response.status_code == 422
    assert [error["loc"] for error in response.json()["detail"]] == [["body", "answers", "state"]]
    assert model.calls == []


def test_an_amount_over_the_cap_is_refused(model, client):
    assert post_plan(client, answers={**TYPICAL, "available_capital": MAX_RUPEES + 1}).status_code == 422
    assert model.calls == []


def test_a_deployment_that_asks_the_analysis_for_a_consent_record_does_not_ask_the_plan_for_one(model):
    client = TestClient(app_for(model, ARTHNITI_REQUIRE_CONSENT="true"))

    assert post_plan(client).status_code == 200


# ---------------------------------------------------------------- what the model is sent


def test_the_model_is_given_our_instructions_and_schema_and_the_chat_model_of_the_settings(model):
    client = TestClient(app_for(model, ARTHNITI_AI_MODEL="muse-spark-9.9"))

    assert post_plan(client).status_code == 200
    assert model.calls == [
        (
            "complete_json",
            "muse-spark-9.9",
            plan.plan_messages(rules_context(), "en"),
            plan.SCHEMA_NAME,
            plan.plan_schema(),
            plan.MAX_COMPLETION_TOKENS,
        )
    ]


def test_the_model_is_asked_in_the_language_the_person_chose(model, client):
    model.extraction = good_plan("hi")

    assert post_plan(client, language="hi").status_code == 200
    assert model.calls[0][2] == plan.plan_messages(rules_context(), "hi")


def test_the_model_is_told_no_figure_place_or_scheme_name(model, client):
    answers, analysis = analyse()
    names = [match["name"] for match in analysis["scheme_matches"]]
    assert names, "the case has to match schemes, or the check below has nothing to look for"

    assert post_plan(client).status_code == 200

    sent = "\n".join(message["content"] for message in model.calls[0][2])
    for kept_back in (answers["state"], answers["district"], *names, *rules_context()["values"].values()):
        assert kept_back not in sent
    assert not [character for character in sent if unicodedata.category(character) == "Nd"]


# ---------------------------------------------------------------- a plan comes back


def test_a_good_plan_comes_back_with_the_rules_figures_put_in(model, client):
    response = post_plan(client)

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"language", "summary", "steps", "cautions", "attempts"}
    assert body["language"] == "en"
    assert body["attempts"] == 1
    assert written(body["summary"]) == "Your business earns ₹15,000 each month after costs, but you still need ₹70,000 to start it."
    assert fills(body["summary"]) == ["₹15,000", "₹70,000"]
    assert written(body["steps"][0]) == "Think about a loan of ₹70,000 over 24 months, with a monthly repayment of ₹3,295."
    assert fills(body["steps"][1]) == [rules_context()["values"]["scheme_a"]]


@pytest.mark.parametrize("language", sorted(GOOD_PLANS))
def test_a_plan_in_each_language_comes_back_in_that_language_with_the_same_figures(model, client, language):
    reply = good_plan(language)
    model.extraction = reply

    response = post_plan(client, language=language)

    assert response.status_code == 200
    body = response.json()
    assert body["language"] == language
    assert fills(body["summary"]) == ["₹15,000", "₹70,000"]

    def filled(text):
        for name, value in rules_context()["values"].items():
            text = text.replace("{{" + name + "}}", value)
        return text

    assert [written(part) for part in (body["summary"], *body["steps"], *body["cautions"])] == [
        filled(text) for text in (reply["summary"], *reply["steps"], *reply["cautions"])
    ]
    assert "{{" not in response.text


def test_the_figures_follow_the_answers_that_were_sent(model, client):
    body = post_plan(client, answers={**TYPICAL, "available_capital": 60000}).json()

    assert fills(body["summary"]) == ["₹15,000", "₹30,000"]


def plan_using(names):
    tags = ["{{" + name + "}}" for name in names]

    return {
        "summary": "The main figures are " + ", ".join(tags) + ".",
        "steps": ["Read each figure with care.", "Ask a lender before you decide.", "Keep a written record."],
        "cautions": ["These are estimates."],
    }


SCENARIOS = {
    "a loss": {"expected_monthly_revenue": 8000},
    "no gap": {"available_capital": 90000},
    "a heavy loan": {"monthly_emi": 9000},
    "a household over the limit": {"monthly_emi": 9000, "household_monthly_income": 12000},
    "no household income given": {"household_monthly_income": None},
    "nothing to invest": {"initial_investment": 0},
    "a city": {"location_type": "urban"},
    "a district with no data": {"district": "Nowhere"},
    "a state with no schemes of its own": {"state": "Goa", "district": ""},
}


@pytest.mark.parametrize("changes", SCENARIOS.values(), ids=list(SCENARIOS))
def test_a_plan_is_written_for_every_kind_of_case_the_rules_can_see(model, client, changes):
    answers, analysis = analyse(**changes)
    context = plan.build_context(answers, analysis)
    names = list(dict.fromkeys([*context["required"], *context["values"]]))
    model.extraction = plan_using(names[: max(len(context["required"]), 3)])

    response = post_plan(client, answers=answers)

    assert response.status_code == 200, response.text
    assert response.json()["attempts"] == 1


# ---------------------------------------------------------------- a reply the checks refuse is asked for again, once


def test_a_reply_the_checks_refuse_is_asked_for_again_with_the_reasons(model, client):
    model.replies = [spoiled()]

    response = post_plan(client)

    assert response.status_code == 200
    assert response.json()["attempts"] == 2
    first, second = (call[2] for call in model.calls)
    assert second == plan.plan_messages(rules_context(), "en", refusal_of(spoiled()))
    assert plan.FIXES["digit"] in second[1]["content"]
    assert plan.FIXES["digit"] not in first[1]["content"]


def test_the_retry_is_checked_as_hard_as_the_first_reply(model, client):
    model.extraction = spoiled()

    response = post_plan(client)

    assert response.status_code == 502
    assert response.json() == {"detail": plan.NO_PLAN}
    assert len(model.calls) == plan.MAX_ATTEMPTS


def test_what_a_refused_reply_said_never_reaches_the_caller(model, client):
    model.extraction = spoiled()

    response = post_plan(client)

    assert response.status_code == 502
    assert "5000" not in response.text


def test_the_reply_is_checked_in_the_language_that_was_asked_for(model, client):
    # English words, when Hindi was asked for.
    model.extraction = good_plan("en")

    response = post_plan(client, language="hi")

    assert response.status_code == 502
    assert len(model.calls) == plan.MAX_ATTEMPTS


@pytest.mark.parametrize("reply", ["not an object", ["a", "b"], {"summary": "x"}, None], ids=repr)
def test_a_reply_of_the_wrong_shape_is_asked_for_again_as_a_wrong_shape(model, client, reply):
    model.replies = [reply]

    response = post_plan(client)

    assert response.status_code == 200
    assert model.calls[1][2] == plan.plan_messages(rules_context(), "en", ["shape"])


def test_a_reply_the_client_could_not_read_is_asked_for_again_as_a_wrong_shape(model, client):
    model.replies = [MetaError("bad_output")]

    response = post_plan(client)

    assert response.status_code == 200
    assert response.json()["attempts"] == 2
    assert model.calls[1][2] == plan.plan_messages(rules_context(), "en", ["shape"])


def test_two_replies_the_client_could_not_read_end_in_a_bad_gateway(model, client):
    model.failure = MetaError("bad_output")

    response = post_plan(client)

    assert response.status_code == 502
    assert response.json() == {"detail": plan.NO_PLAN}
    assert len(model.calls) == plan.MAX_ATTEMPTS


# ---------------------------------------------------------------- what goes wrong with the model


FAILURES = [
    (MetaError("auth", 401, code="invalid_api_key"), 503),
    (MetaError("auth", 403), 503),
    (MetaError("billing", 402, code="billing_not_configured"), 503),
    (MetaError("unavailable"), 503),
    (MetaError("unavailable", 503), 503),
    (MetaError("spend_cap"), 503),
    (MetaError("bad_request", 400, param="messages[0].content"), 502),
    (MetaError("rate_limited", 429), 429),
    (MetaError("a_kind_added_later"), 503),
]


@pytest.mark.parametrize(("failure", "status"), FAILURES, ids=[str(failure) for failure, _ in FAILURES])
def test_a_failed_model_call_becomes_the_status_that_says_what_to_do_and_is_not_asked_again(model, client, failure, status):
    model.failure = failure

    response = post_plan(client)

    assert response.status_code == status
    assert set(response.json()) == {"detail"}
    assert isinstance(response.json()["detail"], str) and response.json()["detail"]
    assert len(model.calls) == 1


def test_what_meta_said_never_reaches_the_caller(model, client):
    model.failure = MetaError("auth", 401, code="invalid_api_key", param="Authorization", detail="ECHO S3NT-upstream", retry_after=5)

    response = post_plan(client)

    assert response.status_code == 503
    for leaked in ("ECHO", "S3NT", "invalid_api_key", "Authorization", KEY, "401"):
        assert leaked not in response.text


def test_a_busy_model_says_how_long_to_wait(model, client):
    model.failure = MetaError("rate_limited", 429, retry_after=7)
    assert post_plan(client).headers["retry-after"] == "7"

    for unknown in (None, 0):
        model.failure = MetaError("rate_limited", 429, retry_after=unknown)
        assert post_plan(client).headers["retry-after"] == "30"


def test_a_model_that_turns_busy_on_the_retry_ends_in_the_busy_status_with_its_wait(model, client):
    model.replies = [spoiled(), MetaError("rate_limited", 429, retry_after=7)]

    response = post_plan(client)

    assert response.status_code == 429
    assert response.headers["retry-after"] == "7"
    assert len(model.calls) == 2


def test_a_model_that_fails_on_the_retry_ends_in_the_status_for_that_failure(model, client):
    model.replies = [spoiled(), MetaError("unavailable")]

    response = post_plan(client)

    assert response.status_code == 503
    assert len(model.calls) == 2


# ---------------------------------------------------------------- the hourly limit


class Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


@pytest.fixture
def clock(monkeypatch):
    from app.api.routes import intake as route

    clock = Clock()
    monkeypatch.setattr(route, "_now", clock)
    return clock


def limited(model, limit):
    return TestClient(app_for(model, ARTHNITI_AI_HOURLY_LIMIT=str(limit)))


def post_extract(client):
    return client.post("/api/intake/extract", json={"text": "I make clothes", "language": "en"})


def test_a_plan_over_the_hourly_limit_is_refused_without_reaching_the_model(model, clock):
    client = limited(model, 1)

    assert post_plan(client).status_code == 200

    refused = post_plan(client)

    assert refused.status_code == 429
    assert refused.headers["retry-after"] == "3600"
    assert len(model.calls) == 1


def test_each_try_is_counted_so_a_refused_reply_and_its_retry_use_two_of_the_hour(model, clock):
    client = limited(model, 2)
    model.replies = [spoiled()]

    assert post_plan(client).status_code == 200
    assert post_plan(client).status_code == 429
    assert len(model.calls) == 2


def test_a_retry_the_hourly_limit_does_not_allow_is_refused_without_reaching_the_model(model, clock):
    client = limited(model, 1)
    model.replies = [spoiled()]

    response = post_plan(client)

    assert response.status_code == 429
    assert response.headers["retry-after"] == "3600"
    assert len(model.calls) == 1


def test_the_plan_and_the_intake_routes_share_one_count(model, clock):
    client = limited(model, 2)
    model.replies = [{"text_answers": [], "money_answers": []}]

    assert post_extract(client).status_code == 200
    assert post_plan(client).status_code == 200
    assert post_plan(client).status_code == 429
    assert post_extract(client).status_code == 429


def test_the_count_is_shared_whichever_route_comes_first(model, clock):
    client = limited(model, 2)
    model.replies = [good_plan("en"), {"text_answers": [], "money_answers": []}]

    assert post_plan(client).status_code == 200
    assert post_extract(client).status_code == 200
    assert post_plan(client).status_code == 429


def test_a_request_the_server_refuses_is_not_counted(model, clock):
    client = limited(model, 1)

    assert post_plan(client, send_to_meta=False).status_code == 422
    assert post_plan(client, language="xx").status_code == 422
    assert post_plan(client, answers={**TYPICAL, "monthly_emi": -1}).status_code == 422

    assert post_plan(client).status_code == 200


# ---------------------------------------------------------------- a model call does not hold up the server


def test_a_slow_model_call_does_not_stop_the_server_answering_other_requests():
    entered = threading.Event()
    release = threading.Event()

    class Slow(FakeModel):
        def complete_json(self, *args):
            entered.set()
            # Bounded, so a regression fails this test instead of hanging it.
            assert release.wait(15)
            return super().complete_json(*args)

    slow = Slow()
    slow.extraction = good_plan("en")
    result = {}

    with TestClient(app_for(slow)) as client:
        worker = threading.Thread(target=lambda: result.update(response=post_plan(client)))
        worker.start()

        try:
            assert entered.wait(10)
            # The model call is still in progress; the server must still answer.
            assert client.get("/health").status_code == 200
        finally:
            release.set()
            worker.join(20)

    assert result["response"].status_code == 200


# ---------------------------------------------------------------- the browser waits as long as the route can take


def test_the_browser_waits_for_as_long_as_the_route_can_take():
    # The route makes up to MAX_ATTEMPTS calls of up to CALL_TIMEOUT_SECONDS each. A page
    # that gave up sooner would show an error for a plan that was still being written,
    # and the credits for it would be spent all the same.
    waits = re.findall(r"^const PLAN_TIMEOUT_MS = (\d+)$", API_JS.read_text(encoding="utf-8"), re.M)

    assert len(waits) == 1
    assert int(waits[0]) >= plan.MAX_ATTEMPTS * plan.CALL_TIMEOUT_SECONDS * 1000
