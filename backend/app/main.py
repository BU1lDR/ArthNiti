from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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


app.include_router(health.router)
app.include_router(entrepreneur.router)
app.include_router(advisory.router)
app.include_router(schemes.router)
app.include_router(analysis.router)
app.include_router(business.router)
app.include_router(financial.router)
app.include_router(market.router)