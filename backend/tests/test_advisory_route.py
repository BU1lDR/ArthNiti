from fastapi.testclient import TestClient

from app.main import app
from app.services.market_service import get_market_context
from market_fixtures import synthetic_market  # noqa: F401


client = TestClient(app)


def test_advisory_recommendation_endpoint():

    response = client.post(
        "/api/advisory/recommend",
        json={
            "available_capital": 50000,
            "monthly_expenses": 20000,
            "expected_monthly_revenue": 30000,
            "monthly_emi": 5000
        }
    )

    assert response.status_code == 200

    data = response.json()

    assert data["success"] is True
    assert "financial_analysis" in data
    assert "risk_assessment" in data
    assert "advisory" in data

    assert data["financial_analysis"]["monthly_profit"] == 10000
    assert data["financial_analysis"]["financial_status"] == "profitable"
    assert data["risk_assessment"]["pressure_ratio_percent"] == 50
    assert data["risk_assessment"]["risk_level"] == "moderate"

    assert len(data["advisory"]["recommendations"]) > 0


def test_advisory_recommendation_with_market_context(synthetic_market):

    # market_data.json changes with every fetch, so the rows come from the
    # synthetic fixture. The route must pass them through as the service
    # returns them, nulls and provenance included.
    response = client.post(
        "/api/advisory/recommend",
        json={
            "available_capital": 50000,
            "monthly_expenses": 20000,
            "expected_monthly_revenue": 30000,
            "monthly_emi": 5000,
            "state": "Uttar Pradesh",
            "district": "Lucknow",
            "business_category": "tailoring"
        }
    )

    assert response.status_code == 200

    data = response.json()

    assert "market_context" in data
    assert data["market_context"], "expected the Lucknow tailoring row"
    assert data["market_context"] == get_market_context("Uttar Pradesh", "Lucknow", "tailoring")
    assert [row["match_level"] for row in data["market_context"]] == ["district"]
    assert data["market_context"][0]["district"] == "Lucknow"