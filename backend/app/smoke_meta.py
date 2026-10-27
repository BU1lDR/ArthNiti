"""Checks Meta's model API with a real key: `python -m app.smoke_meta [--wav FILE]`.

core/meta_client.py follows Meta's documentation and has not been checked against
the live service. This sends two short sample sentences to the chat model, runs
each answer through the same checks the helper's route does, and sends a
recording to the speech model (yours, or one second of silence). It prints what
came back and, for a failed call, Meta's own error message, which the app never
logs: the only text sent here is the samples below. It never prints the key.

Needs MODEL_API_KEY in the environment (the app reads no .env file). Exits 0
when every call worked, 1 when one did not, 2 when it could not start.
"""

import argparse
import io
import os
import pathlib
import sys
import wave

from app.api.routes.intake import MAX_COMPLETION_TOKENS
from app.core.meta_client import MetaClient, MetaError
from app.core.settings import SettingsError, load_settings
from app.services import intake_service as intake


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
    return bool(answers), f"{len(answers)} answers kept, {result['ignored']} ignored. {shown}"


def _hear(client, model, wav):
    transcript = client.transcribe(wav, SPOKEN, model)

    return True, f"transcript: {transcript!r}"


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


def main(argv=None):
    parser = argparse.ArgumentParser(description="Check Meta's model API with the key in MODEL_API_KEY.")
    parser.add_argument(
        "--wav",
        help=f"a mono 16-bit WAV at 16 or 24 kHz, said in {SPOKEN}; default: one second of silence",
    )
    args = parser.parse_args(argv)

    # Only the helper's own variables: a production setting left in the shell
    # would otherwise demand its own origins.
    names = ("MODEL_API_KEY", "ARTHNITI_AI_MODEL", "ARTHNITI_AI_ASR_MODEL")
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

    client = MetaClient(settings.model_api_key, timeout=60, keep_detail=True)

    print(f"Meta Model API: chat {settings.ai_model}, speech {settings.asr_model}")

    results = run(client, settings.ai_model, settings.asr_model, wav)

    for name, passed, note in results:
        print(f"{'PASS' if passed else 'FAIL'}  {name}: {note}")

    return 0 if all(passed for _, passed, _ in results) else 1


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.exit(main())
