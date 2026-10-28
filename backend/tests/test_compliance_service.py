import copy
import json
import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.analysis_service import run_unified_analysis
from app.services.compliance_service import build_compliance

# Every limit below was read from the published text, not from the code:
#   FSSAI  Food Safety and Standards (Licensing and Registration of Food
#          Businesses) Regulations, 2011, reg. 1.2.1(4) and 2.1.1(1), as compiled
#          in the FSSAI compendium of 9 Nov 2017. A petty food business has an
#          annual turnover "not exceeding Rs 12 lakhs" and/or makes no more than
#          100 kg or litres a day (milk: 500 litres a day). It registers; a larger
#          one holds a licence. A milk producer who is a registered member of a
#          dairy cooperative society and sells all the milk to it is exempt.
#   GST    CBIC booklet "GST: An Update", 1 June 2019. Registration is mandatory
#          "only if the turnover exceeds" Rs.40 lakh for goods (Rs.20 lakh in
#          Arunachal Pradesh, Manipur, Meghalaya, Mizoram, Nagaland, Puducherry,
#          Sikkim, Telangana, Tripura and Uttarakhand) and Rs.20 lakh for
#          services (Rs.10 lakh in Manipur, Mizoram, Nagaland and Tripura).
#   Udyam  Udyam Registration portal, read 28 Oct 2026: free, uses the Aadhaar
#          number, PAN, and the GST number where it applies.
# "Exceeds" and "not exceeding" decide the boundary: exactly the limit is within it.

GOODS_LOWER_STATES = [
    "Arunachal Pradesh",
    "Manipur",
    "Meghalaya",
    "Mizoram",
    "Nagaland",
    "Puducherry",
    "Sikkim",
    "Telangana",
    "Tripura",
    "Uttarakhand",
]
SERVICES_LOWER_STATES = ["Manipur", "Mizoram", "Nagaland", "Tripura"]
UDYAM_CODE = "elig.common.udyamNeeded"
NEEDS = {"usually", "depends", "not_needed", "free", "ask"}

LOCATIONS_JS = Path(__file__).resolve().parents[2] / "frontend/src/data/indiaLocations.js"


def _frontend_states():
    return re.findall(r"^\s+name: '([^']+)',$", LOCATIONS_JS.read_text(encoding="utf-8"), re.M)


def _compliance(category="food processing", state="Uttar Pradesh", sales=600000, location="rural", matches=()):
    return build_compliance(
        business_category=category,
        state=state,
        location_type=location,
        yearly_sales=sales,
        scheme_matches=list(matches),
    )


def _step(result, step_id):
    return next(step for step in result["steps"] if step["id"] == step_id)


def _fssai(**kwargs):
    return _step(_compliance(**kwargs), "fssai")


def _gst(category, state="Uttar Pradesh", sales=600000):
    return _step(_compliance(category=category, state=state, sales=sales), "gst")


def test_the_steps_come_in_a_fixed_order_and_each_names_its_source():
    result = _compliance()

    assert result["yearly_sales"] == 600000
    assert [step["id"] for step in result["steps"]] == ["udyam", "local", "fssai", "gst"]
    assert {step["id"]: step["source"] for step in result["steps"]} == {
        "udyam": "udyam_2026",
        "local": None,
        "fssai": "fssai_2017",
        "gst": "cbic_2019",
    }


def test_fssai_is_a_registration_up_to_twelve_lakh_and_a_licence_above():
    # "annual turnover not exceeding Rs 12 lakhs": exactly 12,00,000 is still within.
    within = _fssai(sales=1_200_000)
    above = _fssai(sales=1_200_001)

    assert (within["need"], within["kind"]) == ("usually", "registration")
    assert (above["need"], above["kind"]) == ("usually", "licence")
    assert within["sales_limit"] == above["sales_limit"] == 1_200_000
    assert (within["food_per_day"], within["milk_per_day"]) == (100, 500)


