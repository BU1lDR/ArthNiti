from fastapi.testclient import TestClient

from app.main import app
from app.services.analysis_service import run_unified_analysis
from app.services.options_service import build_financing_options
from app.services.risk_service import (
    calculate_repayment_pressure,
    estimate_monthly_repayment,
)

# The loan sizes below were worked out with the textbook instalment formula
# written out by hand, not by calling the code under test: ₹50,000 at 12% a year
# costs 4442, 2354, 1661 and 1112 a month over 12, 24, 36 and 60 months.


def _by_code(result):
    return {option["code"]: option for option in result["options"]}


def _loans(result):
    return [option["loan_amount"] for option in result["options"]]


def test_no_funding_gap_means_nothing_to_finance():
    result = build_financing_options(monthly_surplus=30000, monthly_emi=0, funding_gap=0)

    assert result["status"] == "no_gap"
    assert result["options"] == []
    assert result["recommended_by_rules"] is None


def test_without_a_surplus_there_is_nothing_to_repay_a_loan_from():
    for surplus in (0, -500):
        result = build_financing_options(
            monthly_surplus=surplus, monthly_emi=0, funding_gap=50000
        )

        assert result["status"] == "no_surplus"
        assert result["options"] == []


def test_a_household_already_over_the_limit_is_offered_no_loan():
    # ₹6,000 of EMI is 60% of a ₹10,000 household income, over the 50% cap,
    # though it is only 15% of the ₹40,000 surplus, which alone would pass.
    result = build_financing_options(
        monthly_surplus=40000,
        monthly_emi=6000,
        funding_gap=50000,
        household_monthly_income=10000,
    )

    assert result["status"] == "household_over_limit"
    assert result["options"] == []


def test_a_surplus_already_spoken_for_leaves_no_room_for_a_loan():
    # ₹3,500 of EMI against ₹10,000 is 35%: moderate before any new loan.
    result = build_financing_options(monthly_surplus=10000, monthly_emi=3500, funding_gap=50000)

    assert result["status"] == "no_room"
    assert result["options"] == []


def test_a_household_with_no_income_can_carry_no_new_loan():
    # An income of 0 is an answer, not a blank: any repayment is over half of it.
    result = build_financing_options(
        monthly_surplus=40000,
        monthly_emi=0,
        funding_gap=50000,
        household_monthly_income=0,
    )

    assert result["status"] == "no_room"
    assert result["options"] == []


def test_a_gap_the_surplus_can_carry_is_covered_at_every_tenure():
    result = build_financing_options(monthly_surplus=40000, monthly_emi=0, funding_gap=50000)

    assert result["status"] == "covered"
    options = _by_code(result)
    assert list(options) == ["term_12", "term_24", "term_36", "term_60"]
    assert [o["monthly_repayment"] for o in options.values()] == [4442, 2354, 1661, 1112]
    assert all(o["loan_amount"] == 50000 for o in options.values())
    assert all(o["remaining_gap"] == 0 for o in options.values())
    # Every option is safe, so the cheapest is the one that is paid off soonest.
    assert result["recommended_by_rules"] == "term_12"
    assert options["term_12"]["total_interest"] == 4442 * 12 - 50000


def test_the_loan_is_capped_at_the_largest_amount_that_keeps_repayment_low():
    # ₹2,000 of EMI plus the new loan must stay under 30% of a ₹12,000 surplus.
    result = build_financing_options(monthly_surplus=12000, monthly_emi=2000, funding_gap=150000)

    assert result["status"] == "partial"
    assert _loans(result) == [18000, 33000, 48000, 71000]
    for option in result["options"]:
        assert option["risk_level"] == "low"
        assert option["remaining_gap"] == 150000 - option["loan_amount"]
        # One more step of ₹1,000 would no longer be low: the cap is the largest.
        one_more = calculate_repayment_pressure(
            12000, 2000, option["loan_amount"] + 1000, None, 12, option["tenure_months"]
        )
        assert one_more["risk_level"] != "low"
    # No option covers the gap, so the rules do not recommend one.
    assert result["recommended_by_rules"] is None


def test_the_household_limit_can_bind_before_the_pressure_does():
    # ₹5,000 is half of a ₹10,000 household income but 10% of a ₹50,000 surplus.
    result = build_financing_options(
        monthly_surplus=50000,
        monthly_emi=1000,
        funding_gap=300000,
        household_monthly_income=10000,
    )

    assert result["status"] == "partial"
    assert result["household_checked"] is True
    assert _loans(result) == [45000, 84000, 120000, 179000]
    for option in result["options"]:
        assert option["household_check"] == "within_limit"
        assert option["household_repayment_percent"] <= 50
        assert option["pressure_ratio_percent"] <= 10


