"""Nothing a person answers to the AI plan, and nothing the model writes back, reaches a log.

The plan route is sent the marker the other routes are sent (tests/privacy_fixtures.py):
S3NT in every text answer and the figure 987654.32 in every money answer, with a
consent record in the answers as well. The model is a fake that answers with a plan
the checks accept, a plan they refuse, a reply that is not a plan, or an error of
each kind Meta can give. Then every place the server could write is searched, as
tests/test_log_privacy.py does for the analysis route, and so is everything the
model was sent: this is the one route where a person's answers and a third party
meet.

What reaches the person is the point of the route, so a plan that comes back carries
the place names they typed and the rules' own figures. The check is that none of
that, and none of the model's words, is in a log or an error body, and that the
model is sent none of it.

An error path is where a value is most likely to be printed, so every way a request
can end is here: a plan, a plan refused twice, each kind of model failure, a request
the route refuses (422), the hourly limit (429) and a response that fails its own
model (500).
"""

import json
import re

import pytest

from app.api.routes import advisor as advisor_route
from app.core.meta_client import MetaError
from app.schemas.analysis import IGNORED_FIELDS, UnifiedAnalysisRequest
from app.schemas.limits import MAX_RUPEES
from app.schemas.plan import PlanRequest
from app.services import plan_service as plan
from app.services.analysis_service import run_unified_analysis
from deployment_fixtures import CONSENT, request_strings
from intake_fixtures import KEY, FakeModel
from plan_fixtures import TYPICAL
from privacy_fixtures import FAILURES, FIGURE, HEADCOUNT, assert_clean, assert_lines, helper, marker, numeric_fields, sinks  # noqa: F401


PLAN = "/api/advisor/plan"

# A word of the model's own, which no real plan would use and no check looks for:
# the plan carries it to the person, and it must go nowhere else.
QUOKKA = "quokka"


def _text_limits():
    # Every text answer in the plan route's body, from the OpenAPI of an app that serves it, so a field added later is covered without editing here.
    from app.core.settings import load_settings
    from app.main import create_app
    from intake_fixtures import AI_ON

    schema = create_app(load_settings(AI_ON), model_client=FakeModel()).openapi()
    return {
        field.removeprefix("answers."): string["maxLength"]
        for _, path, field, string in request_strings(schema)
        if path == PLAN and field.startswith("answers.") and not field.startswith("answers.consent.")
    }


LIMITS = _text_limits()

# Every text answer a marker, every money answer the figure, the headcount its own.
EVEN = {
    **{field: marker(field, limit) for field, limit in LIMITS.items()},
    **{field: HEADCOUNT if field == "employees" else FIGURE for field in numeric_fields(UnifiedAnalysisRequest)},
}

# The same words over a business that needs a loan, so that the figures the rules
# work out are new ones, found in the plan and in no log. Only the debt is the figure.
BORROWING = {**EVEN, **{field: value for field, value in TYPICAL.items() if isinstance(value, (int, float))}, "existing_debt": FIGURE}

BOTH = pytest.mark.parametrize("answers", [EVEN, BORROWING], ids=["even", "borrowing"])


def body_for(answers, **changes):
    return {"answers": {**answers, "consent": CONSENT}, "language": "en", "send_to_meta": True, **changes}


def post(client, answers=EVEN, **changes):
    return client.post(PLAN, json=body_for(answers, **changes))


def rules_context(answers):
    """What the rules make of these answers, narrowed as the route narrows them."""
    narrowed = UnifiedAnalysisRequest(**answers).model_dump(exclude=IGNORED_FIELDS | {"consent"})
    return plan.build_context(narrowed, run_unified_analysis(**narrowed))


def plan_for(answers):
    """A plan the checks accept for these answers: every placeholder the rules offer, and a word of the model's own."""
    tags = " ".join("{{" + name + "}}" for name in rules_context(answers)["values"])
    return {
        "summary": f"Here is where you stand: {tags}.",
        "steps": ["Ask at the nearest office.", f"Keep a written record of the {QUOKKA}.", "Save a little each month."],
        "cautions": ["Check these figures before you decide."],
    }


def shown_fills(back):
    """The figures and names the person is shown in a plan."""
    parts = [*back["summary"], *(part for step in back["steps"] for part in step), *(part for caution in back["cautions"] for part in caution)]
    return [part["v"] for part in parts if part["t"] == "fill"]


def served(answers):
    model = FakeModel()
    model.extraction = plan_for(answers)
    return model


# ---------------------------------------------------------------- the markers


def test_the_marked_answers_mark_every_field():
    # Not vacuous: every text answer carries a marker and every number the figure,
    # and both bodies are ones the route accepts.
    assert len(LIMITS) == 11
    for field in LIMITS:
        assert EVEN[field].startswith("S3NT-")
    for field in ("available_capital", "monthly_emi", "household_monthly_income", "existing_debt"):
        assert EVEN[field] == FIGURE
    assert EVEN["employees"] == HEADCOUNT
    PlanRequest(**body_for(EVEN))
    PlanRequest(**body_for(BORROWING))


