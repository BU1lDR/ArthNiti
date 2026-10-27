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


MVP_SUMMARY_KEYS = {
    "status",
    "simple_message",
    "message_code",
    "next_step",
    "next_step_code",
    "priority",
    "location_type",
}


def test_mvp_accessibility_fields_are_accepted_and_not_echoed():
    # The summary used to echo the language, dialect, literacy level and
    # entrepreneur type back. The page already holds them, and nothing on the
    # server reads them, so they are accepted and left out of the response.
    response = client.post(
        "/api/analysis/run",
        json=MVP_PAYLOAD,
    )

    assert response.status_code == 200

    summary = response.json()["mvp_summary"]

    assert set(summary) == MVP_SUMMARY_KEYS
    for key in ("language", "preferred_dialect", "literacy_level", "entrepreneur_type"):
        assert key not in summary
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

    assert set(summary) == MVP_SUMMARY_KEYS
    assert summary["location_type"] == "rural"


def test_mvp_summary_with_a_blank_household_income():
    # null is what the frontend sends for the question left blank.
    response = client.post(
        "/api/analysis/run",
        json={**MVP_PAYLOAD, "household_monthly_income": None},
    )

    assert response.status_code == 200

    data = response.json()
    risk = data["risk_analysis"]
    summary = data["mvp_summary"]

    assert risk["household_check"] == "not_checked"
    assert risk["household_check_without_new_loan"] == "not_checked"
    assert risk["household_reason_code"] == "rsn.householdNotChecked"
    assert risk["household_repayment_percent"] is None
    assert risk["household_in_microfinance_range"] is None
    assert risk["household_limit_percent"] == 50
    assert risk["household_microfinance_income_limit"] == 300000
    assert summary["status"] in {"good", "attention_needed", "review"}
    assert summary["message_code"] != "sum.householdOverLimit"


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

def test_the_unified_route_forwards_every_request_field(monkeypatch):
    # A field added to the request model but not passed on is accepted,
    # validated and then dropped, and nothing fails. That is how
    # household_monthly_income was first left out: every request came back
    # not_checked whatever the reader typed. The only fields held back are the
    # accepted-and-ignored ones and the consent record, and the set is named
    # here in full so that growing it is a visible change.
    from app.api.routes import analysis as analysis_route
    from app.schemas.analysis import IGNORED_FIELDS, UnifiedAnalysisRequest

    assert IGNORED_FIELDS == {
        "employees",
        "village",
        "market_type",
        "customers",
        "user_language",
        "preferred_dialect",
        "literacy_level",
        "entrepreneur_type",
    }
    assert IGNORED_FIELDS < set(UnifiedAnalysisRequest.model_fields)

    seen = {}
    real = analysis_route.run_unified_analysis

    def spy(**kwargs):
        seen.update(kwargs)
        return real(**kwargs)

    monkeypatch.setattr(analysis_route, "run_unified_analysis", spy)
    response = client.post("/api/analysis/run", json=MVP_PAYLOAD)

    assert response.status_code == 200
    assert set(seen) == set(UnifiedAnalysisRequest.model_fields) - IGNORED_FIELDS - {"consent"}
