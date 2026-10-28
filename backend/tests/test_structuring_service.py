import json
import math

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.analysis_service import run_unified_analysis
from app.services.structuring_service import build_scheme_funding

# Every expected figure below was worked out by hand from the published terms,
# not by calling the code under test:
#   PMEGP  (KVIC guidelines, 1 June 2022, para 3.2): General category puts in 10%
#          and gets a subsidy of 25% (rural) or 15% (urban); a special category
#          puts in 5% and gets 35% (rural) or 25% (urban). The cost counted is
#          capped at Rs.20 lakh (service/trading) or Rs.50 lakh (manufacturing).
#   PMFME  (MoFPI): 35% credit-linked subsidy, at most Rs.10 lakh a unit, with
#          the beneficiary putting in at least 10%.
#   Mudra  (Department of Financial Services): Shishu to Rs.50,000, Kishore to
#          Rs.5 lakh, Tarun to Rs.10 lakh, Tarun Plus to Rs.20 lakh.


def _funding(cost=400000, capital=100000, location="rural", matched=("pmegp",)):
    return build_scheme_funding(
        project_cost=cost,
        money_in_hand=capital,
        location_type=location,
        matched_scheme_ids=list(matched),
    )


def _entry(result, scheme_id):
    return next(entry for entry in result["schemes"] if entry["scheme_id"] == scheme_id)


def _case(entry, code):
    return next(case for case in entry["cases"] if case["code"] == code)


def test_pmegp_rural_figures_for_a_general_and_a_special_category():
    # ₹4,00,000 project, ₹1,00,000 in hand. General: own 10% = 40,000, subsidy
    # 25% = 1,00,000, bank = 4,00,000 - 40,000 = 3,60,000, of which the subsidy is
    # set against the loan, leaving 2,60,000 to repay. Special: own 5% = 20,000,
    # subsidy 35% = 1,40,000, bank 3,80,000, to repay 2,40,000.
    entry = _entry(_funding(), "pmegp")

    assert entry["kind"] == "subsidy"
    assert entry["terms"] == "kvic_2022"
    assert entry["area"] == "rural"
    assert entry["area_assumed"] is False
    assert [case["code"] for case in entry["cases"]] == ["general", "special"]
    assert _case(entry, "general") == {
        "code": "general",
        "own_percent": 10,
        "own_amount": 40000,
        "own_short_by": 0,
        "subsidy_percent": 25,
        "subsidy_amount": 100000,
        "bank_amount": 360000,
        "net_loan_amount": 260000,
    }
    assert _case(entry, "special") == {
        "code": "special",
        "own_percent": 5,
        "own_amount": 20000,
        "own_short_by": 0,
        "subsidy_percent": 35,
        "subsidy_amount": 140000,
        "bank_amount": 380000,
        "net_loan_amount": 240000,
    }


def test_pmegp_urban_pays_the_lower_subsidy_rates():
    # Urban: general 15% of 4,00,000 = 60,000; special 25% = 1,00,000.
    entry = _entry(_funding(location="urban"), "pmegp")

    assert entry["area"] == "urban"
    assert entry["area_assumed"] is False
    assert _case(entry, "general")["subsidy_amount"] == 60000
    assert _case(entry, "general")["subsidy_percent"] == 15
    assert _case(entry, "special")["subsidy_amount"] == 100000
    assert _case(entry, "special")["subsidy_percent"] == 25


@pytest.mark.parametrize("location", ["semi-urban", "", "village"])
def test_pmegp_treats_any_place_that_is_not_plainly_rural_as_urban_and_says_so(location):
    # The guidelines know rural and urban only. A semi-urban place is not rural,
    # and the lower urban rate is the one that cannot promise too much.
    entry = _entry(_funding(location=location), "pmegp")

    assert entry["area"] == "urban"
    assert entry["area_assumed"] is True
    assert _case(entry, "general")["subsidy_amount"] == 60000


