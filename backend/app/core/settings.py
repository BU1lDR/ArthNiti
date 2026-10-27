"""The deployment settings, read from environment variables.

`load_settings` is a pure function over a mapping (os.environ by default), so a
test builds any configuration without touching the process environment, and a
bad value stops the server at startup with a message naming the variable
instead of starting in a state nobody chose. Nothing here reads a .env file.

  ARTHNITI_ENV              "development" (the default) or "production".
                            Production serves only POST /api/analysis/run and
                            GET /health, with no /docs, /redoc or /openapi.json.
  ARTHNITI_CORS_ORIGINS     Comma-separated origins allowed to call the API
                            from a browser. Required in production, where every
                            entry must be https://host[:port]. In development,
                            unset means any loopback port over http.
  ARTHNITI_TENANT           A short label copied into every processing log line
                            (default "default").
  ARTHNITI_REQUIRE_CONSENT  "true" or "false": whether POST /api/analysis/run
                            refuses a request with no consent record. Defaults
                            to true in production and false in development.
  ARTHNITI_LOG_HASH_KEY     Optional. When set, the processing log keys its
                            code for the answers with HMAC-SHA256 instead of
                            plain SHA-256 (see core/processing_log.py).

The voice-and-text helper (api/routes/intake.py) sends what a person says or
types to Meta's model API. It is off unless switched on:

  ARTHNITI_AI_ENABLED       "true" or "false" (default "false"). "true" mounts
                            the /api/intake routes, in production too, and
                            refuses to start without MODEL_API_KEY.
  MODEL_API_KEY             The Meta Model API key. Environment only: nothing
                            here reads a file. Dropped while the helper is off.
  ARTHNITI_AI_MODEL         The chat model (default "muse-spark-1.3").
  ARTHNITI_AI_ASR_MODEL     The speech-to-text model (default
                            "muse-voice-transcribe-1.0").
  ARTHNITI_AI_HOURLY_LIMIT  Model calls the whole process makes per hour
                            (default 100), to bound what a public copy can spend.
  ARTHNITI_AI_SPEND_CAP_USD Dollars the helper may ask Meta to bill in all, as
                            counted by core/spend.py at prices that err high
                            (default 10, at most 100).
  ARTHNITI_AI_SPEND_FILE    The full path of the file that keeps that total
                            (default backend/.ai_spend). A relative path is
                            refused: it would start the total again at zero
                            wherever the server was started from.

A model whose name ends in "-contributor" is refused. On Meta's pricing page
those let Meta train on the prompts and responses, and this app's prompts hold
a person's finances.

"*" is refused as an origin in both modes: with it, any website a person
visits could send answers to this API from their browser.
"""

import os
import re
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field


DEVELOPMENT = "development"
PRODUCTION = "production"

# Any loopback port, so a dev server that falls back from 5173 to 5174 still
# works. Development only, and only when ARTHNITI_CORS_ORIGINS is unset.
LOOPBACK_ORIGIN_REGEX = r"http://(localhost|127\.0\.0\.1)(:\d+)?"

# An origin exactly as a browser sends it in the Origin header: a scheme, a
# lowercase host and an optional port, with no path and no trailing slash.
# Anything looser would be accepted here and then never match a real request,
# which fails silently as a CORS error in the reader's browser.
_ORIGIN = re.compile(r"^(https?)://([a-z0-9.-]+|\[[0-9a-f:]+\])(?::(\d{1,5}))?$")

# A browser leaves out the scheme's default port, and writes a port without
# leading zeros, so "https://a.example:443" or ":0443" would never match.
_DEFAULT_PORT = {"https": 443, "http": 80}


def _is_sent_port(scheme, port):
    if port is None:
        return True

    return (
        port == str(int(port))
        and 0 < int(port) <= 65535
        and int(port) != _DEFAULT_PORT[scheme]
    )


_TENANT = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$")

# Shorter than this and the key adds little over plain SHA-256.
MIN_LOG_HASH_KEY_LENGTH = 32

DEFAULT_AI_MODEL = "muse-spark-1.3"
DEFAULT_ASR_MODEL = "muse-voice-transcribe-1.0"
DEFAULT_HOURLY_LIMIT = 100
MAX_HOURLY_LIMIT = 100_000

# The owner's free credit is $150. The cap counts only what this app sends, so
# the most it can be set to stays well under that.
DEFAULT_SPEND_CAP_USD = 10
MAX_SPEND_CAP_USD = 100

