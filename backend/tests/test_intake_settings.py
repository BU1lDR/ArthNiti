"""The settings that switch the voice-and-text helper on (core/settings.py).

The helper sends what a person says or types to Meta's model API, so it is off
unless someone turns it on, and turning it on without a key must stop the
server at startup rather than start a helper that fails on first use. The key
is a secret: it is read from the environment only, and no message, repr or log
line may contain it.
"""

import pytest

from app.core.settings import MAX_HOURLY_LIMIT, SettingsError, load_settings


KEY = "LLM_1234567_" + "q" * 24

ON = {"ARTHNITI_AI_ENABLED": "true", "MODEL_API_KEY": KEY}


def _refused(environ, *words):
    with pytest.raises(SettingsError) as refused:
        load_settings(environ)

    message = str(refused.value)
    for word in words:
        assert word in message

    return message


def test_the_helper_is_off_by_default_with_documented_model_defaults():
    settings = load_settings({})

    assert settings.ai_enabled is False
    assert settings.model_api_key is None
    assert settings.ai_model == "muse-spark-1.3"
    assert settings.asr_model == "muse-voice-transcribe-1.0"
    assert settings.ai_hourly_limit == 100


def test_switching_it_on_without_a_key_stops_startup_and_names_the_variable():
    _refused({"ARTHNITI_AI_ENABLED": "true"}, "MODEL_API_KEY", "ARTHNITI_AI_ENABLED")


def test_switching_it_on_with_a_key_keeps_the_key():
    settings = load_settings(ON)

    assert settings.ai_enabled is True
    assert settings.model_api_key == KEY


def test_printing_the_settings_never_prints_the_key():
    settings = load_settings(ON)

    assert KEY not in repr(settings)
    assert KEY not in str(settings)
    # A dump is how a settings object most often ends up in a log or a response.
    assert KEY not in settings.model_dump_json()
    assert KEY not in str(settings.model_dump())


def test_a_key_left_in_the_environment_is_not_held_while_the_helper_is_off():
    settings = load_settings({"MODEL_API_KEY": KEY})

    assert settings.ai_enabled is False
    assert settings.model_api_key is None


@pytest.mark.parametrize("word", ["True", "FALSE", "1", "0", "yes", "no", "on"])
def test_the_switch_accepts_only_true_or_false(word):
    _refused({"ARTHNITI_AI_ENABLED": word, "MODEL_API_KEY": KEY}, "ARTHNITI_AI_ENABLED", repr(word))


def test_an_explicit_false_keeps_it_off():
    assert load_settings({"ARTHNITI_AI_ENABLED": "false", "MODEL_API_KEY": KEY}).ai_enabled is False


@pytest.mark.parametrize("bad", ["two words", "line\nbreak", "tab\tbed", "café-key", "k" * 513])
def test_a_key_that_cannot_be_an_http_header_value_is_refused_without_printing_it(bad):
    message = _refused({"ARTHNITI_AI_ENABLED": "true", "MODEL_API_KEY": bad}, "MODEL_API_KEY")

    assert bad not in message


@pytest.mark.parametrize("variable", ["ARTHNITI_AI_MODEL", "ARTHNITI_AI_ASR_MODEL"])
@pytest.mark.parametrize(
    "model",
    ["muse-spark-1.3-contributor", "MUSE-SPARK-1.2-Contributor", "x-contributor"],
)
def test_models_that_let_meta_train_on_the_content_are_refused(variable, model):
    message = _refused({**ON, variable: model}, variable, "contributor")

    # A refusal that echoed the key would put it in the server's log.
    assert KEY not in message


@pytest.mark.parametrize("variable", ["ARTHNITI_AI_MODEL", "ARTHNITI_AI_ASR_MODEL"])
def test_a_contributor_model_is_refused_even_while_the_helper_is_off(variable):
    # Checked whenever it is set, so the mistake shows up the day it is made
    # and not the day someone turns the helper on.
    _refused({variable: "muse-spark-1.3-contributor"}, variable)


@pytest.mark.parametrize("variable", ["ARTHNITI_AI_MODEL", "ARTHNITI_AI_ASR_MODEL"])
@pytest.mark.parametrize("model", ["muse spark", "../etc", "-leading", "m" * 65, "müse"])
def test_a_model_name_must_look_like_a_model_name(variable, model):
    _refused({**ON, variable: model}, variable)


def test_other_model_names_are_accepted():
    settings = load_settings(
        {**ON, "ARTHNITI_AI_MODEL": "muse-spark-1.2", "ARTHNITI_AI_ASR_MODEL": "muse-voice-transcribe-1.1"}
    )

    assert settings.ai_model == "muse-spark-1.2"
    assert settings.asr_model == "muse-voice-transcribe-1.1"


@pytest.mark.parametrize("raw", ["0", "-1", "abc", "1.5", "1e3", " 5 5", str(MAX_HOURLY_LIMIT + 1)])
def test_the_hourly_limit_is_a_whole_number_from_one_up(raw):
    _refused({**ON, "ARTHNITI_AI_HOURLY_LIMIT": raw}, "ARTHNITI_AI_HOURLY_LIMIT")


@pytest.mark.parametrize(("raw", "expected"), [("1", 1), ("250", 250), (str(MAX_HOURLY_LIMIT), MAX_HOURLY_LIMIT)])
def test_a_good_hourly_limit_is_kept(raw, expected):
    assert load_settings({**ON, "ARTHNITI_AI_HOURLY_LIMIT": raw}).ai_hourly_limit == expected


def test_blank_ai_values_mean_the_default():
    settings = load_settings(
        {**ON, "ARTHNITI_AI_MODEL": " ", "ARTHNITI_AI_ASR_MODEL": "", "ARTHNITI_AI_HOURLY_LIMIT": ""}
    )

    assert settings.ai_model == "muse-spark-1.3"
    assert settings.asr_model == "muse-voice-transcribe-1.0"
    assert settings.ai_hourly_limit == 100