@pytest.mark.parametrize("category", ["food processing", "dairy"])
def test_fssai_is_usually_needed_for_the_two_food_buttons(category):
    assert _fssai(category=category)["need"] == "usually"


@pytest.mark.parametrize("category", ["handicrafts", "tailoring"])
def test_fssai_is_not_needed_for_a_business_that_is_not_food(category):
    step = _fssai(category=category, sales=5_000_000)

    assert step["need"] == "not_needed"
    assert step["kind"] is None


@pytest.mark.parametrize(
    "category", ["retail", "agriculture", "poultry", "services", "manufacturing", "other", "बुनाई"]
)
def test_fssai_depends_when_the_business_may_or_may_not_handle_food(category):
    step = _fssai(category=category)

    assert step["need"] == "depends"
    assert step["kind"] == "registration"


@pytest.mark.parametrize("phrase", ["Sweet shop", "tea stall", "  Tiffin   service ", "BAKERY", "milk vendor"])
def test_a_typed_phrase_with_a_food_word_is_a_food_business(phrase):
    assert _fssai(category=phrase)["need"] == "usually"


@pytest.mark.parametrize("phrase", ["steam laundry", "seafood", "tailoring and tea"])
def test_a_food_word_has_to_be_a_whole_word_and_a_non_food_business_stays_that_way(phrase):
    # "steam" holds "tea" and "seafood" holds "food": neither is a food word.
    # "tailoring and tea" does hold one, and a food word wins over the rest.
    expected = "usually" if phrase == "tailoring and tea" else "depends"
    assert _fssai(category=phrase)["need"] == expected


def test_only_a_milk_business_gets_the_dairy_cooperative_note():
    assert _fssai(category="dairy")["dairy_exemption"] is True
    assert _fssai(category="milk vendor")["dairy_exemption"] is True
    for category in ("food processing", "poultry", "retail", "tailoring"):
        assert _fssai(category=category)["dairy_exemption"] is False


def test_gst_in_an_ordinary_state_is_needed_only_above_forty_lakh_for_goods():
    within = _gst("retail", sales=4_000_000)
    above = _gst("retail", sales=4_000_001)

    assert (within["goods_limit"], within["services_limit"]) == (4_000_000, 2_000_000)
    assert (within["supply"], within["case"], within["need"], within["limit"]) == (
        "goods",
        "within",
        "not_needed",
        4_000_000,
    )
    assert (above["case"], above["need"], above["limit"]) == ("above", "usually", 4_000_000)


def test_gst_for_services_is_needed_only_above_twenty_lakh():
    within = _gst("services", sales=2_000_000)
    above = _gst("services", sales=2_000_001)

    assert (within["supply"], within["case"], within["limit"]) == ("services", "within", 2_000_000)
    assert (above["case"], above["need"], above["limit"]) == ("above", "usually", 2_000_000)


@pytest.mark.parametrize("state", GOODS_LOWER_STATES)
def test_gst_goods_limit_is_twenty_lakh_in_the_ten_named_states(state):
    within = _gst("retail", state=state, sales=2_000_000)
    above = _gst("retail", state=state, sales=2_000_001)

    assert within["goods_limit"] == 2_000_000
    assert (within["case"], within["limit"]) == ("within", 2_000_000)
    assert above["case"] == "above"


@pytest.mark.parametrize("state", SERVICES_LOWER_STATES)
def test_gst_services_limit_is_ten_lakh_in_the_four_named_states(state):
    within = _gst("services", state=state, sales=1_000_000)
    above = _gst("services", state=state, sales=1_000_001)

    assert within["services_limit"] == 1_000_000
    assert (within["case"], within["limit"]) == ("within", 1_000_000)
    assert above["case"] == "above"


