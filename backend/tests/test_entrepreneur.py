from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_create_entrepreneur_profile():

    response = client.post(
        "/api/entrepreneur/profile",
        json={
            "name": "Ramesh Kumar",
            "location": "Lucknow",
            "business_type": "Dairy",
            "available_capital": 50000,
            "monthly_expenses": 20000,
            "expected_monthly_revenue_after_3_months": 35000,
            "goals": "Expand dairy business"
        }
    )

    assert response.status_code == 200

    data = response.json()

    assert data["success"] is True
    assert data["message"] == "Entrepreneur profile received successfully"

    assert data["profile"]["name"] == "Ramesh Kumar"
    assert data["profile"]["location"] == "Lucknow"
    assert data["profile"]["business_type"] == "Dairy"
    assert data["profile"]["available_capital"] == 50000
    assert "financial_inputs" in data
    assert data["financial_inputs"]["available_capital"] == 50000
    assert data["financial_inputs"]["monthly_expenses"] == 20000
    assert data["financial_inputs"]["expected_monthly_revenue"] == 35000