def test_a_loan_just_short_of_the_gap_rounds_down_to_the_last_whole_thousand():
    # Over 12 months ₹50,000 costs 4442 a month, 29.81% of this surplus and low;
    # ₹50,500 costs 4487, 30.11% and moderate. So 12 months can carry ₹50,000 of
    # the gap, not ₹49,000, and the ₹500 left over is reported, not dropped.
    result = build_financing_options(monthly_surplus=14900, monthly_emi=0, funding_gap=50500)

    options = _by_code(result)
    assert options["term_12"]["loan_amount"] == 50000
    assert options["term_12"]["remaining_gap"] == 500
    assert options["term_24"]["loan_amount"] == 50500
    assert result["status"] == "covered"
    assert result["recommended_by_rules"] == "term_24"


def test_a_gap_that_is_not_a_round_number_is_covered_to_the_rupee():
    result = build_financing_options(monthly_surplus=40000, monthly_emi=0, funding_gap=48750)

    assert result["status"] == "covered"
    assert _loans(result) == [48750, 48750, 48750, 48750]


def test_a_household_over_its_cap_is_told_so_before_the_room_is_counted():
    # Both are true here: ₹6,000 of EMI is 60% of the ₹10,000 surplus (high) and
    # 60% of the ₹10,000 household income (over the cap). The household cap is
    # the one a lender enforces, so it is the one the person reads first.
    result = build_financing_options(
        monthly_surplus=10000,
        monthly_emi=6000,
        funding_gap=50000,
        household_monthly_income=10000,
    )

    assert result["status"] == "household_over_limit"


def test_a_gap_of_a_few_rupees_never_shows_negative_interest():
    # The instalment is rounded to whole rupees, and on ₹5 that rounds to 0.
    result = build_financing_options(monthly_surplus=40000, monthly_emi=0, funding_gap=5)

    option = _by_code(result)["term_12"]
    assert option["monthly_repayment"] == 0
    assert option["total_interest"] == 0


def test_a_household_income_that_was_not_given_is_not_checked():
    result = build_financing_options(monthly_surplus=40000, monthly_emi=0, funding_gap=50000)

    assert result["household_checked"] is False
    for option in result["options"]:
        assert option["household_check"] == "not_checked"
        assert option["household_repayment_percent"] is None


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


def test_the_sixty_month_option_is_the_loan_the_main_analysis_already_prices():
    # The analysis prices the gap at 12% over 60 months. The option for 60 months
    # has to be that same loan, or the page would show two answers to one question.
    result = _analysis()

    risk = result["risk_analysis"]
    option = _by_code(result["financing_options"])["term_60"]
    assert option["loan_amount"] == result["financial_analysis"]["funding_gap"] == 100000
    assert option["monthly_repayment"] == risk["estimated_new_emi"]
    assert option["pressure_ratio_percent"] == risk["pressure_ratio_percent"]
    assert option["risk_level"] == risk["risk_level"]


def test_every_option_in_a_sweep_of_real_requests_is_safe_and_consistent():
    seen = set()
    for capital in (0, 20000, 100000, 600000):
        for investment in (50000, 200000, 500000):
            for revenue, expenses in ((60000, 45000), (30000, 20000), (15000, 14000), (10000, 12000)):
                for emi in (0, 2500):
                    for income in (None, 0, 8000, 25000):
                        result = _analysis(
                            available_capital=capital,
                            initial_investment=investment,
                            expected_monthly_revenue=revenue,
                            monthly_expenses=expenses,
                            monthly_operating_expenses=expenses,
                            monthly_emi=emi,
                            household_monthly_income=income,
                        )
                        _check_options(result)
                        seen.add(result["financing_options"]["status"])

    # A branch no real request can reach is a branch nobody has tested.
    assert seen == {
        "no_gap",
        "no_surplus",
        "household_over_limit",
        "no_room",
        "covered",
        "partial",
    }


def _check_options(result):
    gap = result["financial_analysis"]["funding_gap"]
    section = result["financing_options"]
    options = section["options"]

    assert section["funding_gap"] == gap
    assert section["household_checked"] == (
        result["risk_analysis"]["household_monthly_income"] is not None
    )
    assert (section["status"] in ("covered", "partial")) == bool(options)

    for option in options:
        loan = option["loan_amount"]
        assert option["risk_level"] == "low"
        assert option["household_check"] != "over_limit"
        assert 0 < loan <= gap
        assert loan % 1000 == 0 or loan == gap
        assert option["remaining_gap"] == round(gap - loan, 2) >= 0
        assert option["monthly_repayment"] == estimate_monthly_repayment(
            loan, 12, option["tenure_months"]
        )
        assert option["total_interest"] >= 0

    # A longer tenure never allows a smaller loan.
    loans = [o["loan_amount"] for o in options]
    assert loans == sorted(loans)

    # The recommendation is the shortest option that covers the whole gap.
    covering = [o["code"] for o in options if o["remaining_gap"] == 0]
    assert (section["status"] == "covered") == bool(covering)
    assert section["recommended_by_rules"] == (covering[0] if covering else None)


def test_the_financing_options_reach_the_client_through_the_response_model():
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
    section = response.json()["financing_options"]
    assert section["status"] == "covered"
    assert [o["code"] for o in section["options"]] == ["term_12", "term_24", "term_36", "term_60"]
