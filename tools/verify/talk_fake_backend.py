"""The backend tools/verify/talk-ui.mjs drives: the real app with the helper switched on and a fake in Meta's place.

    .venv/Scripts/python.exe tools/verify/talk_fake_backend.py <port>

Nothing here calls Meta, so no key or network is needed. The fake finds answers by
keyword in the words it is given, which lets a verifier decide what the helper
"understands" by what it types. Everything else is the shipped app: the routes,
the WAV check, the validation of what the model says, the status codes.

A side channel the real app does not have, for the verifier only:

    POST /__fake  {"transcript": "...", "fail": "rate_limited", "delay": 2.5, "extraction": {...}}
                  sets how the fake answers; any key may be left out
    POST /__fake  {"reset": true}      back to the defaults, and forget the calls
    GET  /__fake                       what the fake was asked, oldest first
"""

import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))

import uvicorn  # noqa: E402
from fastapi import Request  # noqa: E402

from app.core.meta_client import MetaError  # noqa: E402
from app.core.settings import load_settings  # noqa: E402
from app.main import create_app  # noqa: E402

KEY = "LLM_1234567_" + "q" * 24

TEXT_RULES = (
    ("business_category", "tailoring", r"tailoring"),
    ("state", "Uttar Pradesh", r"Uttar Pradesh"),
    ("district", "Lucknow", r"Lucknow"),
    ("location_type", "rural", r"village"),
)

MONEY_RULES = (
    ("initial_investment", r"need (\d+) to start"),
    ("expected_monthly_revenue", r"earn (\d+) a month"),
    ("monthly_operating_expenses", r"costs are (\d+) a month"),
    ("existing_debt", r"owe (\d+) on a loan"),
    ("available_capital", r"have (\d+) saved"),
    ("monthly_expenses", r"spend (\d+) at home"),
    ("monthly_emi", r"pay (\d+) EMI"),
    ("household_monthly_income", r"household earns (\d+)"),
)

DEFAULTS = {
    "transcript": "I do tailoring in a village near Lucknow, Uttar Pradesh. I need 50000 to start.",
    "fail": None,
    "delay": 0,
    # When set, returned as the model's reply instead of the keyword search.
    "extraction": None,
}


class Fake:
    def __init__(self):
        self.reset()

    def reset(self):
        self.mode = dict(DEFAULTS)
        self.calls = []

    def _enter(self, entry):
        self.calls.append(entry)
        time.sleep(self.mode["delay"])
        if self.mode["fail"]:
            raise MetaError(self.mode["fail"])

    def transcribe(self, wav, language, model, keywords=()):
        self._enter(
            {
                "call": "transcribe",
                "language": language,
                "bytes": len(wav),
                "riff": wav[:4].decode("latin-1"),
                "wave": wav[8:12].decode("latin-1"),
                "channels": int.from_bytes(wav[22:24], "little"),
                "rate": int.from_bytes(wav[24:28], "little"),
            }
        )
        return self.mode["transcript"]

    def complete_json(self, model, messages, schema_name, schema, max_tokens):
        text = messages[-1]["content"]
        self._enter({"call": "extract", "text": text})

        if self.mode["extraction"] is not None:
            return self.mode["extraction"]

        return {
            "text_answers": [
                {"field": field, "value": value, "evidence": found.group(0)}
                for field, value, pattern in TEXT_RULES
                if (found := re.search(pattern, text, re.I))
            ],
            "money_answers": [
                {"field": field, "rupees": int(found.group(1)), "evidence": found.group(0)}
                for field, pattern in MONEY_RULES
                if (found := re.search(pattern, text, re.I))
            ],
        }


fake = Fake()

# An environ of its own, so a MODEL_API_KEY in the shell is never read.
app = create_app(
    load_settings({"ARTHNITI_AI_ENABLED": "true", "MODEL_API_KEY": KEY, "ARTHNITI_AI_HOURLY_LIMIT": "5000"}),
    model_client=fake,
)


@app.post("/__fake")
async def set_mode(request: Request):
    body = await request.json()

    if body.get("reset"):
        fake.reset()

    fake.mode.update({key: value for key, value in body.items() if key in DEFAULTS})

    return {"ok": True}


@app.get("/__fake")
def calls():
    return fake.calls


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=int(sys.argv[1]), access_log=False, log_level="warning")