def test_the_borrowing_answers_make_a_plan_that_needs_a_loan():
    # The second set of answers is there for the loan's figures, so it has to have one.
    assert {"profit", "gap", "loan", "tenure", "repayment"} <= set(rules_context(BORROWING)["required"])


# ---------------------------------------------------------------- a plan that is written


@BOTH
def test_a_plan_goes_back_to_the_person_and_to_no_log(sinks, helper, answers):
    model = served(answers)

    response = post(helper(model), answers)

    # The person is shown their own place names, the rules' figures and the
    # model's words: that is the route's job. The check is that none of it leaks.
    assert response.status_code == 200
    assert response.json()["attempts"] == 1
    assert "S3NT-state" in response.text
    assert QUOKKA in response.text
    shown = [fill for fill in shown_fills(response.json()) if len(fill) > 3]
    assert len(shown) >= 4

    lines, text = sinks()
    assert_clean(text)
    assert KEY not in text
    assert CONSENT["given_at"] not in text
    assert QUOKKA not in text
    assert_lines(lines, (PLAN, 200))

    # Nor is any of it sent to the model, which is told only what the rules concluded.
    (call,) = model.calls
    sent = json.dumps(call[2], ensure_ascii=False)
    assert_clean(sent)
    assert "S3NT" not in sent
    for fill in shown:
        assert fill not in text
        assert fill not in sent
    # And what the model was sent is not copied into a log either.
    for message in call[2]:
        assert message["content"] not in text


# ---------------------------------------------------------------- a plan the checks refuse

# Digits, a number in words, a placeholder nobody listed and a name: the model's own
# text, which the checks name by code and the route must not repeat.
SPOILED = {
    "summary": "S3NT-plan: {{zebra}} costs 987654 rupees.",
    "steps": ["Ask at the nearest office.", "Keep a written record.", "Save a little each month."],
    "cautions": ["Check these figures before you decide."],
}


def test_the_spoiled_plan_is_refused_for_reasons_that_carry_its_words():
    # Not vacuous: the reasons do hold words of the reply after the colon, so a
    # route that logged them whole would leak.
    with pytest.raises(plan.BadPlan) as refused:
        plan.verify_plan(SPOILED, rules_context(EVEN), "en")

    assert "placeholder:zebra" in refused.value.reasons
    assert "number_word:rupees" in refused.value.reasons
    assert "digit" in refused.value.reasons


def test_a_plan_the_checks_refuse_logs_only_the_codes_of_the_checks(sinks, capture_log, helper):
    errors = capture_log("arthniti.errors")
    model = FakeModel()
    model.extraction = SPOILED

    response = post(helper(model))

    assert response.status_code == 502
    assert response.json() == {"detail": plan.NO_PLAN}
    assert len(model.calls) == plan.MAX_ATTEMPTS

    lines, text = sinks()
    assert_clean(text)
    for word in ("zebra", "rupees", "987654", "Ask at the nearest office"):
        assert word not in text
    # One line a try, each a list of codes and nothing after a colon.
    messages = [record.getMessage() for record in errors]
    assert len(messages) == plan.MAX_ATTEMPTS
    for message in messages:
        assert re.fullmatch(r"the plan was refused on try [12]: [a-z_,]+", message)
    assert_lines(lines, (PLAN, 502))

    # What the second try was told is a fixed instruction, not the reply.
    for call in model.calls:
        assert_clean(json.dumps(call[2], ensure_ascii=False))
        assert "zebra" not in json.dumps(call[2])


# ---------------------------------------------------------------- a request the model fails

NOT_RETRIED = [(failure, status) for failure, status in FAILURES if failure.kind != "bad_output"]


@pytest.mark.parametrize(("failure", "status"), NOT_RETRIED, ids=[failure.kind for failure, _ in NOT_RETRIED])
def test_a_failed_model_call_logs_only_its_kind(sinks, capture_log, helper, failure, status):
    errors = capture_log("arthniti.errors")
    model = FakeModel()
    model.failure = failure

    response = post(helper(model))

    assert response.status_code == status
    assert "S3NT" not in response.text
    assert KEY not in response.text
    # A failure that is not the model's own miss is not tried again.
    assert len(model.calls) == 1

    lines, text = sinks()
    assert_clean(text)
    assert KEY not in text
    # What is logged, once, is the kind and the status when there was one.
    assert [record.getMessage() for record in errors] == [f"the model call failed: {failure}"]
    assert_lines(lines, (PLAN, status))


def test_a_reply_that_is_not_a_plan_is_tried_again_and_logs_nothing_of_it(sinks, capture_log, helper):
    errors = capture_log("arthniti.errors")
    model = FakeModel()
    model.failure = MetaError("bad_output", detail="S3NT-output")

    response = post(helper(model))

    assert response.status_code == 502
    assert response.json() == {"detail": plan.NO_PLAN}
    assert len(model.calls) == plan.MAX_ATTEMPTS

    lines, text = sinks()
    assert_clean(text)
    assert [record.getMessage() for record in errors] == [
        "the plan was refused on try 1: shape",
        "the plan was refused on try 2: shape",
    ]
    assert_lines(lines, (PLAN, 502))


