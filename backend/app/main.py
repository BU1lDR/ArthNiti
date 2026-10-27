import logging
import sys

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError, ResponseValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import health
from app.api.routes import entrepreneur
from app.api.routes import advisory
from app.api.routes import schemes
from app.api.routes import analysis
from app.api.routes import business
from app.api.routes import financial
from app.api.routes import intake
from app.api.routes import market
from app.core.meta_client import MetaClient
from app.core.processing_log import configure_logging, processing_log_middleware
from app.core.settings import load_settings


STARTUP_LOGGER = logging.getLogger("arthniti.startup")
ERRORS_LOGGER = logging.getLogger("arthniti.errors")


# A 422 body carries only each error's type, loc and msg. FastAPI's own handler
# also echoes the rejected `input` and pydantic's `ctx`, and both break things:
# an Infinity or NaN input cannot be written as JSON, so the reply to a bad
# number became a 500 instead of a 422; and `input` sends a reader's own figures
# back in an error body that may be logged. `ctx` is dropped with it, since
# `msg` already says what the limit is. `loc` stays, because
# frontend/src/services/api.js names the field to fix from its last element.
def _public_error(error):
    loc = error.get("loc") or ()

    return {
        "type": str(error.get("type", "")),
        "loc": [part if isinstance(part, (str, int)) else str(part) for part in loc],
        "msg": str(error.get("msg", "")),
    }


async def request_validation_error(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"detail": [_public_error(error) for error in exc.errors()]},
    )


# A response that fails its response_model is a bug in this code, not in the
# request, but left to the server it prints a traceback whose text includes the
# response values, and the response is built from the reader's answers. So it is
# answered here with a bare 500, and the log says only where the mismatch was:
# each error's type and loc, which are field names, never values.
async def response_validation_error(request: Request, exc: ResponseValidationError):
    ERRORS_LOGGER.error(
        "response failed its model on %s (request_id %s): %s",
        getattr(request.scope.get("route"), "path", "unmatched"),
        request.scope.get("state", {}).get("request_id", "-"),
        [(str(error.get("type", "")), _public_error(error)["loc"]) for error in exc.errors()],
    )

    return JSONResponse(status_code=500, content={"detail": "Internal Server Error"})


def _mounted_routers(settings, model_client):
    analysis_router = analysis.build_router(
        require_consent=settings.require_consent,
        log_hash_key=settings.log_hash_key,
    )

    # Production serves what the frontend calls and a health check, nothing
    # else. The other six routers are thin wrappers over the same services,
    # kept for development and their tests.
    if settings.production:
        routers = [health.router, analysis_router]
    else:
        routers = [
            health.router,
            entrepreneur.router,
            advisory.router,
            schemes.router,
            analysis_router,
            business.router,
            financial.router,
            market.router,
        ]

    # The voice-and-text helper is off unless ARTHNITI_AI_ENABLED is true, in
    # production too. Nothing is sent to Meta, and no route exists to send it.
    if settings.ai_enabled:
        routers.append(
            intake.build_router(model_client, settings.ai_model, settings.asr_model, settings.ai_hourly_limit)
        )

    return routers


def _known_paths(app, routers):
    paths = {route.path for router in routers for route in router.routes}

    for url in (
        app.openapi_url,
        app.docs_url,
        app.redoc_url,
        app.docs_url and app.swagger_ui_oauth2_redirect_url,
    ):
        if url:
            paths.add(url)

    return paths


# uvicorn configures its logging before it imports this module, so by the time
# create_app runs the access logger already has its handlers. With uvicorn's
# defaults that is one StreamHandler on stdout, the stream the processing log
# uses; --no-access-log removes it; a --log-config that sends it to a file
# leaves a handler that is not on stdout.
def _access_log_on_stdout():
    access = logging.getLogger("uvicorn.access")

    if access.disabled or not access.isEnabledFor(logging.INFO):
        return False

    return any(
        isinstance(handler, logging.StreamHandler)
        and getattr(handler, "stream", None) in (sys.stdout, sys.__stdout__)
        for handler in access.handlers
    )


