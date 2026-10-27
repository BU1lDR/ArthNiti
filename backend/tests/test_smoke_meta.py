"""python -m app.smoke_meta: what it checks, what it prints and how it exits.

The script is for a real key, which no test has. These tests give it a fake
model in place of the client and check its own logic: a pass needs a usable
answer and not only an answer, a failure prints Meta's reason, and the key is
printed nowhere.
"""

import io
import wave

import pytest

from app import smoke_meta
from app.core.meta_client import MetaError
from intake_fixtures import KEY, FakeModel, wav_bytes


# Both samples hold the words the fake model quotes.
TEXTS = (("en", "I make clothes."), ("hi", "make clothes, said in Hindi."))

QUOTING = {
    "text_answers": [{"field": "business_category", "value": "tailoring", "evidence": "make clothes"}],
    "money_answers": [],
}


@pytest.fixture
def model(monkeypatch):
    fake = FakeModel()
    fake.extraction = QUOTING
    built = []

    def client(*args, **kwargs):
        built.append((args, kwargs))
        return fake

    monkeypatch.setattr(smoke_meta, "MetaClient", client)
    monkeypatch.setattr(smoke_meta, "SAMPLES", TEXTS)
    monkeypatch.setenv("MODEL_API_KEY", KEY)
    fake.built = built
    return fake


def run(capsys, *argv):
    code = smoke_meta.main(list(argv))
    out, err = capsys.readouterr()
    return code, out, err


def test_a_working_api_passes_every_check_and_exits_0(model, capsys):
    code, out, err = run(capsys)

    assert code == 0
    assert out.count("PASS") == 3 and "FAIL" not in out
    assert "chat, English" in out and "chat, Hindi" in out and "speech" in out
    assert 'business_category=tailoring ("make clothes")' in out
    assert "transcript: 'main silai karti hoon'" in out
    assert err == ""


def test_the_key_is_never_printed_and_meta_is_told_to_keep_its_reasons(model, capsys):
    _, out, err = run(capsys)

    assert KEY not in out + err
    # The client is built with the key and keeps Meta's message, which only this
    # script asks for.
    ((args, kwargs),) = model.built
    assert args == (KEY,)
    assert kwargs == {"timeout": 60, "keep_detail": True}


def test_the_models_it_names_are_the_ones_it_calls(model, capsys, monkeypatch):
    monkeypatch.setenv("ARTHNITI_AI_MODEL", "muse-spark-9")
    monkeypatch.setenv("ARTHNITI_AI_ASR_MODEL", "muse-voice-9")

    _, out, _ = run(capsys)

    assert "chat muse-spark-9, speech muse-voice-9" in out
    chat = [call for call in model.calls if call[0] == "complete_json"]
    speech = [call for call in model.calls if call[0] == "transcribe"]
    assert [call[1] for call in chat] == ["muse-spark-9"] * 2
    assert [call[3] for call in speech] == ["muse-voice-9"]


def test_each_sample_is_sent_in_its_own_language(model, capsys):
    run(capsys)

    chat = [call for call in model.calls if call[0] == "complete_json"]
    for (language, text), (_, _, messages, _, _, _) in zip(TEXTS, chat, strict=True):
        assert any(text in message["content"] for message in messages)
        assert any(smoke_meta.intake.LANGUAGES[language] in message["content"] for message in messages)


def test_a_failed_call_prints_what_meta_said_and_exits_1(model, capsys):
    model.failure = MetaError("auth", 401, code="invalid_api_key", param="Authorization", detail="That key is not valid")

    code, out, err = run(capsys)

    assert code == 1
    assert out.count("FAIL") == 3 and "PASS" not in out
    assert "auth (HTTP 401). code=invalid_api_key param=Authorization message=That key is not valid" in out
    assert KEY not in out + err


def test_one_failed_call_does_not_hide_the_others(model, capsys):
    def only_the_speech_fails(wav, language, model_name):
        raise MetaError("unavailable")

    model.transcribe = only_the_speech_fails

    code, out, _ = run(capsys)

    assert code == 1
    assert out.count("PASS") == 2 and out.count("FAIL") == 1
    assert "FAIL  speech: unavailable." in out


def test_a_reply_nothing_of_which_is_usable_fails_even_though_the_call_worked(model, capsys):
    model.extraction = {"text_answers": [], "money_answers": []}

    code, out, _ = run(capsys)

    assert code == 1
    assert out.count("FAIL") == 2
    assert "0 answers kept, 0 ignored." in out


def test_an_answer_the_person_never_said_does_not_count(model, capsys):
    model.extraction = {
        "text_answers": [{"field": "business_category", "value": "tailoring", "evidence": "I sell sweets"}],
        "money_answers": [],
    }

    code, out, _ = run(capsys)

    assert code == 1
    assert "0 answers kept, 1 ignored." in out


def test_a_reply_in_the_wrong_shape_fails_with_a_reason(model, capsys):
    model.extraction = ["not", "an", "object"]

    code, out, _ = run(capsys)

    assert code == 1
    assert "the reply was not the shape asked for" in out


def test_a_second_of_silence_is_sent_to_the_speech_model_by_default(model, capsys):
    run(capsys)

    ((_, wav, language, _),) = [call for call in model.calls if call[0] == "transcribe"]
    assert language == "Hindi"
    assert wav == smoke_meta._silence()
    assert smoke_meta.intake.usable_wav(wav)
    with wave.open(io.BytesIO(wav)) as sound:
        assert sound.getnframes() == sound.getframerate()


def test_a_recording_given_with_wav_is_the_one_sent(model, capsys, tmp_path):
    recording = tmp_path / "said.wav"
    recording.write_bytes(wav_bytes(frames=800, fill=b"\x01"))

    code, _, _ = run(capsys, "--wav", str(recording))

    assert code == 0
    ((_, wav, _, _),) = [call for call in model.calls if call[0] == "transcribe"]
    assert wav == recording.read_bytes()


@pytest.mark.parametrize(
    ("make", "said"),
    [
        (lambda path: path.write_bytes(b"not a recording"), "is not a mono 16-bit WAV"),
        (lambda path: path.write_bytes(wav_bytes(channels=2)), "is not a mono 16-bit WAV"),
        (lambda path: None, "Cannot read"),
    ],
    ids=["not audio", "stereo", "missing"],
)
def test_a_recording_that_cannot_be_used_stops_the_run_before_any_call(model, capsys, tmp_path, make, said):
    recording = tmp_path / "said.wav"
    make(recording)

    code, out, err = run(capsys, "--wav", str(recording))

    assert code == 2
    assert said in err
    assert out == ""
    assert model.calls == []


def test_without_a_key_it_says_what_to_set_and_exits_2(model, capsys, monkeypatch):
    monkeypatch.delenv("MODEL_API_KEY")

    code, out, err = run(capsys)

    assert code == 2
    assert "MODEL_API_KEY" in err
    assert out == "" and model.calls == []


def test_a_malformed_key_is_refused_without_printing_it(model, capsys, monkeypatch):
    bad = "LLM_1 with a space"
    monkeypatch.setenv("MODEL_API_KEY", bad)

    code, out, err = run(capsys)

    assert code == 2
    assert bad not in out + err
    assert model.calls == []


def test_a_production_setting_left_in_the_shell_does_not_stop_it(model, capsys, monkeypatch):
    # The helper's check needs its own variables and nobody else's.
    monkeypatch.setenv("ARTHNITI_ENV", "production")

    code, _, _ = run(capsys)

    assert code == 0
