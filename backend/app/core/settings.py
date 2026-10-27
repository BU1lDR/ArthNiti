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

"*" is refused as an origin in both modes: with it, any website a person
visits could send answers to this API from their browser.
"""

import os
import re

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


def load_settings(environ=None):
    environ = os.environ if environ is None else environ

    env = _env(environ)
    cors_origins, cors_origin_regex = _origins(environ, env)

    return Settings(
        env=env,
        cors_origins=cors_origins,
        cors_origin_regex=cors_origin_regex,
        tenant=_tenant(environ),
        require_consent=_require_consent(environ, env),
        log_hash_key=_log_hash_key(environ),
    )