def test_pmegp_counts_the_project_cost_only_up_to_the_service_ceiling():
    # ₹30 lakh against the ₹20 lakh ceiling. Subsidy: 25% of 20,00,000 = 5,00,000.
    # Own money is the reading that cannot understate it: 10% of the whole
    # ₹30 lakh = 3,00,000. Bank: 27,00,000, of which 5,00,000 is the subsidy.
    entry = _entry(_funding(cost=3000000, capital=3000000), "pmegp")

    assert entry["limit_kind"] == "cost"
    assert entry["limit"] == 2000000
    assert entry["limit_applied"] is True
    general = _case(entry, "general")
    assert general["subsidy_amount"] == 500000
    assert general["own_amount"] == 300000
    assert general["bank_amount"] == 2700000
    assert general["net_loan_amount"] == 2200000


def test_pmegp_ceiling_is_not_applied_at_or_below_it():
    at_limit = _entry(_funding(cost=2000000), "pmegp")
    assert at_limit["limit_applied"] is False
    assert _case(at_limit, "general")["subsidy_amount"] == 500000

    just_over = _entry(_funding(cost=2000001), "pmegp")
    assert just_over["limit_applied"] is True
    assert _case(just_over, "general")["subsidy_amount"] == 500000


def test_pmegp_says_how_far_short_of_the_own_money_the_reader_is():
    # ₹10,000 in hand against 40,000 (general) and 20,000 (special) required.
    entry = _entry(_funding(capital=10000), "pmegp")

    assert _case(entry, "general")["own_short_by"] == 30000
    assert _case(entry, "special")["own_short_by"] == 10000

    # Exactly enough is not short.
    exact = _entry(_funding(capital=40000), "pmegp")
    assert _case(exact, "general")["own_short_by"] == 0
    assert _case(exact, "special")["own_short_by"] == 0


def test_pmfme_figures_by_hand():
    # ₹4,00,000: own 10% = 40,000, subsidy 35% = 1,40,000, bank 3,60,000, to
    # repay after the subsidy 2,20,000.
    entry = _entry(_funding(matched=("pmfme",)), "pmfme")

    assert entry["kind"] == "subsidy"
    assert entry["terms"] == "mofpi_2021"
    assert entry["limit_kind"] == "subsidy"
    assert entry["limit"] == 1000000
    assert entry["limit_applied"] is False
    assert entry["cases"] == [
        {
            "code": "all",
            "own_percent": 10,
            "own_amount": 40000,
            "own_short_by": 0,
            "subsidy_percent": 35,
            "subsidy_amount": 140000,
            "bank_amount": 360000,
            "net_loan_amount": 220000,
        }
    ]


def test_pmfme_subsidy_stops_at_ten_lakh():
    # 35% of ₹40 lakh is ₹14 lakh; the ceiling is ₹10 lakh a unit.
    entry = _entry(_funding(cost=4000000, matched=("pmfme",)), "pmfme")
    case = _case(entry, "all")

    assert entry["limit_applied"] is True
    assert case["subsidy_amount"] == 1000000
    assert case["own_amount"] == 400000
    assert case["bank_amount"] == 3600000
    assert case["net_loan_amount"] == 2600000

    # ₹28 lakh gives 9,80,000: under the ceiling, so not applied.
    below = _entry(_funding(cost=2800000, matched=("pmfme",)), "pmfme")
    assert below["limit_applied"] is False
    assert _case(below, "all")["subsidy_amount"] == 980000


@pytest.mark.parametrize(
    ("gap", "band", "band_limit"),
    [
        (1, "shishu", 50000),
        (50000, "shishu", 50000),
        (50001, "kishore", 500000),
        (500000, "kishore", 500000),
        (500001, "tarun", 1000000),
        (1000000, "tarun", 1000000),
        (1000001, "tarun_plus", 2000000),
        (2000000, "tarun_plus", 2000000),
        (2000001, "above_limit", 2000000),
    ],
)
def test_mudra_band_follows_the_loan_needed_at_every_boundary(gap, band, band_limit):
    # The loan a Mudra borrower needs is the funding gap: the cost less the money
    # in hand. Cost is capital + gap here so the gap is exactly the figure tested.
    capital = 100
    entry = _entry(_funding(cost=capital + gap, capital=capital, matched=("pmmy",)), "pmmy")

    assert entry["kind"] == "loan_band"
    assert entry["terms"] == "dfs_2026"
    assert entry["loan_amount"] == gap
    assert entry["band"] == band
    assert entry["band_limit"] == band_limit


