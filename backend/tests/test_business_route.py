from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_analyze_business_success():
    response = client.post(
        "/api/business/analyze",
        json={
            "business_type": "Dairy",
            "initial_investment": 100000,
            "expected_monthly_revenue": 50000,
            "monthly_operating_expenses": 30000,
            "employees": 2,
            "existing_debt": 10000,
        },
    )

    assert response.status_code == 200

    data = response.json()

    assert data["business_type"] == "Dairy"
    assert data["monthly_operating_surplus"] == 20000
    assert data["feasibility_status"] == "feasible"


def test_analyze_business_negative_investment():
    response = client.post(
        "/api/business/analyze",
        json={
            "business_type": "Dairy",
            "initial_investment": -1000,
            "expected_monthly_revenue": 50000,
            "monthly_operating_expenses": 30000,
        },
    )

    assert response.status_code == 422


def test_analyze_business_missing_required_field():
    response = client.post(
        "/api/business/analyze",
        json={
            "business_type": "Dairy",
            "initial_investment": 100000,
            "expected_monthly_revenue": 50000,
        },
    )

    assert response.status_code == 422