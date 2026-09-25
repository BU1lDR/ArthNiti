from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import health
from app.api.routes import entrepreneur
from app.api.routes import advisory
from app.api.routes import schemes
from app.api.routes import analysis
from app.api.routes import business
from app.api.routes import financial
from app.api.routes import market



app = FastAPI(
    title="Rural Business Advisor API",
    description="AI-driven hyper-local business advisory and financial structuring assistant",
    version="0.1.0"
)


# Any loopback port, so a dev server that falls back from 5173 to 5174 still works.
# Replace with an explicit allow_origins list before deploying.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


@app.exception_handler(RequestValidationError)
async def request_validation_error(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"detail": [_public_error(error) for error in exc.errors()]},
    )


app.include_router(health.router)
app.include_router(entrepreneur.router)
app.include_router(advisory.router)
app.include_router(schemes.router)
app.include_router(analysis.router)
app.include_router(business.router)
app.include_router(financial.router)
app.include_router(market.router)