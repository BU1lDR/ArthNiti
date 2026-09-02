from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


MVP_PAYLOAD = {
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
    "user_language": "Hindi",
    "preferred_dialect": "Haryanvi",
    "literacy_level": "low",
    "entrepreneur_type": "small_shop_owner",
    "location_type": "rural",
}


def test_mvp_summary_is_present_in_unified_response():
    response = client.post(
        "/api/analysis/run",
        json=MVP_PAYLOAD,
    )

    assert response.status_code == 200

    data = response.json()

    assert "mvp_summary" in data
    assert isinstance(data["mvp_summary"], dict)


def test_mvp_summary_required_fields():
    response = client.post(
        "/api/analysis/run",
        json=MVP_PAYLOAD,
    )

    assert response.status_code == 200

    summary = response.json()["mvp_summary"]

    assert isinstance(summary["status"], str)
    assert isinstance(summary["simple_message"], str)
    assert isinstance(summary["next_step"], str)
    assert isinstance(summary["priority"], str)


def test_mvp_accessibility_context_is_preserved():
    response = client.post(
        "/api/analysis/run",
        json=MVP_PAYLOAD,
    )

    assert response.status_code == 200

    summary = response.json()["mvp_summary"]

    assert summary["language"] == "Hindi"
    assert summary["preferred_dialect"] == "Haryanvi"
    assert summary["literacy_level"] == "low"
    assert summary["entrepreneur_type"] == "small_shop_owner"
    assert summary["location_type"] == "rural"


def test_mvp_defaults_work_without_accessibility_fields():
    payload = MVP_PAYLOAD.copy()

    del payload["user_language"]
    del payload["preferred_dialect"]
    del payload["literacy_level"]
    del payload["entrepreneur_type"]
    del payload["location_type"]

    response = client.post(
        "/api/analysis/run",
        json=payload,
    )

    assert response.status_code == 200

    summary = response.json()["mvp_summary"]

    assert summary["language"] == "Hindi"
    assert summary["preferred_dialect"] is None
    assert summary["literacy_level"] == "low"
    assert summary["location_type"] == "rural"


def test_existing_analysis_sections_are_preserved_with_mvp_summary():
    response = client.post(
        "/api/analysis/run",
        json=MVP_PAYLOAD,
    )

    assert response.status_code == 200

    data = response.json()

    assert "financial_analysis" in data
    assert "risk_analysis" in data
    assert "business_analysis" in data
    assert "scheme_matches" in data
    assert "advisory" in data
    assert "mvp_summary" in data
