"""What the voice-and-text helper's tests share: a fake model, a WAV file and the settings that switch the helper on.

The fake stands in for core/meta_client.MetaClient (create_app(model_client=...)).
It records each call and answers what the test set, so the routes run for real
and the network is never touched. What the real client puts on the wire is
tests/test_meta_client.py.
"""

import io
import wave


KEY = "LLM_1234567_" + "q" * 24

AI_ON = {"ARTHNITI_AI_ENABLED": "true", "MODEL_API_KEY": KEY}


class FakeModel:
    """Stands in for MetaClient: records each call, answers what the test set."""

    def __init__(self):
        self.calls = []
        self.transcript = "main silai karti hoon"
        self.extraction = {"text_answers": [], "money_answers": []}
        self.failure = None

    def transcribe(self, wav, language, model):
        self.calls.append(("transcribe", wav, language, model))
        if self.failure:
            raise self.failure
        return self.transcript

    def complete_json(self, model, messages, schema_name, schema, max_tokens):
        self.calls.append(("complete_json", model, messages, schema_name, schema, max_tokens))
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
