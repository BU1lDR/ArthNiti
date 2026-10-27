"""What the voice-and-text helper's tests share: a fake model, a WAV file and the settings that switch the helper on.

The fake stands in for core/meta_client.MetaClient (create_app(model_client=...)).
It records each call and answers what the test set, so the routes run for real
and the network is never touched. What the real client puts on the wire is
tests/test_meta_client.py.
"""

import io
import tempfile
import wave
from pathlib import Path


KEY = "LLM_1234567_" + "q" * 24

# A test that builds the app without a fake model gets a real spend ledger. This
# one is in a folder of its own, removed when the run ends, so that no test
# reads or writes the owner's real ledger in the backend folder.
_LEDGER_FOLDER = tempfile.TemporaryDirectory(prefix="arthniti-test-ledger-")

AI_ON = {
    "ARTHNITI_AI_ENABLED": "true",
    "MODEL_API_KEY": KEY,
    "ARTHNITI_AI_SPEND_FILE": str(Path(_LEDGER_FOLDER.name) / "ledger"),
}


class FakeModel:
    """Stands in for MetaClient: records each call, answers what the test set."""

    def __init__(self):
        self.calls = []
        self.transcript = "main silai karti hoon"
        self.extraction = {"text_answers": [], "money_answers": []}
        self.failure = None
        # The next chat replies, in order: a dict is returned, an exception is
        # raised. Once they are used up, `failure` and `extraction` answer again.
        self.replies = []
        # What the real client keeps of the last chat reply's token counts.
        self.last_usage = {}
        # The words the last speech call asked the model to favour. Kept apart
        # from `calls`, whose entries many tests unpack.
        self.keywords = ()

    def transcribe(self, wav, language, model, keywords=()):
        self.calls.append(("transcribe", wav, language, model))
        self.keywords = keywords
        if self.failure:
            raise self.failure
        return self.transcript

    def complete_json(self, model, messages, schema_name, schema, max_tokens):
        self.calls.append(("complete_json", model, messages, schema_name, schema, max_tokens))
        if self.replies:
            reply = self.replies.pop(0)
            if isinstance(reply, Exception):
                raise reply
            return reply
        if self.failure:
            raise self.failure
        return self.extraction


def wav_bytes(frames=1600, rate=16000, channels=1, width=2, fill=b"\x00"):
    """A WAV of `frames` frames of silence, or of `fill` repeated (to put a marker in the sound itself)."""
    size = frames * channels * width
    buffer = io.BytesIO()

    with wave.open(buffer, "wb") as out:
        out.setnchannels(channels)
        out.setsampwidth(width)
        out.setframerate(rate)
        out.writeframes((fill * size)[:size])

    return buffer.getvalue()