def _log_startup(settings, routers):
    if settings.production and _access_log_on_stdout():
        STARTUP_LOGGER.warning(
            "uvicorn's access log is on and writes to stdout: one plain-text "
            "line per request with the client's IP address and the path with "
            "its query string, between the processing-log lines. Start uvicorn "
            "with --no-access-log, or send uvicorn.access elsewhere with "
            "--log-config."
        )

    cors = (
        ", ".join(settings.cors_origins)
        if settings.cors_origins
        else f"any origin matching {settings.cors_origin_regex}"
    )

    if not settings.production:
        paths = sorted({route.path for router in routers for route in router.routes})
        STARTUP_LOGGER.warning(
            "ARTHNITI_ENV is development. Open: /docs, /redoc and /openapi.json; "
            "all %d routers (%s); CORS for %s; consent %s. "
            "Set ARTHNITI_ENV=production for any real deployment.",
            len(routers),
            ", ".join(paths),
            cors,
            "required" if settings.require_consent else "not required",
        )
    elif not settings.require_consent:
        STARTUP_LOGGER.info(
            "ARTHNITI_REQUIRE_CONSENT is false: POST /api/analysis/run accepts "
            "a request with no consent record, and its log line records consent "
            "as null."
        )

    if settings.ai_enabled:
        STARTUP_LOGGER.info(
            "ARTHNITI_AI_ENABLED is true: POST /api/intake/transcribe and "
            "/api/intake/extract send what a person says or types to Meta's "
            "model API (%s for text, %s for speech), at most %d calls an hour "
            "in all. docs/PROCESSOR_SCHEDULE.md lists what that adds for the "
            "deployer.",
            settings.ai_model,
            settings.asr_model,
            settings.ai_hourly_limit,
        )


def create_app(settings=None, model_client=None):
    """Build the API for one deployment's settings (core/settings.py).

    With no settings, they are read from the environment. Development serves
    every router and the docs; production serves only POST /api/analysis/run
    and GET /health, with no /docs, /redoc or /openapi.json. With
    ARTHNITI_AI_ENABLED true, either also serves the two /api/intake routes.

    `model_client` stands in for the Meta client in tests: an object with the
    two methods of core/meta_client.MetaClient. It is refused when the helper is
    off, because an app that quietly ignored it would pass a test of the wrong
    thing.
    """
    settings = load_settings() if settings is None else settings

    if model_client is not None and not settings.ai_enabled:
        raise ValueError("A model client was given, but ARTHNITI_AI_ENABLED is not true.")

    if settings.ai_enabled and model_client is None:
        model_client = MetaClient(settings.model_api_key)

    configure_logging()

    docs = {} if not settings.production else {
        "docs_url": None,
        "redoc_url": None,
        "openapi_url": None,
    }

    app = FastAPI(
        title="Rural Business Advisor API",
        description=(
            "Rule-based business advisory and financial structuring checks "
            "for rural micro-entrepreneurs"
        ),
        version="0.1.0",
        **docs,
    )
    app.state.settings = settings

    routers = _mounted_routers(settings, model_client)

    for router in routers:
        app.include_router(router)

    # No cookies or credentials are used, so none are allowed; and only what
    # the frontend sends: GET and POST with a JSON body.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_origin_regex=settings.cors_origin_regex,
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )

    # Added last, so it is the outermost of the app's own middleware (see
    # processing_log.py).
    app.add_middleware(
        processing_log_middleware,
        tenant=settings.tenant,
        known_paths=_known_paths(app, routers),
        hash_key=settings.log_hash_key,
    )

    app.add_exception_handler(RequestValidationError, request_validation_error)
    app.add_exception_handler(ResponseValidationError, response_validation_error)

    _log_startup(settings, routers)

    return app


app = create_app()