def test_every_state_in_the_dropdown_gets_the_limits_the_booklet_gives_it():
    states = _frontend_states()
    assert len(states) == 36
    # The booklet's spelling has to be the dropdown's spelling, or a limit is silently missed.
    assert set(GOODS_LOWER_STATES) <= set(states)
    assert set(SERVICES_LOWER_STATES) <= set(states)

    for state in states:
        step = _gst("retail", state=state)
        assert step["goods_limit"] == (2_000_000 if state in GOODS_LOWER_STATES else 4_000_000), state
        assert step["services_limit"] == (1_000_000 if state in SERVICES_LOWER_STATES else 2_000_000), state


def test_a_state_name_is_matched_without_regard_to_case_or_spaces():
    assert _gst("retail", state="  uttarakhand ")["goods_limit"] == 2_000_000
    assert _gst("retail", state="Atlantis")["goods_limit"] == 4_000_000


def test_a_business_that_may_sell_goods_or_services_is_judged_against_both_limits():
    # Tailoring stitches cloth (a service) and sells garments (goods). In UP the
    # limits are 20 lakh (services) and 40 lakh (goods).
    within = _gst("tailoring", sales=2_000_000)
    between_low = _gst("tailoring", sales=2_000_001)
    between_high = _gst("tailoring", sales=4_000_000)
    above = _gst("tailoring", sales=4_000_001)

    assert (within["supply"], within["case"], within["need"], within["limit"]) == (
        "mixed",
        "within",
        "not_needed",
        2_000_000,
    )
    assert (between_low["case"], between_low["need"]) == ("between", "depends")
    assert between_high["case"] == "between"
    assert (above["case"], above["need"], above["limit"]) == ("above", "usually", 4_000_000)


def test_where_both_limits_are_the_same_there_is_no_between():
    # Telangana: goods and services are both 20 lakh.
    assert _gst("tailoring", state="Telangana", sales=2_000_000)["case"] == "within"
    assert _gst("tailoring", state="Telangana", sales=2_000_001)["case"] == "above"


@pytest.mark.parametrize("category", ["other", "some new trade", "बुनाई", "retail services", "retail tailoring"])
def test_an_unknown_or_mixed_business_is_treated_as_goods_and_services(category):
    assert _gst(category)["supply"] == "mixed"


@pytest.mark.parametrize(
    ("category", "supply"),
    [
        ("retail", "goods"),
        ("food processing", "goods"),
        ("handicrafts", "goods"),
        ("agriculture", "goods"),
        ("dairy", "goods"),
        ("poultry", "goods"),
        ("manufacturing", "goods"),
        ("services", "services"),
        ("Beauty SERVICES", "services"),
        ("tailoring", "mixed"),
    ],
)
def test_each_category_button_has_one_supply_kind(category, supply):
    assert _gst(category)["supply"] == supply


@pytest.mark.parametrize("category", ["agriculture", "dairy", "poultry"])
def test_a_farm_business_above_the_limit_is_told_to_ask_and_not_that_it_must_register(category):
    above = _gst(category, sales=4_000_001)
    within = _gst(category, sales=4_000_000)

    assert above["farm"] is True
    assert (above["case"], above["need"], above["limit"]) == ("farm_above", "depends", 4_000_000)
    assert (within["case"], within["need"]) == ("within", "not_needed")


def test_a_shop_or_a_workshop_is_not_a_farm():
    for category in ("retail", "food processing", "manufacturing", "dairy services"):
        assert _gst(category, sales=9_000_000)["farm"] is False


def test_udyam_is_always_listed_as_free_and_counts_the_schemes_that_require_it():
    matches = [
        {"eligibility_codes": [UDYAM_CODE, "elig.other"]},
        {"eligibility_codes": ["elig.other"]},
        {"eligibility_codes": [UDYAM_CODE]},
    ]

    none = _step(_compliance(), "udyam")
    some = _step(_compliance(matches=matches), "udyam")

    assert (none["need"], none["schemes_requiring"]) == ("free", 0)
    assert (some["need"], some["schemes_requiring"]) == ("free", 2)


