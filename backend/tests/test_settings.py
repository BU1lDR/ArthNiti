"""The deployment settings (core/settings.py) and what create_app does with them.

load_settings takes a plain dict here, never os.environ, so each test states
the whole environment it runs under. A value nobody meant to set must stop the
server at startup with a message naming the variable, not start it in a mode
nobody chose.
"""

import io
import logging
import sys

import pytest
from pydantic import ValidationError

from app.core.settings import (
    LOOPBACK_ORIGIN_REGEX,
    MIN_LOG_HASH_KEY_LENGTH,
    SettingsError,
    load_settings,
)
from app.main import create_app


PRODUCTION = {
    "ARTHNITI_ENV": "production",
    "ARTHNITI_CORS_ORIGINS": "https://advisor.example.org",
}

KEY = "k" * MIN_LOG_HASH_KEY_LENGTH


def _refused(environ, *words):
    with pytest.raises(SettingsError) as refused:
        load_settings(environ)

    message = str(refused.value)
    for word in words:
        assert word in message

    return message


# ---------------------------------------------------------------- defaults and mode


def test_defaults_are_development_loopback_no_consent_default_tenant():
    settings = load_settings({})

    assert settings.env == "development"
    assert settings.production is False
    assert settings.cors_origins == ()
    assert settings.cors_origin_regex == LOOPBACK_ORIGIN_REGEX
    assert settings.tenant == "default"
    assert settings.require_consent is False
    assert settings.log_hash_key is None


def test_an_empty_or_blank_value_means_the_default():
    settings = load_settings(
        {
            "ARTHNITI_ENV": "",
            "ARTHNITI_CORS_ORIGINS": "  ",
            "ARTHNITI_TENANT": "",
            "ARTHNITI_REQUIRE_CONSENT": " ",
            "ARTHNITI_LOG_HASH_KEY": "",
        }
    )

    assert settings == load_settings({})


@pytest.mark.parametrize("value", ["Production", "prod", "PRODUCTION", "dev", "staging", "true"])
def test_unknown_env_value_refuses_to_start(value):
    _refused({**PRODUCTION, "ARTHNITI_ENV": value}, "ARTHNITI_ENV", repr(value))


def test_production_settings():
    settings = load_settings(PRODUCTION)

    assert settings.production is True
    assert settings.cors_origins == ("https://advisor.example.org",)
    assert settings.cors_origin_regex is None
    assert settings.require_consent is True


# ---------------------------------------------------------------- CORS origins


def test_production_requires_a_cors_list():
    _refused({"ARTHNITI_ENV": "production"}, "ARTHNITI_CORS_ORIGINS", "required")
    _refused({"ARTHNITI_ENV": "production", "ARTHNITI_CORS_ORIGINS": " "}, "ARTHNITI_CORS_ORIGINS")


@pytest.mark.parametrize(
    "origins",
    [
        "http://advisor.example.org",
        "*",
        "https://*.example.org",
        "https://advisor.example.org/app",
        "https://advisor.example.org/",
        "https://Advisor.example.org",
        "HTTPS://advisor.example.org",
        "https://advisor.example.org,",
        "https://advisor.example.org,,https://other.example.org",
        "advisor.example.org",
        "https://advisor.example.org:99999",
        "https://advisor.example.org:443",
        "https://advisor.example.org:0443",
        "https://advisor.example.org:0",
        "https://advisor.example.org:08443",
        "https://advisor.example.org?x=1",
        "ftp://advisor.example.org",
    ],
)
def test_production_refuses_http_star_path_trailing_slash_uppercase_and_empty_entries(origins):
    _refused({**PRODUCTION, "ARTHNITI_CORS_ORIGINS": origins}, "ARTHNITI_CORS_ORIGINS")


def test_production_accepts_several_origins_with_ports_and_drops_repeats():
    settings = load_settings(
        {
            **PRODUCTION,
            "ARTHNITI_CORS_ORIGINS": (
                " https://advisor.example.org , https://csc.example.in:8443,"
                "https://advisor.example.org"
            ),
        }
    )

    assert settings.cors_origins == ("https://advisor.example.org", "https://csc.example.in:8443")


