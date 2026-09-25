from fastapi.testclient import TestClient

from app.main import app
from market_fixtures import synthetic_market  # noqa: F401


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

    # The analysis page shows these four directly. They were missing until
    # 7 Sept 2026, which made it render a confident "Money needed 0".
    assert isinstance(financial["monthly_expenses"], (int, float))
    assert isinstance(financial["expected_monthly_revenue"], (int, float))
    assert isinstance(financial["initial_investment"], (int, float))
    assert isinstance(financial["funding_gap"], (int, float))

    # This payload has more capital than the plan needs, so there is no gap.
    assert financial["funding_gap"] == 0


def test_frontend_contract_funding_gap_when_capital_falls_short():
    response = client.post(
        "/api/analysis/run",
        json={**VALID_PAYLOAD, "available_capital": 40000, "initial_investment": 60000},
    )

    assert response.status_code == 200

    financial = response.json()["financial_analysis"]

    assert financial["funding_gap"] == 20000
    # The report page computes the same figure client-side; they must agree.
    assert financial["funding_gap"] == (
        financial["initial_investment"] - financial["available_capital"]
    )


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


def test_frontend_contract_household_check_when_income_is_not_given():
    # The frontend sends null for a blank household-income question. Omitting
    # the key must read the same, and every household key must still be there,
    # because the result pages subscript them without guarding.
    for payload in (VALID_PAYLOAD, {**VALID_PAYLOAD, "household_monthly_income": None}):
        response = client.post("/api/analysis/run", json=payload)

        assert response.status_code == 200

        risk = response.json()["risk_analysis"]

        assert risk["household_monthly_income"] is None
        assert risk["household_repayment_percent"] is None
        assert risk["household_check"] == "not_checked"
        assert risk["household_check_without_new_loan"] == "not_checked"
        assert risk["household_limit_percent"] == 50
        assert risk["household_microfinance_income_limit"] == 300000
        assert risk["household_in_microfinance_range"] is None
        assert isinstance(risk["household_reason"], str)
        assert risk["household_reason_code"] == "rsn.householdNotChecked"


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
        # What the card is labelled with. The score is never printed as a
        # percentage any more: it checks no eligibility rule and only 90 and
        # 100 are reachable, so "90% match" claimed a precision nothing had.
        assert scheme["fit_basis"] in ("state", "region", "national")
        assert isinstance(scheme["match_reasons"], list)
        assert isinstance(scheme["eligibility_rules"], list)
        assert isinstance(scheme["documents"], list)
        assert isinstance(scheme["last_verified"], str)

        # The response must not hand the frontend a government portal URL --
        # see test_scheme.py. Asserted here too because this file is the
        # contract the UI reads, and an absent key is what stops a card from
        # rendering a link again.
        assert "official_url" not in scheme


def test_frontend_contract_advisory_section():
    response = client.post(
        "/api/analysis/run",
        json=VALID_PAYLOAD,
    )

    assert response.status_code == 200

    advisory = response.json()["advisory"]

    assert isinstance(advisory["recommendations"], list)
    assert advisory["recommendations"]


# The translation codes below are what make the result pages readable in a
# language other than English. They are a contract in exactly the way the prose
# fields are: the frontend reads them by name, and dropping one silently reverts
# that sentence to English rather than raising anything. These tests exist so the
# revert is a test failure instead of a demo surprise.
#
# Every code list is asserted to be the SAME LENGTH as the prose list beside it,
# because the services build the two in lockstep and index i of one is supposed to
# describe index i of the other. A length mismatch means a branch appended to one
# list and forgot the other, which would shift every later sentence onto the wrong
# translation — a far worse failure than a missing key, and invisible in English.
def test_frontend_contract_translation_codes_travel_with_their_prose():
    response = client.post("/api/analysis/run", json=VALID_PAYLOAD)

    assert response.status_code == 200

    body = response.json()

    advisory = body["advisory"]
    assert isinstance(advisory["recommendation_codes"], list)
    assert len(advisory["recommendation_codes"]) == len(advisory["recommendations"])

    business = body["business_analysis"]
    assert isinstance(business["observation_codes"], list)
    assert len(business["observation_codes"]) == len(business["observations"])

    risk = body["risk_analysis"]
    assert isinstance(risk["reason_code"], str)
    assert isinstance(risk["household_reason_code"], str)
    assert isinstance(risk["household_reason"], str)

    summary = body["mvp_summary"]
    assert isinstance(summary["message_code"], str)
    # next_step_code is the one code that may be None: in the branch where the
    # step is borrowed from the advisory list, it borrows that entry's code too,
    # and an empty list leaves nothing to borrow.
    assert summary["next_step_code"] is None or isinstance(summary["next_step_code"], str)


def test_frontend_contract_market_rows_carry_translation_codes(synthetic_market):
    # The rows come from the synthetic fixture, because market_data.json changes
    # with every fetch and could be []. Without them this loop could pass vacuously.
    # Handicrafts is there because its row carries a note; tailoring's does not.
    rows = []
    for category in ("tailoring", "handicrafts"):
        response = client.post(
            "/api/analysis/run",
            json={
                **VALID_PAYLOAD,
                "business_category": category,
                "state": "Uttar Pradesh",
                "district": "Lucknow",
            },
        )

        assert response.status_code == 200
        rows += response.json()["market_context"]

    assert len(rows) == 2, "expected the Lucknow tailoring and handicrafts rows"
    assert any("note" in row for row in rows)

    for row in rows:
        assert isinstance(row["source_code"], str)
        # A note is optional, but when it is there it carries a code too.
        if "note" in row:
            assert isinstance(row["note_code"], str)
        # No source backs a demand level or a season, so neither is sent.
        assert not {"seasonality", "seasonality_code", "demand_indicator"} & set(row)


def test_frontend_contract_scheme_translation_codes():
    response = client.post(
        "/api/analysis/run",
        json={**VALID_PAYLOAD, "business_category": "tailoring", "state": "Uttar Pradesh"},
    )

    assert response.status_code == 200

    schemes = response.json()["scheme_matches"]

    assert schemes

    for scheme in schemes:
        # scheme_id is what the frontend derives the description key from when no
        # explicit code is sent, so an empty one silently un-translates a scheme.
        assert scheme["scheme_id"]
        assert isinstance(scheme["description_code"], str)
        assert isinstance(scheme["support_type_code"], str)

        assert len(scheme["eligibility_codes"]) == len(scheme["eligibility_rules"])
        assert len(scheme["document_codes"]) == len(scheme["documents"])

        # Each match reason carries its own category list, because the category
        # sentence names the matched scheme wording and the frontend translates
        # each word before rejoining them.
        assert len(scheme["match_reason_codes"]) == len(scheme["match_reasons"])

        for entry in scheme["match_reason_codes"]:
            assert isinstance(entry["code"], str)
            assert isinstance(entry["categories"], list)
