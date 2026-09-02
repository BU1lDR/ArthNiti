from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_run_unified_analysis_success():
    response = client.post(
        "/api/analysis/run",
        json={
            "business_category": "Dairy",
            "state": "Delhi",
            "available_capital": 100000,
            "monthly_expenses": 30000,
            "expected_monthly_revenue": 50000,
            "monthly_emi": 5000,
            "initial_investment": 100000,
            "monthly_operating_expenses": 30000,
            "employees": 2,
            "existing_debt": 10000,
        },
    )

    assert response.status_code == 200

    data = response.json()

    assert "financial_analysis" in data
    assert "risk_analysis" in data
    assert "business_analysis" in data
    assert "scheme_matches" in data
    assert "advisory" in data

    assert data["financial_analysis"]["financial_status"] == "profitable"
    assert data["business_analysis"]["feasibility_status"] == "feasible"


def test_run_unified_analysis_invalid_input():
    response = client.post(
        "/api/analysis/run",
        json={
            "business_category": "Dairy",
            "state": "Delhi",
            "available_capital": -1000,
            "monthly_expenses": 30000,
            "expected_monthly_revenue": 50000,
            "monthly_emi": 5000,
            "initial_investment": 100000,
            "monthly_operating_expenses": 30000,
        },
    )

    assert response.status_code == 422


def test_run_unified_analysis_missing_required_field():
    response = client.post(
        "/api/analysis/run",
        json={
            "business_category": "Dairy",
            "state": "Delhi",
            "available_capital": 100000,
            "monthly_expenses": 30000,
            "expected_monthly_revenue": 50000,
        },
    )

    assert response.status_code == 422