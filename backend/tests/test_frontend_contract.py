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


def test_frontend_contract_financial_section():
    response = client.post(
        "/api/analysis/run",
        json=VALID_PAYLOAD,
    )

    assert response.status_code == 200

    financial = response.json()["financial_analysis"]

    assert isinstance(financial["monthly_profit"], (int, float))
    assert isinstance(financial["profit_margin_percent"], (int, float))
    assert isinstance(financial["financial_status"], str)
    assert isinstance(financial["available_capital"], (int, float))


def test_frontend_contract_risk_section():
    response = client.post(
        "/api/analysis/run",
        json=VALID_PAYLOAD,
    )

    assert response.status_code == 200

    risk = response.json()["risk_analysis"]

    assert isinstance(risk["pressure_ratio_percent"], (int, float))
    assert isinstance(risk["risk_level"], str)
    assert isinstance(risk["reason"], str)


def test_frontend_contract_business_section():
    response = client.post(
        "/api/analysis/run",
        json=VALID_PAYLOAD,
    )

    assert response.status_code == 200

    business = response.json()["business_analysis"]

    assert isinstance(business["business_type"], str)
    assert isinstance(business["initial_investment"], (int, float))
    assert isinstance(business["expected_monthly_revenue"], (int, float))
    assert isinstance(business["monthly_operating_expenses"], (int, float))
    assert isinstance(business["monthly_operating_surplus"], (int, float))
    assert isinstance(business["operating_margin_percent"], (int, float))
    assert isinstance(business["annual_operating_surplus"], (int, float))
    assert isinstance(business["estimated_roi_percent"], (int, float))
    assert isinstance(business["feasibility_status"], str)
    assert isinstance(business["observations"], list)


def test_frontend_contract_scheme_matches():
    response = client.post(
        "/api/analysis/run",
        json=VALID_PAYLOAD,
    )

    assert response.status_code == 200

    schemes = response.json()["scheme_matches"]

    assert isinstance(schemes, list)

    for scheme in schemes:
        assert isinstance(scheme, dict)
        assert isinstance(scheme["name"], str)
        assert isinstance(scheme["description"], str)
        assert isinstance(scheme["support_type"], str)
        assert isinstance(scheme["match_score"], (int, float))
        assert isinstance(scheme["match_reasons"], list)
        assert isinstance(scheme["eligibility_rules"], list)
        assert isinstance(scheme["documents"], list)
        assert isinstance(scheme["official_url"], str)
        assert isinstance(scheme["last_verified"], str)


def test_frontend_contract_advisory_section():
    response = client.post(
        "/api/analysis/run",
        json=VALID_PAYLOAD,
    )

    assert response.status_code == 200

    advisory = response.json()["advisory"]

    assert isinstance(advisory["recommendations"], list)
    assert advisory["recommendations"]
