from fastapi import FastAPI

app = FastAPI(
    title="Rural Business Advisor API",
    description="AI-driven hyper-local business advisory and financial structuring assistant",
    version="0.1.0"
)


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "rural-business-advisor"
    }