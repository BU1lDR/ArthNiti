from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_health_endpoint_contract():
    response = client.get("/health")

    assert response.status_code == 200

    data = response.json()

    assert data["status"] == "ok"
    assert data["service"] == "rural-business-advisor"


def test_entrepreneur_profile_contract():
    payload = {
        "name": "Test Entrepreneur",
        "location": "Delhi",
        "business_type": "Dairy",
        "available_capital": 100000,
        "monthly_expenses": 30000,
        "expected_monthly_revenue_after_3_months": 50000,
        "goals": "Expand the business",
    }

    response = client.post("/api/entrepreneur/profile", json=payload)

    assert response.status_code == 200

    data = response.json()

    assert data["success"] is True
    assert data["message"] == "Entrepreneur profile received successfully"
    assert data["profile"]["name"] == "Test Entrepreneur"
    assert data["profile"]["business_type"] == "Dairy"


def test_advisory_endpoint_contract():
    payload = {
        "available_capital": 100000,
        "monthly_expenses": 30000,
        "expected_monthly_revenue": 50000,
        "monthly_emi": 5000,
    }

    response = client.post("/api/advisory/recommend", json=payload)

    assert response.status_code == 200

    data = response.json()

    assert data["success"] is True
    assert "financial_analysis" in data
    assert "risk_assessment" in data
    assert "advisory" in data

    assert data["financial_analysis"]["monthly_profit"] == 20000.0
    assert data["risk_assessment"]["risk_level"] == "low"
    assert isinstance(data["advisory"]["recommendations"], list)


def test_business_endpoint_contract():
    payload = {
        "business_type": "Dairy",
        "initial_investment": 60000,
        "expected_monthly_revenue": 50000,
        "monthly_operating_expenses": 20000,
        "employees": 2,
        "existing_debt": 10000,
    }

    response = client.post("/api/business/analyze", json=payload)

    assert response.status_code == 200

    data = response.json()

    assert data["business_type"] == "Dairy"
    assert data["initial_investment"] == 60000.0
    assert data["monthly_operating_surplus"] == 30000.0
    assert data["feasibility_status"] == "feasible"
    assert isinstance(data["observations"], list)


def test_scheme_matching_endpoint_contract():
    payload = {
        "business_category": "Dairy",
        "state": "Delhi",
    }

    response = client.post("/api/schemes/match", json=payload)

    assert response.status_code == 200

    data = response.json()

    assert data["success"] is True
    assert isinstance(data["count"], int)
    assert isinstance(data["matches"], list)
    assert data["count"] == len(data["matches"])

    if data["matches"]:
        first_match = data["matches"][0]

        assert "name" in first_match
        assert "match_score" in first_match
        assert "match_reasons" in first_match


def test_unified_analysis_endpoint_contract():
    payload = {
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

    response = client.post("/api/analysis/run", json=payload)

    assert response.status_code == 200

    data = response.json()

    expected_sections = {
        "financial_analysis",
        "risk_analysis",
        "business_analysis",
        "scheme_matches",
        "advisory",
    }

    assert expected_sections.issubset(data.keys())

    assert data["financial_analysis"]["financial_status"] == "profitable"
    assert data["risk_analysis"]["risk_level"] == "low"
    assert data["business_analysis"]["feasibility_status"] == "feasible"
    assert isinstance(data["scheme_matches"], list)
    assert isinstance(data["advisory"]["recommendations"], list)


def test_negative_financial_input_is_rejected():
    payload = {
        "available_capital": -1,
        "monthly_expenses": 30000,
        "expected_monthly_revenue": 50000,
        "monthly_emi": 5000,
    }

    response = client.post("/api/advisory/recommend", json=payload)

    assert response.status_code == 422


def test_missing_required_unified_analysis_fields_are_rejected():
    response = client.post(
        "/api/analysis/run",
        json={},
    )

    assert response.status_code == 422


def test_unified_analysis_openapi_registration():
    response = client.get("/openapi.json")

    assert response.status_code == 200

    openapi = response.json()
    paths = openapi["paths"]

    assert "/health" in paths
    assert "/api/entrepreneur/profile" in paths
    assert "/api/advisory/recommend" in paths
    assert "/api/business/analyze" in paths
    assert "/api/schemes/match" in paths
    assert "/api/analysis/run" in paths

    assert "post" in paths["/api/analysis/run"]