# ---------------------------------------------------------------- a request the route refuses


def _without(body, key):
    return {name: value for name, value in body.items() if name != key}


def _not_json(client):
    return client.post(PLAN, content=b"S3NT-987654", headers={"Content-Type": "application/json"})


REFUSED = [
    ("unknown language", lambda c: post(c, language="S3NT-xx")),
    ("no tick", lambda c: c.post(PLAN, json=_without(body_for(EVEN), "send_to_meta"))),
    ("tick false", lambda c: post(c, send_to_meta=False)),
    ("tick as text", lambda c: post(c, send_to_meta="S3NT-true")),
    ("negative money", lambda c: post(c, {**EVEN, "monthly_emi": -FIGURE})),
    ("money over the cap", lambda c: post(c, {**EVEN, "available_capital": MAX_RUPEES * 10})),
    ("text over the limit", lambda c: post(c, {**EVEN, "customers": "S3NT-" * 41})),
    ("short state", lambda c: post(c, {**EVEN, "state": "S"})),
    ("no answers", lambda c: c.post(PLAN, json=_without(body_for(EVEN), "answers"))),
    ("answers as text", lambda c: c.post(PLAN, json={**body_for(EVEN), "answers": "S3NT-987654"})),
    ("not json", _not_json),
]


@pytest.mark.parametrize("send", [case[1] for case in REFUSED], ids=[case[0] for case in REFUSED])
def test_a_refused_request_logs_none_of_it(sinks, helper, send):
    model = served(EVEN)

    response = send(helper(model))

    assert response.status_code == 422
    assert "S3NT" not in response.text
    assert "987654" not in response.text
    # Refused before the model was asked.
    assert model.calls == []

    lines, text = sinks()
    assert_clean(text)
    assert_lines(lines, (PLAN, 422))


def test_the_hourly_limit_logs_no_words(sinks, helper):
    model = served(EVEN)
    client = helper(model, ARTHNITI_AI_HOURLY_LIMIT="1")

    assert post(client).status_code == 200
    refused = post(client)

    assert refused.status_code == 429
    assert "S3NT" not in refused.text
    assert len(model.calls) == 1

    lines, text = sinks()
    assert_clean(text)
    assert QUOKKA not in text
    assert_lines(lines, (PLAN, 200), (PLAN, 429))


# ---------------------------------------------------------------- a response that fails its model


def test_a_response_that_fails_its_model_logs_no_values(sinks, helper, monkeypatch):
    def broken(checked, context):
        # The shape is wrong, and the values are the person's, as a real bug would return them.
        return {"summary": "S3NT-summary", "steps": FIGURE, "cautions": [QUOKKA]}

    monkeypatch.setattr(plan, "render_plan", broken)

    response = post(helper(served(EVEN)))

    assert response.status_code == 500
    assert response.json() == {"detail": "Internal Server Error"}

    lines, text = sinks()
    assert_clean(text)
    assert QUOKKA not in text
    # The error is still reported, by field name.
    assert "response failed its model on /api/advisor/plan" in text
    assert_lines(lines, (PLAN, 500))


# ---------------------------------------------------------------- the search itself


def test_the_sinks_would_see_what_the_plan_route_logs(sinks):
    # The refuter for the search: a line written through the logger the route
    # uses is found, and the check fails on it.
    advisor_route.ERRORS_LOGGER.warning("S3NT-refuter")

    _, text = sinks()

    with pytest.raises(AssertionError):
        assert_clean(text)


def test_a_leak_of_the_answers_through_the_route_would_be_caught(sinks, helper, monkeypatch):
    real = advisor_route.run_unified_analysis

    def leaky(**answers):
        advisor_route.ERRORS_LOGGER.warning("analysing %s", answers)
        return real(**answers)

    monkeypatch.setattr(advisor_route, "run_unified_analysis", leaky)

    assert post(helper(served(EVEN))).status_code == 200

    _, text = sinks()

    with pytest.raises(AssertionError):
        assert_clean(text)


def test_a_leak_of_the_models_words_through_the_route_would_be_caught(sinks, helper, monkeypatch):
    real = plan.verify_plan

    def leaky(reply, context, language):
        advisor_route.ERRORS_LOGGER.warning("the model wrote %s", reply)
        return real(reply, context, language)

    monkeypatch.setattr(plan, "verify_plan", leaky)

    assert post(helper(served(EVEN))).status_code == 200

    _, text = sinks()

    # Only the model's word is looked for here: the plan does not contain a marker.
    assert QUOKKA in text


def test_a_leak_to_the_model_would_be_caught(helper, monkeypatch):
    real = plan.plan_messages

    def leaky(context, language, rejected=()):
        messages = real(context, language, rejected)
        messages[1]["content"] += " " + context["values"]["state"]
        return messages

    monkeypatch.setattr(plan, "plan_messages", leaky)
    model = served(EVEN)

    assert post(helper(model)).status_code == 200

    (call,) = model.calls
    with pytest.raises(AssertionError):
        assert_clean(json.dumps(call[2], ensure_ascii=False))