@pytest.mark.parametrize(
    ("location", "place"), [("rural", "panchayat"), ("semi-urban", "urban_body"), ("urban", "urban_body")]
)
def test_the_local_office_depends_on_where_the_business_is(location, place):
    step = _step(_compliance(location=location), "local")

    assert (step["need"], step["place"]) == ("ask", place)


def test_building_the_checklist_changes_nothing_it_was_given():
    matches = [{"eligibility_codes": [UDYAM_CODE], "name": "x"}]
    before = copy.deepcopy(matches)

    _compliance(matches=matches)

    assert matches == before


def _analysis(**overrides):
    answers = dict(
        business_category="food processing",
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


def test_a_real_request_turns_monthly_sales_into_yearly_sales_for_the_limits():
    # ₹1,00,000 a month is exactly ₹12,00,000 a year: a registration. One rupee
    # more a month is ₹12,12 more a year: a licence.
    at = _analysis(expected_monthly_revenue=100000)["compliance"]
    over = _analysis(expected_monthly_revenue=100001)["compliance"]

    assert at["yearly_sales"] == 1_200_000
    assert _step(at, "fssai")["kind"] == "registration"
    assert over["yearly_sales"] == 1_200_012
    assert _step(over, "fssai")["kind"] == "licence"


def test_a_real_request_counts_the_udyam_schemes_it_was_actually_shown():
    result = _analysis(business_category="handicrafts", state="Kerala", location_type="rural")
    shown = sum(UDYAM_CODE in match["eligibility_codes"] for match in result["scheme_matches"])

    # A branch no real request can reach is a branch nobody has tested.
    assert shown > 0
    assert _step(result["compliance"], "udyam")["schemes_requiring"] == shown
    assert _step(_analysis(state="Uttar Pradesh")["compliance"], "udyam")["schemes_requiring"] == 0


def test_every_result_in_a_sweep_of_real_requests_has_the_same_shape():
    seen_cases = set()
    seen_kinds = set()
    for category in ("tailoring", "food processing", "agriculture", "retail", "dairy", "services", "other"):
        for state in ("Uttar Pradesh", "Telangana", "Manipur", "Kerala"):
            for revenue in (0, 50000, 100000, 100001, 170000, 400000):
                for location in ("rural", "semi-urban", "urban"):
                    result = _analysis(
                        business_category=category,
                        state=state,
                        expected_monthly_revenue=revenue,
                        location_type=location,
                    )["compliance"]

                    json.dumps(result)
                    assert [step["id"] for step in result["steps"]] == ["udyam", "local", "fssai", "gst"]
                    assert all(step["need"] in NEEDS for step in result["steps"])
                    assert result["yearly_sales"] == revenue * 12
                    gst = _step(result, "gst")
                    seen_cases.add(gst["case"])
                    seen_kinds.add(_step(result, "fssai")["kind"])

    assert seen_cases == {"within", "above", "between", "farm_above"}
    assert seen_kinds == {None, "registration", "licence"}


def test_the_checklist_reaches_the_client_through_the_response_model():
    # A typed response_model drops any key it does not declare, silently.
    response = TestClient(app).post(
        "/api/analysis/run",
        json={
            "business_category": "food processing",
            "state": "Uttar Pradesh",
            "available_capital": 50000,
            "monthly_expenses": 30000,
            "expected_monthly_revenue": 100001,
            "monthly_emi": 0,
            "initial_investment": 150000,
            "monthly_operating_expenses": 30000,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 10
    section = body["compliance"]
    assert section["yearly_sales"] == 1_200_012
    assert _step(section, "fssai")["kind"] == "licence"
    assert set(_step(section, "gst")) == {
        "id",
        "need",
        "source",
        "state",
        "supply",
        "goods_limit",
        "services_limit",
        "limit",
        "farm",
        "case",
    }