def test_mudra_with_no_gap_needs_no_loan():
    entry = _entry(_funding(cost=50000, capital=50000, matched=("pmmy",)), "pmmy")

    assert entry["loan_amount"] == 0
    assert entry["band"] == "none"
    assert entry["band_limit"] is None


def test_only_the_matched_schemes_are_listed_and_in_the_order_given():
    result = _funding(matched=("pmmy", "pmegp", "pmfme"))
    assert [e["scheme_id"] for e in result["schemes"]] == ["pmmy", "pmegp", "pmfme"]

    result = _funding(matched=("pmfme", "standupindia", "nlm", "pmegp"))
    assert [e["scheme_id"] for e in result["schemes"]] == ["pmfme", "pmegp"]


def test_the_list_it_was_given_is_left_alone():
    matched = ["pmmy", "nlm", "pmegp"]
    build_scheme_funding(400000, 100000, "rural", matched)

    assert matched == ["pmmy", "nlm", "pmegp"]


def test_the_top_level_figures_echo_what_was_priced():
    result = _funding(cost=400000, capital=100000)

    assert result["status"] == "ok"
    assert result["project_cost"] == 400000
    assert result["money_in_hand"] == 100000
    assert result["funding_gap"] == 300000


def test_more_money_in_hand_than_the_cost_leaves_no_gap():
    result = _funding(cost=100000, capital=250000, matched=("pmegp", "pmmy"))

    assert result["funding_gap"] == 0
    assert _entry(result, "pmmy")["loan_amount"] == 0


def test_no_project_cost_means_nothing_to_structure():
    for cost in (0, -1):
        result = _funding(cost=cost, matched=("pmegp", "pmfme", "pmmy"))

        assert result["status"] == "no_project_cost"
        assert result["schemes"] == []


def test_a_reader_matched_to_none_of_the_three_schemes_gets_an_empty_list():
    result = _funding(matched=("standupindia", "nlm"))

    assert result["status"] == "no_scheme"
    assert result["schemes"] == []
    assert result["project_cost"] == 400000


def _analysis(**overrides):
    answers = dict(
        business_category="tailoring",
        state="Uttar Pradesh",
        available_capital=50000,
        monthly_expenses=30000,
        expected_monthly_revenue=60000,
        monthly_emi=0,
        initial_investment=150000,
        monthly_operating_expenses=30000,
    )
    answers.update(overrides)
    return run_unified_analysis(**answers)


def test_a_real_tailoring_request_is_priced_for_pmegp_and_mudra():
    result = _analysis()

    section = result["scheme_funding"]
    matched = {m["scheme_id"] for m in result["scheme_matches"]}
    assert section["status"] == "ok"
    assert section["project_cost"] == 150000
    assert section["money_in_hand"] == 50000
    assert section["funding_gap"] == result["financial_analysis"]["funding_gap"] == 100000
    assert {e["scheme_id"] for e in section["schemes"]} == {"pmegp", "pmmy"}
    assert {"pmegp", "pmmy"} <= matched

    # Rural, ₹1,50,000 project: general subsidy 25% = 37,500, own 15,000.
    pmegp = _entry(section, "pmegp")
    assert _case(pmegp, "general")["subsidy_amount"] == 37500
    assert _case(pmegp, "general")["own_amount"] == 15000
    # A ₹1,00,000 gap is a Kishore loan.
    assert _entry(section, "pmmy")["band"] == "kishore"


def test_the_place_the_reader_picked_decides_the_pmegp_rate():
    rural = _entry(_analysis(location_type="rural")["scheme_funding"], "pmegp")
    urban = _entry(_analysis(location_type="urban")["scheme_funding"], "pmegp")

    assert _case(rural, "general")["subsidy_amount"] == 37500
    assert _case(urban, "general")["subsidy_amount"] == 22500


def test_a_real_food_processing_request_is_priced_for_pmfme():
    section = _analysis(business_category="food processing")["scheme_funding"]

    pmfme = _entry(section, "pmfme")
    assert _case(pmfme, "all")["subsidy_amount"] == 52500
    assert _case(pmfme, "all")["own_amount"] == 15000


