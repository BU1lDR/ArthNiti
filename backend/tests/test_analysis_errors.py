from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


VALID_PAYLOAD = {
    "business_category": "Dairy",
    "state": "Delhi",
    "available_capital": 100000,
    "monthly_expenses": 30000,
    "expected_monthly_revenue": 50000,
    "monthly_emi": 5000,
    "initial_investment": 60000,
    "monthly_operating_expenses": 20000,
    "employees": 2,
    "existing_debt": 10000,
}


def test_zero_values_are_accepted():
    payload = VALID_PAYLOAD.copy()

    payload["available_capital"] = 0
    payload["monthly_expenses"] = 0
    payload["expected_monthly_revenue"] = 0
    payload["monthly_emi"] = 0
    payload["initial_investment"] = 0
    payload["monthly_operating_expenses"] = 0
    payload["employees"] = 0
    payload["existing_debt"] = 0

    response = client.post(
        "/api/analysis/run",
        json=payload,
    )

    assert response.status_code == 200


def test_negative_emi_returns_422():
    payload = VALID_PAYLOAD.copy()
    payload["monthly_emi"] = -1

    response = client.post(
        "/api/analysis/run",
        json=payload,
    )

    assert response.status_code == 422


def test_negative_debt_returns_422():
    payload = VALID_PAYLOAD.copy()
    payload["existing_debt"] = -1

    response = client.post(
        "/api/analysis/run",
        json=payload,
    )

    assert response.status_code == 422


def test_negative_employees_returns_422():
    payload = VALID_PAYLOAD.copy()
    payload["employees"] = -1

    response = client.post(
        "/api/analysis/run",
        json=payload,
    )

    assert response.status_code == 422


def test_short_business_category_returns_422():
    payload = VALID_PAYLOAD.copy()
    payload["business_category"] = "A"

    response = client.post(
        "/api/analysis/run",
        json=payload,
    )

    assert response.status_code == 422


def test_short_state_returns_422():
    payload = VALID_PAYLOAD.copy()
    payload["state"] = "D"

    response = client.post(
        "/api/analysis/run",
        json=payload,
    )

    assert response.status_code == 422