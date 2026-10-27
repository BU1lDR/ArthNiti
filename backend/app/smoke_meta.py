"""Checks Meta's model API with a real key: `python -m app.smoke_meta [--wav FILE | --plan]`.

core/meta_client.py was written from Meta's documentation and has been run against
the live service by the owner (27 Oct 2026; docs/HACKATHON.md section 4 has what
it showed). This sends two short sample sentences to the chat model, runs
each answer through the same checks the helper's route does, and sends a
recording to the speech model (yours, or one second of silence). It prints what
came back and, for a failed call, Meta's own error message, which the app never
logs: the only text sent here is the samples below. It never prints the key.
Each chat line ends with the token counts Meta reports for that call (in, how
many of those were cached, out, how many of those were reasoning), which is how
to see whether MAX_COMPLETION_TOKENS is sized right and the prompt cache works.

With --plan it checks the AI plan instead (services/plan_service.py): it asks
for a plan for a made-up tailor, in English and in Hindi, with the call the
plan route makes, and runs each reply through the same checks. A plan the
checks accept is printed with the rules' own figures in it. One they refuse is
printed as the model wrote it, with the reasons, so that the prompt can be
tuned from it. Each line also says how many seconds the call took. A plan is
the longest call the app makes, so this is the one to look at before the demo.

Every call is charged to the spend cap (core/spend.py) before it is sent, the
same cap the app uses (ARTHNITI_AI_SPEND_CAP_USD, ARTHNITI_AI_SPEND_FILE), and
the run prints what it recorded. Those figures are upper estimates made before
the calls, not Meta's bill: Meta's own figure is on the Usage page of its
dashboard, and comparing the two is how to see how high the estimates run.

Needs MODEL_API_KEY in the environment (the app reads no .env file). Exits 0
when every call worked, 1 when one did not, 2 when it could not start.
"""

import argparse
import io
import json
import os
import pathlib
import sys
import textwrap
import time
import wave

from app.api.routes.intake import MAX_COMPLETION_TOKENS
from app.core.meta_client import MetaClient, MetaError
from app.core.settings import SettingsError, load_settings
from app.core.spend import SpendCap
from app.services import intake_service as intake
from app.services import plan_service as plan
from app.services.analysis_service import run_unified_analysis


SAMPLES = (
    (
        "en",
        "I make clothes at home in a village near Lucknow, Uttar Pradesh. "
        "I have 50000 rupees and my expenses are about 8000 a month.",
    ),
    ("hi", "मैं गाँव में सिलाई करती हूँ। मेरे पास पचास हज़ार रुपये हैं और महीने का खर्च आठ हज़ार रुपये है।"),
)

# The language the speech model is told to expect.
SPOKEN = "Hindi"

# A tailor in rural Lucknow who needs ₹90,000 and has ₹20,000: the rules find a
# profit of ₹15,000 a month, a gap of ₹70,000 and a 24-month loan (the same
# answers as tests/plan_fixtures.py, which test_smoke_meta.py checks against the route).
PLAN_SAMPLE = {
    "business_category": "tailoring",
    "state": "Uttar Pradesh",
    "district": "Lucknow",
    "location_type": "rural",
    "available_capital": 20000,
    "monthly_expenses": 15000,
    "expected_monthly_revenue": 30000,
    "monthly_emi": 0,
    "initial_investment": 90000,
    "monthly_operating_expenses": 12000,
    "existing_debt": 0,
    "household_monthly_income": 25000,
}
PLAN_LANGUAGES = ("en", "hi")