# In the backend folder and not beside whatever folder the server was started
# from, so a restart from somewhere else finds the same total.
DEFAULT_SPEND_FILE = str(Path(__file__).resolve().parents[2] / ".ai_spend")

# Visible ASCII only: the key goes into an Authorization header, and a space,
# a line break or a non-ASCII character would corrupt or split the header.
_API_KEY = re.compile(r"^[\x21-\x7e]{1,512}$")

_MODEL_NAME = re.compile(r"^[a-z0-9][a-z0-9._-]{0,63}$")


class SettingsError(ValueError):
    pass


class Settings(BaseModel):
    model_config = ConfigDict(frozen=True)

    env: str
    # load_settings fills exactly one of these: the list when it was given,
    # else the loopback regex (development only).
    cors_origins: tuple[str, ...]
    cors_origin_regex: str | None
    tenant: str
    require_consent: bool
    # repr=False, so printing the settings never prints the key.
    log_hash_key: str | None = Field(default=None, repr=False)
    ai_enabled: bool = False
    # repr=False and exclude=True: neither printing nor dumping the settings
    # (the usual ways a settings object ends up in a log) shows the key.
    model_api_key: str | None = Field(default=None, repr=False, exclude=True)
    ai_model: str = DEFAULT_AI_MODEL
    asr_model: str = DEFAULT_ASR_MODEL
    ai_hourly_limit: int = DEFAULT_HOURLY_LIMIT
    ai_spend_cap_usd: float = DEFAULT_SPEND_CAP_USD
    ai_spend_file: str = DEFAULT_SPEND_FILE

    @property
    def production(self):
        return self.env == PRODUCTION


def _value(environ, name):
    # Unset and empty mean the same thing: use the default.
    return (environ.get(name) or "").strip()


def _env(environ):
    env = _value(environ, "ARTHNITI_ENV") or DEVELOPMENT

    if env not in (DEVELOPMENT, PRODUCTION):
        raise SettingsError(
            f"ARTHNITI_ENV must be exactly {DEVELOPMENT!r} or {PRODUCTION!r}, "
            f"not {env!r}."
        )

    return env


def _origins(environ, env):
    raw = _value(environ, "ARTHNITI_CORS_ORIGINS")

    if not raw:
        if env == PRODUCTION:
            raise SettingsError(
                "ARTHNITI_CORS_ORIGINS is required when ARTHNITI_ENV is "
                "production: a comma-separated list of the https:// origins "
                "the frontend is served from."
            )
        return (), LOOPBACK_ORIGIN_REGEX

    origins = []

    for entry in (part.strip() for part in raw.split(",")):
        if not entry:
            raise SettingsError(
                "ARTHNITI_CORS_ORIGINS has an empty entry; remove the extra comma."
            )
        if "*" in entry:
            raise SettingsError(
                "ARTHNITI_CORS_ORIGINS may not contain '*': name each origin."
            )

        match = _ORIGIN.match(entry)

        if not match or not _is_sent_port(match.group(1), match.group(3)):
            raise SettingsError(
                f"ARTHNITI_CORS_ORIGINS entry {entry!r} is not an origin. Write "
                "it as the browser sends it: scheme://host or scheme://host:port, "
                "lowercase, with no path and no trailing slash; leave out :443 "
                "or :80, which a browser never sends."
            )
        if env == PRODUCTION and match.group(1) != "https":
            raise SettingsError(
                f"ARTHNITI_CORS_ORIGINS entry {entry!r} must start with https:// "
                "when ARTHNITI_ENV is production."
            )

        if entry not in origins:
            origins.append(entry)

    return tuple(origins), None


def _tenant(environ):
    tenant = _value(environ, "ARTHNITI_TENANT") or "default"

    if not _TENANT.match(tenant):
        raise SettingsError(
            "ARTHNITI_TENANT must be 1 to 40 letters, digits, '.', '_' or '-', "
            f"starting with a letter or digit, not {tenant!r}."
        )

    return tenant


def _require_consent(environ, env):
    raw = _value(environ, "ARTHNITI_REQUIRE_CONSENT")

    if not raw:
        return env == PRODUCTION
    if raw not in ("true", "false"):
        raise SettingsError(
            f"ARTHNITI_REQUIRE_CONSENT must be exactly 'true' or 'false', not {raw!r}."
        )

    return raw == "true"


