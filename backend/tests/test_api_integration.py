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


def test_unified_analysis_endpoint_success():
    response = client.post(
        "/api/analysis/run",
        json=VALID_PAYLOAD,
    )

    assert response.status_code == 200


def test_unified_analysis_response_structure():
    response = client.post(
        "/api/analysis/run",
        json=VALID_PAYLOAD,
    )

    assert response.status_code == 200

    data = response.json()

    assert "financial_analysis" in data
    assert "risk_analysis" in data
    assert "business_analysis" in data
    assert "scheme_matches" in data
    assert "advisory" in data


def test_missing_required_field_returns_422():
    payload = VALID_PAYLOAD.copy()
    del payload["business_category"]

    response = client.post(
        "/api/analysis/run",
        json=payload,
    )

    assert response.status_code == 422


def test_negative_capital_returns_422():
    payload = VALID_PAYLOAD.copy()
    payload["available_capital"] = -1

    response = client.post(
        "/api/analysis/run",
        json=payload,
    )

    assert response.status_code == 422


def test_negative_expenses_returns_422():
    payload = VALID_PAYLOAD.copy()
    payload["monthly_expenses"] = -1

    response = client.post(
        "/api/analysis/run",
        json=payload,
    )

    assert response.status_code == 422


def test_cors_headers_are_present():
    response = client.options(
        "/api/analysis/run",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
        },
    )

    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_empty_request_body_returns_422():
    response = client.post(
        "/api/analysis/run",
        json={},
    )

    assert response.status_code == 422


def test_malformed_json_returns_422():
    response = client.post(
        "/api/analysis/run",
        content="{invalid json",
        headers={
            "Content-Type": "application/json",
        },
    )

    assert response.status_code == 422


def test_unified_analysis_full_pipeline():
    response = client.post(
        "/api/analysis/run",
        json=VALID_PAYLOAD,
    )

    assert response.status_code == 200

    data = response.json()

    # All major pipeline stages must be present
    assert isinstance(data["financial_analysis"], dict)
    assert isinstance(data["risk_analysis"], dict)
    assert isinstance(data["business_analysis"], dict)
    assert isinstance(data["scheme_matches"], list)
    assert isinstance(data["advisory"], dict)

    # Each stage should contain actual output
    assert data["financial_analysis"]
    assert data["risk_analysis"]
    assert data["business_analysis"]
    assert data["advisory"]