def test_a_default_port_is_refused_because_no_browser_sends_it():
    message = _refused({"ARTHNITI_CORS_ORIGINS": "http://localhost:80"}, "ARTHNITI_CORS_ORIGINS")

    assert ":443" in message and ":80" in message
    # Not a default port for http, so it is kept.
    assert load_settings({"ARTHNITI_CORS_ORIGINS": "http://localhost:443"}).cors_origins == (
        "http://localhost:443",
    )


def test_development_uses_the_list_when_set():
    settings = load_settings({"ARTHNITI_CORS_ORIGINS": "http://localhost:5173,http://192.168.1.20:5173"})

    assert settings.cors_origins == ("http://localhost:5173", "http://192.168.1.20:5173")
    # The list replaces the loopback regex rather than adding to it.
    assert settings.cors_origin_regex is None


@pytest.mark.parametrize("origins", ["*", "http://localhost:5173,*", "http://*.localhost"])
def test_star_is_refused_in_development(origins):
    _refused({"ARTHNITI_CORS_ORIGINS": origins}, "ARTHNITI_CORS_ORIGINS", "'*'")


def test_development_still_refuses_a_malformed_origin():
    _refused({"ARTHNITI_CORS_ORIGINS": "http://localhost:5173/"}, "ARTHNITI_CORS_ORIGINS")


# ---------------------------------------------------------------- tenant, consent, hash key


@pytest.mark.parametrize("tenant", ["default", "nbfc-01", "shg.federation_up", "A", "x" * 40])
def test_a_valid_tenant_is_kept(tenant):
    assert load_settings({"ARTHNITI_TENANT": tenant}).tenant == tenant


@pytest.mark.parametrize(
    "tenant",
    ["x" * 41, "-leading", ".leading", "has space", "quote\"", "a/b", "ten\nant", "टेनेंट", "{}"],
)
def test_tenant_is_validated(tenant):
    # A tenant is copied into every log line, so it may not carry anything that
    # could break or forge a line.
    _refused({"ARTHNITI_TENANT": tenant}, "ARTHNITI_TENANT")


def test_require_consent_defaults_by_mode_and_refuses_other_words():
    assert load_settings({}).require_consent is False
    assert load_settings(PRODUCTION).require_consent is True
    assert load_settings({"ARTHNITI_REQUIRE_CONSENT": "true"}).require_consent is True
    assert load_settings({**PRODUCTION, "ARTHNITI_REQUIRE_CONSENT": "false"}).require_consent is False

    for word in ("True", "FALSE", "1", "0", "yes", "no", "on"):
        _refused({"ARTHNITI_REQUIRE_CONSENT": word}, "ARTHNITI_REQUIRE_CONSENT", repr(word))


def test_the_hash_key_is_optional_and_kept_when_long_enough():
    assert load_settings({}).log_hash_key is None
    assert load_settings({"ARTHNITI_LOG_HASH_KEY": KEY}).log_hash_key == KEY


def test_a_short_hash_key_is_refused_without_printing_it():
    short = "s3cr3t-" + "q" * (MIN_LOG_HASH_KEY_LENGTH - 8)
    message = _refused({"ARTHNITI_LOG_HASH_KEY": short}, "ARTHNITI_LOG_HASH_KEY")

    assert short not in message
    assert "s3cr3t" not in message


def test_printing_the_settings_never_prints_the_hash_key():
    settings = load_settings({"ARTHNITI_LOG_HASH_KEY": KEY})

    assert KEY not in repr(settings)
    assert KEY not in str(settings)


def test_the_settings_cannot_be_changed_after_loading():
    settings = load_settings({})

    with pytest.raises(ValidationError):
        settings.require_consent = True


# ---------------------------------------------------------------- create_app


def _startup_records(capture_log, environ):
    records = capture_log("arthniti.startup")
    create_app(load_settings(environ))
    return list(records)


def test_development_logs_one_startup_warning_naming_what_is_open(capture_log):
    records = _startup_records(capture_log, {})

    assert len(records) == 1
    record = records[0]
    message = record.getMessage()

    assert record.levelno == logging.WARNING
    assert "ARTHNITI_ENV is development" in message
    for open_thing in ("/docs", "/redoc", "/openapi.json", "all 8 routers", LOOPBACK_ORIGIN_REGEX):
        assert open_thing in message
    assert "consent not required" in message
    assert "Set ARTHNITI_ENV=production" in message