def _log_hash_key(environ):
    key = _value(environ, "ARTHNITI_LOG_HASH_KEY")

    if not key:
        return None
    if len(key) < MIN_LOG_HASH_KEY_LENGTH:
        # The message never includes the key itself.
        raise SettingsError(
            f"ARTHNITI_LOG_HASH_KEY must be at least {MIN_LOG_HASH_KEY_LENGTH} "
            "characters. Generate one with: "
            'python -c "import secrets; print(secrets.token_hex(32))"'
        )

    return key


def _ai_enabled(environ):
    raw = _value(environ, "ARTHNITI_AI_ENABLED")

    if not raw:
        return False
    if raw not in ("true", "false"):
        raise SettingsError(
            f"ARTHNITI_AI_ENABLED must be exactly 'true' or 'false', not {raw!r}."
        )

    return raw == "true"


def _model_api_key(environ, enabled):
    # A key left in the environment while the helper is off is not kept.
    if not enabled:
        return None

    key = _value(environ, "MODEL_API_KEY")

    if not key:
        raise SettingsError(
            "MODEL_API_KEY is required when ARTHNITI_AI_ENABLED is true: the "
            "Meta Model API key, set in the environment. This server reads no "
            ".env file."
        )
    if not _API_KEY.match(key):
        # The message never includes the key itself.
        raise SettingsError(
            "MODEL_API_KEY must be 1 to 512 visible ASCII characters, with no "
            "space, tab or line break in it."
        )

    return key


def _model(environ, name, default):
    model = _value(environ, name) or default

    # Before the shape check, so "…-Contributor" gets the reason that matters.
    if model.lower().endswith("-contributor"):
        raise SettingsError(
            f"{name} may not be a contributor model ({model!r}): on Meta's "
            "pricing page those let Meta train on the prompts and responses."
        )
    if not _MODEL_NAME.match(model):
        raise SettingsError(
            f"{name} must be a model name such as {default!r}: lowercase "
            f"letters, digits, '.', '_' or '-', at most 64 characters, not {model!r}."
        )

    return model


def _hourly_limit(environ):
    raw = _value(environ, "ARTHNITI_AI_HOURLY_LIMIT")

    if not raw:
        return DEFAULT_HOURLY_LIMIT
    if not re.fullmatch(r"[0-9]+", raw) or not 1 <= int(raw) <= MAX_HOURLY_LIMIT:
        raise SettingsError(
            f"ARTHNITI_AI_HOURLY_LIMIT must be a whole number from 1 to "
            f"{MAX_HOURLY_LIMIT}, not {raw!r}."
        )

    return int(raw)


def _spend_cap_usd(environ):
    raw = _value(environ, "ARTHNITI_AI_SPEND_CAP_USD")

    if not raw:
        return DEFAULT_SPEND_CAP_USD

    # Plain dollars to the millionth the ledger counts in: not "1e1", "nan" or ".5".
    if not re.fullmatch(r"[0-9]+(\.[0-9]{1,6})?", raw) or not 0 < float(raw) <= MAX_SPEND_CAP_USD:
        raise SettingsError(
            f"ARTHNITI_AI_SPEND_CAP_USD must be an amount of dollars above 0 and at "
            f"most {MAX_SPEND_CAP_USD}, written like 10 or 2.50, not {raw!r}."
        )

    return float(raw)


def _spend_file(environ):
    raw = _value(environ, "ARTHNITI_AI_SPEND_FILE")

    if not raw:
        return DEFAULT_SPEND_FILE
    if not Path(raw).is_absolute():
        raise SettingsError(
            f"ARTHNITI_AI_SPEND_FILE must be a full path, not {raw!r}: a relative "
            "path lands wherever the server was started from, and the total would "
            "start again at zero."
        )

    return raw


def load_settings(environ=None):
    environ = os.environ if environ is None else environ

    env = _env(environ)
    cors_origins, cors_origin_regex = _origins(environ, env)
    ai_enabled = _ai_enabled(environ)

    return Settings(
        env=env,
        cors_origins=cors_origins,
        cors_origin_regex=cors_origin_regex,
        tenant=_tenant(environ),
        require_consent=_require_consent(environ, env),
        log_hash_key=_log_hash_key(environ),
        ai_enabled=ai_enabled,
        model_api_key=_model_api_key(environ, ai_enabled),
        ai_model=_model(environ, "ARTHNITI_AI_MODEL", DEFAULT_AI_MODEL),
        asr_model=_model(environ, "ARTHNITI_AI_ASR_MODEL", DEFAULT_ASR_MODEL),
        ai_hourly_limit=_hourly_limit(environ),
        ai_spend_cap_usd=_spend_cap_usd(environ),
        ai_spend_file=_spend_file(environ),
    )