def _silence():
    buffer = io.BytesIO()

    with wave.open(buffer, "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(16000)
        out.writeframes(b"\x00\x00" * 16000)

    return buffer.getvalue()


def _read(client, model, language, text):
    raw = client.complete_json(
        model,
        intake.extraction_messages(text, language),
        intake.SCHEMA_NAME,
        intake.extraction_schema(),
        MAX_COMPLETION_TOKENS,
    )
    result = intake.validate_extraction(raw, text)
    answers = result["answers"]
    shown = ", ".join(f'{a["field"]}={a["value"]} ("{a["evidence"]}")' for a in answers)

    # A reply that no answer survived is a failure of the check: the wire works,
    # but nothing the model said was usable.
    return bool(answers), f"{len(answers)} answers kept, {result['ignored']} ignored. {shown}  [{_tokens(client.last_usage)}]"


def _tokens(usage):
    """What Meta says a chat call used. A figure it left out prints as ?, and a zero as 0."""

    if "prompt_tokens" not in usage or "completion_tokens" not in usage:
        return "tokens: not reported"

    return (
        f"tokens: {usage['prompt_tokens']} in ({usage.get('cached_tokens', '?')} cached), "
        f"{usage['completion_tokens']} out ({usage.get('reasoning_tokens', '?')} reasoning)"
    )


def _hear(client, model, wav):
    transcript = client.transcribe(wav, SPOKEN, model, intake.SPEECH_KEYWORDS)

    return True, f"transcript: {transcript!r}"


def _took(client, started):
    """How long the call took and what Meta says it used."""

    return f"{time.monotonic() - started:.1f} s, {_tokens(client.last_usage)}"


def _plan_text(rendered):
    """A rendered plan as plain lines: the model's words with the rules' figures put in."""

    def line(parts):
        return "".join(part["v"] for part in parts)

    return "\n".join(
        [
            line(rendered["summary"]),
            *(f"{number}. {line(step)}" for number, step in enumerate(rendered["steps"], 1)),
            *(f"Caution: {line(caution)}" for caution in rendered["cautions"]),
        ]
    )


def _write_plan(client, model, language):
    # The call and the checks the plan route makes, once: the route's second try is
    # the same call told why the first was refused, which only matters once a first
    # try has failed, and this shows that first try.
    context = plan.build_context(PLAN_SAMPLE, run_unified_analysis(**PLAN_SAMPLE))
    started = time.monotonic()

    try:
        reply = client.complete_json(
            model,
            plan.plan_messages(context, language),
            plan.SCHEMA_NAME,
            plan.plan_schema(),
            plan.MAX_COMPLETION_TOKENS,
        )
    except MetaError as error:
        # Meta's own refusals are reported by _attempt; a reply that was not JSON of
        # the shape asked for is the model's miss, and the route tries again on it.
        if error.kind != "bad_output":
            raise

        return False, f"the reply was not JSON of the shape asked for  [{_took(client, started)}]"

    took = _took(client, started)

    try:
        checked = plan.verify_plan(reply, context, language)
    except plan.BadPlan as error:
        written = json.dumps(reply, ensure_ascii=False, indent=2)

        return False, f"refused by the checks: {', '.join(error.reasons)}  [{took}]\n" + textwrap.indent(written, "      ")

    return True, f"accepted  [{took}]\n" + textwrap.indent(_plan_text(plan.render_plan(checked, context)), "      ")


def _attempt(name, call):
    try:
        ok, note = call()
    except MetaError as error:
        said = "".join(
            f" {label}={value}"
            for label, value in (("code", error.code), ("param", error.param), ("message", error.detail))
            if value
        )
        return name, False, f"{error}.{said}"
    except intake.BadModelOutput as error:
        return name, False, f"the reply was not the shape asked for: {error}"

    return name, ok, note


def run(client, chat_model, asr_model, wav):
    """[(name, passed, note)] for each call."""

    checks = [
        (
            f"chat, {intake.LANGUAGES[language]}",
            lambda language=language, text=text: _read(client, chat_model, language, text),
        )
        for language, text in SAMPLES
    ]
    checks.append(("speech", lambda: _hear(client, asr_model, wav)))

    return [_attempt(name, call) for name, call in checks]


def run_plan(client, chat_model):
    """[(name, passed, note)] for a plan in each language."""

    return [
        _attempt(
            f"plan, {intake.LANGUAGES[language]}",
            lambda language=language: _write_plan(client, chat_model, language),
        )
        for language in PLAN_LANGUAGES
    ]


def main(argv=None):
    parser = argparse.ArgumentParser(description="Check Meta's model API with the key in MODEL_API_KEY.")
    what = parser.add_mutually_exclusive_group()
    what.add_argument(
        "--wav",
        help=f"a mono 16-bit WAV at 16 or 24 kHz, said in {SPOKEN}; default: one second of silence",
    )
    what.add_argument(
        "--plan",
        action="store_true",
        help="check the AI plan instead of the intake helper: a plan for a sample business, in English and in Hindi",
    )
    args = parser.parse_args(argv)

    # Only the helper's own variables: a production setting left in the shell
    # would otherwise demand its own origins.
    names = (
        "MODEL_API_KEY",
        "ARTHNITI_AI_MODEL",
        "ARTHNITI_AI_ASR_MODEL",
        "ARTHNITI_AI_SPEND_CAP_USD",
        "ARTHNITI_AI_SPEND_FILE",
    )
    environ = {name: os.environ[name] for name in names if name in os.environ}

    try:
        settings = load_settings({**environ, "ARTHNITI_AI_ENABLED": "true"})
    except SettingsError as error:
        print(f"Cannot start: {error}", file=sys.stderr)
        return 2

    wav = _silence()

    if args.wav:
        try:
            wav = pathlib.Path(args.wav).read_bytes()
        except OSError as error:
            print(f"Cannot read {args.wav}: {error.strerror}", file=sys.stderr)
            return 2

        if not intake.usable_wav(wav):
            print(f"{args.wav} is not a mono 16-bit WAV at 16 or 24 kHz.", file=sys.stderr)
            return 2

    try:
        spend = SpendCap(settings.ai_spend_file, settings.ai_spend_cap_usd)
    except ValueError as error:
        print(f"Cannot start: {error}", file=sys.stderr)
        return 2

    # A plan is allowed as long here as the route allows it.
    wait = plan.CALL_TIMEOUT_SECONDS if args.plan else 60
    client = MetaClient(settings.model_api_key, spend=spend, timeout=wait, keep_detail=True)
    before = spend.spent_usd()

    print(f"Meta Model API: chat {settings.ai_model}" + ("" if args.plan else f", speech {settings.asr_model}"))
    print(f"Spend cap ${settings.ai_spend_cap_usd:.2f}; ${before:.4f} already recorded in {settings.ai_spend_file}")

    if args.plan:
        results = run_plan(client, settings.ai_model)
    else:
        results = run(client, settings.ai_model, settings.asr_model, wav)

    for name, passed, note in results:
        print(f"{'PASS' if passed else 'FAIL'}  {name}: {note}")

    after = spend.spent_usd()
    print(
        f"Recorded by this run: ${after - before:.4f}. Recorded in all: ${after:.4f} of ${settings.ai_spend_cap_usd:.2f}. "
        "These are upper estimates; the Usage page on Meta's dashboard has the real figure."
    )

    return 0 if all(passed for _, passed, _ in results) else 1


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.exit(main())