def test_the_development_warning_prints_the_origin_list_when_one_is_set(capture_log):
    records = _startup_records(capture_log, {"ARTHNITI_CORS_ORIGINS": "http://localhost:5173"})

    assert len(records) == 1
    assert "CORS for http://localhost:5173;" in records[0].getMessage()


def test_production_logs_no_startup_warning(capture_log):
    records = _startup_records(capture_log, PRODUCTION)

    assert records == []


def test_production_with_consent_off_logs_one_info_line(capture_log):
    records = _startup_records(capture_log, {**PRODUCTION, "ARTHNITI_REQUIRE_CONSENT": "false"})

    assert len(records) == 1
    assert records[0].levelno == logging.INFO
    assert "ARTHNITI_REQUIRE_CONSENT is false" in records[0].getMessage()


@pytest.fixture
def uvicorn_access():
    """The uvicorn.access logger, handed back with its handlers as they were.

    A test sets the handlers uvicorn itself would have set before importing the
    app: its default (a StreamHandler on stdout), --no-access-log (none) or a
    --log-config that sends the lines somewhere else.
    """
    access = logging.getLogger("uvicorn.access")
    saved = (list(access.handlers), access.propagate, access.level, access.disabled)

    yield access

    access.handlers[:], access.propagate, access.level, access.disabled = saved


def _uvicorn_default(access, stream):
    access.handlers[:] = [logging.StreamHandler(stream)]
    access.propagate = False
    access.setLevel(logging.INFO)


def test_production_warns_when_uvicorns_access_log_writes_to_stdout(capture_log, uvicorn_access):
    _uvicorn_default(uvicorn_access, sys.stdout)

    records = _startup_records(capture_log, PRODUCTION)

    assert len(records) == 1
    assert records[0].levelno == logging.WARNING
    message = records[0].getMessage()
    for words in ("IP address", "query string", "--no-access-log", "--log-config"):
        assert words in message


def test_production_is_quiet_under_no_access_log(capture_log, uvicorn_access):
    # What uvicorn's Config.configure_logging does for access_log=False.
    uvicorn_access.handlers[:] = []
    uvicorn_access.propagate = False

    assert _startup_records(capture_log, PRODUCTION) == []


def test_production_is_quiet_when_the_access_log_goes_elsewhere(capture_log, uvicorn_access):
    _uvicorn_default(uvicorn_access, io.StringIO())

    assert _startup_records(capture_log, PRODUCTION) == []


def test_production_is_quiet_when_the_access_log_is_turned_down(capture_log, uvicorn_access):
    _uvicorn_default(uvicorn_access, sys.stdout)
    uvicorn_access.setLevel(logging.WARNING)

    assert _startup_records(capture_log, PRODUCTION) == []


def test_development_does_not_add_the_access_log_warning(capture_log, uvicorn_access):
    _uvicorn_default(uvicorn_access, sys.stdout)

    records = _startup_records(capture_log, {})

    assert len(records) == 1
    assert "ARTHNITI_ENV is development" in records[0].getMessage()


def test_the_startup_lines_go_to_stderr_not_stdout(capsys):
    create_app(load_settings({}))

    captured = capsys.readouterr()

    assert "WARNING arthniti.startup: ARTHNITI_ENV is development" in captured.err
    assert "ARTHNITI_ENV" not in captured.out


def test_create_app_ignores_os_environ_when_settings_are_passed(monkeypatch):
    monkeypatch.setenv("ARTHNITI_ENV", "nonsense")
    monkeypatch.setenv("ARTHNITI_TENANT", "from-the-shell")

    # load_settings(environ=...) never reads the process environment ...
    settings = load_settings(PRODUCTION)
    assert settings.tenant == "default"

    # ... and create_app uses the settings it is given as they are.
    app = create_app(settings)
    assert app.state.settings is settings
    assert app.openapi_url is None

    # Without settings it does read the environment, and refuses this one.
    with pytest.raises(SettingsError):
        create_app()