def test_a_request_that_matches_none_of_the_three_schemes_reaches_no_scheme():
    # Plain agriculture maps to no scheme of the three.
    result = _analysis(business_category="agriculture")

    assert not {"pmegp", "pmfme", "pmmy"} & {m["scheme_id"] for m in result["scheme_matches"]}
    assert result["scheme_funding"]["status"] == "no_scheme"


def test_a_real_request_with_nothing_to_invest_reaches_no_project_cost():
    result = _analysis(initial_investment=0, available_capital=0)

    assert result["scheme_funding"]["status"] == "no_project_cost"
    assert result["scheme_funding"]["schemes"] == []


def _finite_and_not_negative(value):
    if isinstance(value, bool) or value is None or isinstance(value, str):
        return
    if isinstance(value, (int, float)):
        assert math.isfinite(value) and value >= 0, value
    elif isinstance(value, dict):
        for item in value.values():
            _finite_and_not_negative(item)
    elif isinstance(value, list):
        for item in value:
            _finite_and_not_negative(item)


def _check_funding(result, request_cost, request_capital):
    gap = max(request_cost - request_capital, 0)
    assert result["project_cost"] == request_cost
    assert result["money_in_hand"] == request_capital
    assert result["funding_gap"] == gap
    _finite_and_not_negative(result)
    json.dumps(result)

    for entry in result["schemes"]:
        if entry["kind"] == "loan_band":
            assert entry["loan_amount"] == gap
            continue
        for case in entry["cases"]:
            assert case["own_amount"] + case["bank_amount"] == pytest.approx(request_cost, abs=0.01)
            assert case["subsidy_amount"] <= case["bank_amount"]
            assert case["net_loan_amount"] == pytest.approx(
                case["bank_amount"] - case["subsidy_amount"], abs=0.01
            )
            assert case["own_short_by"] == pytest.approx(
                max(case["own_amount"] - request_capital, 0), abs=0.01
            )
            assert case["net_loan_amount"] > 0


def test_every_result_in_a_sweep_of_real_requests_adds_up():
    seen = set()
    for category in ("tailoring", "food processing", "agriculture", "retail", "dairy"):
        for investment in (0, 50000, 400000, 3000000, 6000000):
            for capital in (0, 40000, 400000, 7000000):
                for location in ("rural", "semi-urban", "urban"):
                    result = _analysis(
                        business_category=category,
                        initial_investment=investment,
                        available_capital=capital,
                        location_type=location,
                    )
                    section = result["scheme_funding"]
                    _check_funding(section, investment, capital)
                    seen.add(section["status"])
                    if section["status"] == "ok":
                        seen.add(tuple(sorted(e["scheme_id"] for e in section["schemes"])))

    # A branch no real request can reach is a branch nobody has tested.
    assert {"ok", "no_project_cost", "no_scheme"} <= seen
    assert ("pmegp", "pmmy") in seen
    assert any("pmfme" in item for item in seen if isinstance(item, tuple))


def test_the_funding_structure_reaches_the_client_through_the_response_model():
    # A typed response_model drops any key it does not declare, silently.
    response = TestClient(app).post(
        "/api/analysis/run",
        json={
            "business_category": "tailoring",
            "state": "Uttar Pradesh",
            "available_capital": 50000,
            "monthly_expenses": 30000,
            "expected_monthly_revenue": 60000,
            "monthly_emi": 0,
            "initial_investment": 150000,
            "monthly_operating_expenses": 30000,
        },
    )

    assert response.status_code == 200
    section = response.json()["scheme_funding"]
    assert section["status"] == "ok"
    assert section["funding_gap"] == 100000
    pmegp = _entry(section, "pmegp")
    assert _case(pmegp, "general")["subsidy_amount"] == 37500
    assert set(_case(pmegp, "general")) == {
        "code",
        "own_percent",
        "own_amount",
        "own_short_by",
        "subsidy_percent",
        "subsidy_amount",
        "bank_amount",
        "net_loan_amount",
    }
