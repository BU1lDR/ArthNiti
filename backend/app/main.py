from fastapi import FastAPI

from app.api.routes import health
from app.api.routes import entrepreneur
from app.api.routes import advisory
from app.api.routes import schemes
from app.api.routes import business
from app.api.routes import analysis

app = FastAPI(
    title="Rural Business Advisor API",
    description="AI-driven hyper-local business advisory and financial structuring assistant",
    version="0.1.0"
)

app.include_router(health.router)
app.include_router(entrepreneur.router)
app.include_router(advisory.router)
app.include_router(schemes.router)
app.include_router(business.router)
app.include_router(analysis.router)