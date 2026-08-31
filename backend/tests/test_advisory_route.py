from fastapi.testclient import TestClient

from app.main import app


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