"""The household-income check: loan repayments against half of household income.

The repayment-pressure figure divides repayments by the BUSINESS surplus, built
on expected revenue. RBI's microfinance directions test something else: a
lender's board-approved policy must cap a household's monthly loan repayments,
all of its loans plus the proposed one, at 50% of its monthly household income
(paras 5.1 and 5.2), assessed from past income (Annex I). So a reader could see
"low" pressure for a household that fails the lender's own test. These tests pin
the check that closes that, and the advice that follows from it.
"""

from itertools import product

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.advisory_service import generate_advice
from app.services.analysis_service import run_unified_analysis
from app.services.mvp_service import build_mvp_summary
from app.services.risk_service import (
    HOUSEHOLD_REPAYMENT_LIMIT_PERCENT,
    MICROFINANCE_ANNUAL_INCOME_LIMIT,
    calculate_repayment_pressure,
    estimate_monthly_repayment,
)


client = TestClient(app)


HOUSEHOLD_KEYS = {
    "household_monthly_income",
    "household_repayment_percent",
    "household_check",
    "household_check_without_new_loan",
    "household_limit_percent",
    "household_microfinance_income_limit",
    "household_in_microfinance_range",
    "household_reason",
    "household_reason_code",
}

CHECKS = {"not_checked", "within_limit", "over_limit"}

REASONS = {
    "within_limit": (
        "Loan repayments are no more than half of the household's monthly income.",
        "rsn.householdWithin",
    ),
    "over_limit": (
        "Loan repayments are more than half of the household's monthly income.",
        "rsn.householdOver",
    ),
    "not_checked": (
        "Household income was not given, so loan repayments were not checked against it.",
        "rsn.householdNotChecked",
    ),
}


# --- risk_service -----------------------------------------------------------


def test_the_limits_are_the_rbi_figures():
    assert HOUSEHOLD_REPAYMENT_LIMIT_PERCENT == 50
    assert MICROFINANCE_ANNUAL_INCOME_LIMIT == 300000

    result = calculate_repayment_pressure(20000, 2000, household_monthly_income=10000)

    assert result["household_limit_percent"] == 50
    assert result["household_microfinance_income_limit"] == 300000


@pytest.mark.parametrize("surplus", [20000, 0, -5000])
@pytest.mark.parametrize("income", [None, 0, 10000])
def test_every_household_key_is_on_every_path(surplus, income):
    # Including the early return for a non-positive surplus: the frontend reads
    # these keys without guarding for their absence.
    result = calculate_repayment_pressure(surplus, 3000, household_monthly_income=income)

    assert HOUSEHOLD_KEYS <= set(result)
    assert result["household_check"] in CHECKS
    assert result["household_check_without_new_loan"] in CHECKS
    assert (result["household_reason"], result["household_reason_code"]) == REASONS[
        result["household_check"]
    ]


def test_the_check_does_not_depend_on_the_business_surplus():
    positive = calculate_repayment_pressure(20000, 6000, household_monthly_income=10000)
    negative = calculate_repayment_pressure(-5000, 6000, household_monthly_income=10000)

    # The surplus path still says what it always said.
    assert negative["pressure_ratio_percent"] is None
    assert negative["risk_level"] == "high"
    assert negative["reason_code"] == "rsn.noSurplus"

    for key in HOUSEHOLD_KEYS:
        assert negative[key] == positive[key], key

    assert negative["household_repayment_percent"] == 60.0
    assert negative["household_check"] == "over_limit"


def test_exactly_half_is_within_the_limit():
    result = calculate_repayment_pressure(20000, 5000, household_monthly_income=10000)

    assert result["household_repayment_percent"] == 50.0
    assert result["household_check"] == "within_limit"
    assert result["household_reason_code"] == "rsn.householdWithin"


def test_one_hundredth_of_a_percent_over_half_is_over_the_limit():
    result = calculate_repayment_pressure(20000, 5001, household_monthly_income=10000)

    assert result["household_repayment_percent"] == 50.01
    assert result["household_check"] == "over_limit"
    assert result["household_reason_code"] == "rsn.householdOver"


def test_a_raw_share_that_rounds_to_half_is_within_the_limit():
    # 5000.4 / 10000 is 50.004%, which prints as 50%. The verdict must come from
    # the printed figure, or the page would say "50%" beside "over the limit".
    result = calculate_repayment_pressure(20000, 5000.4, household_monthly_income=10000)

    assert (5000.4 / 10000) * 100 > 50
    assert result["household_repayment_percent"] == 50.0
    assert result["household_check"] == "within_limit"


@pytest.mark.parametrize("emi,gap", [(0, 0), (3000, 0), (0, 100000), (3000, 100000)])
def test_no_income_given_is_not_checked(emi, gap):
    result = calculate_repayment_pressure(
        20000, emi, funding_gap=gap, household_monthly_income=None
    )

    assert result["household_monthly_income"] is None
    assert result["household_repayment_percent"] is None
    assert result["household_check"] == "not_checked"
    assert result["household_check_without_new_loan"] == "not_checked"
    assert result["household_in_microfinance_range"] is None
    assert result["household_reason_code"] == "rsn.householdNotChecked"


def test_leaving_income_out_is_the_same_as_none():
    assert calculate_repayment_pressure(20000, 3000) == calculate_repayment_pressure(
        20000, 3000, household_monthly_income=None
    )


def test_zero_income_with_a_repayment_is_over_the_limit():
    result = calculate_repayment_pressure(20000, 3000, household_monthly_income=0)

    # There is no income to take a share of, so no percentage is printed.
    assert result["household_monthly_income"] == 0
    assert result["household_repayment_percent"] is None
    assert result["household_check"] == "over_limit"
    assert result["household_check_without_new_loan"] == "over_limit"
    assert result["household_in_microfinance_range"] is True


def test_zero_income_with_no_repayment_is_within_the_limit():
    result = calculate_repayment_pressure(20000, 0, household_monthly_income=0)

    assert result["total_monthly_emi"] == 0
    assert result["household_repayment_percent"] is None
    assert result["household_check"] == "within_limit"
    assert result["household_check_without_new_loan"] == "within_limit"


def test_zero_income_with_only_the_new_loan_is_over_because_of_it():
    result = calculate_repayment_pressure(
        20000, 0, funding_gap=50000, household_monthly_income=0
    )

    assert result["estimated_new_emi"] > 0
    assert result["household_check"] == "over_limit"
    assert result["household_check_without_new_loan"] == "within_limit"


@pytest.mark.parametrize(
    "income,expected",
    [
        (0, True),
        (25000, True),  # 25000 x 12 = 300000, the limit itself
        (25000.01, False),
        (30000, False),
    ],
)
def test_the_microfinance_range_is_three_lakh_a_year(income, expected):
    result = calculate_repayment_pressure(20000, 1000, household_monthly_income=income)

    assert result["household_in_microfinance_range"] is expected


def test_the_range_does_not_change_the_check():
    # The 50% test is reported whatever the income. Whether the RBI rule binds
    # the household is a separate fact, carried by household_in_microfinance_range.
    inside = calculate_repayment_pressure(40000, 15000, household_monthly_income=25000)
    outside = calculate_repayment_pressure(40000, 18000, household_monthly_income=30000)

    assert inside["household_in_microfinance_range"] is True
    assert outside["household_in_microfinance_range"] is False
    assert inside["household_check"] == outside["household_check"] == "over_limit"


def test_the_check_counts_the_new_loan_and_the_without_check_does_not():
    new_emi = estimate_monthly_repayment(200000)
    result = calculate_repayment_pressure(
        40000, 3000, funding_gap=200000, household_monthly_income=10000
    )

    assert result["estimated_new_emi"] == new_emi > 0
    assert result["household_repayment_percent"] == round(
        (3000 + new_emi) / 10000 * 100, 2
    )
    assert result["household_check"] == "over_limit"
    # 3000 of 10000 is 30%: the EMI already paid fits on its own.
    assert result["household_check_without_new_loan"] == "within_limit"


def test_the_without_check_is_over_when_the_current_emi_already_is():
    result = calculate_repayment_pressure(
        40000, 6000, funding_gap=200000, household_monthly_income=10000
    )

    assert result["household_check"] == "over_limit"
    assert result["household_check_without_new_loan"] == "over_limit"


def test_existing_debt_is_not_counted():
    # existing_debt is the principal of the loan whose repayment is monthly_emi,
    # so counting it would count one loan twice.
    common = dict(
        business_category="tailoring",
        state="Uttar Pradesh",
        available_capital=50000,
        monthly_expenses=15000,
        expected_monthly_revenue=30000,
        monthly_emi=2000,
        initial_investment=100000,
        monthly_operating_expenses=18000,
        household_monthly_income=10000,
    )
    without = run_unified_analysis(existing_debt=0, **common)["risk_analysis"]
    heavy = run_unified_analysis(existing_debt=500000, **common)["risk_analysis"]

    for key in HOUSEHOLD_KEYS:
        assert heavy[key] == without[key], key


# --- advisory_service -------------------------------------------------------


def _advice(**overrides):
    args = dict(
        financial_status="profitable",
        profit_margin_percent=50,
        available_capital=50000,
        funding_gap=0,
    )
    args.update(overrides)
    result = generate_advice(**args)

    # Codes and sentences are built in lockstep; index i of one is index i of
    # the other, or every later sentence gets the wrong translation.
    assert len(result["recommendations"]) == len(result["recommendation_codes"])
    return result


OVER_LIMIT_SENTENCE = (
    "Keep the household's total loan repayments to no more than half of its "
    "monthly income. Take a smaller loan, or none, until they fit."
)

ALREADY_OVER_SENTENCE = (
    "The loan payments your household already makes take more than half "
    "of its monthly income. Do not take a new loan until they are back to "
    "half or less."
)

HOUSEHOLD_ADVICE = {"adv.householdOverLimit", "adv.householdAlreadyOver"}


def test_over_the_limit_withholds_expansion_advice():
    result = _advice(household_check="over_limit")

    assert result["recommendation_codes"] == ["adv.householdOverLimit"]
    assert result["recommendations"] == [OVER_LIMIT_SENTENCE]


@pytest.mark.parametrize("check", ["not_checked", "within_limit"])
def test_not_checked_and_within_change_nothing(check):
    assert _advice(household_check=check) == _advice()
    assert _advice()["recommendation_codes"] == ["adv.maintainExpand", "adv.healthyMargin"]


def test_the_household_advice_follows_the_funding_gap_advice():
    result = _advice(
        household_check="over_limit", funding_gap=50000, available_capital=5000
    )

    assert result["recommendation_codes"] == [
        "adv.fundingGap",
        "adv.householdOverLimit",
        "adv.cashReserve",
    ]
    assert result["recommendations"][1] == OVER_LIMIT_SENTENCE


def test_a_loss_over_the_limit_is_told_both():
    result = _advice(
        financial_status="loss", profit_margin_percent=-20, household_check="over_limit"
    )

    assert result["recommendation_codes"] == [
        "adv.reduceExpenses",
        "adv.householdOverLimit",
        "adv.improveMargin",
    ]


def test_a_margin_that_could_not_be_computed_still_gets_the_household_advice():
    result = _advice(
        financial_status="loss", profit_margin_percent=None, household_check="over_limit"
    )

    assert result["recommendation_codes"] == [
        "adv.reduceExpenses",
        "adv.householdOverLimit",
    ]


def test_loans_already_over_the_limit_are_not_told_to_take_a_smaller_loan():
    # No size of new loan brings the total under the line when the loans the
    # household already repays are over it on their own.
    result = _advice(
        household_check="over_limit", household_check_without_new_loan="over_limit"
    )

    assert result["recommendation_codes"] == ["adv.householdAlreadyOver"]
    assert result["recommendations"] == [ALREADY_OVER_SENTENCE]


@pytest.mark.parametrize("without", ["within_limit", "not_checked"])
def test_an_over_caused_by_the_new_loan_keeps_the_smaller_loan_advice(without):
    result = _advice(household_check="over_limit", household_check_without_new_loan=without)

    assert result["recommendation_codes"] == ["adv.householdOverLimit"]
    assert result["recommendations"] == [OVER_LIMIT_SENTENCE]


def test_the_already_over_advice_follows_the_funding_gap_advice():
    result = _advice(
        household_check="over_limit",
        household_check_without_new_loan="over_limit",
        funding_gap=50000,
        available_capital=5000,
    )

    assert result["recommendation_codes"] == [
        "adv.fundingGap",
        "adv.householdAlreadyOver",
        "adv.cashReserve",
    ]
    assert result["recommendations"][1] == ALREADY_OVER_SENTENCE


@pytest.mark.parametrize("check", ["not_checked", "within_limit"])
def test_the_without_new_loan_check_alone_says_nothing(check):
    # The second check only chooses between the two sentences; on its own it
    # adds no advice, because the total is what the limit is about.
    assert _advice(
        household_check=check, household_check_without_new_loan="over_limit"
    ) == _advice(household_check=check)


def _pipeline(**overrides):
    payload = dict(
        business_category="tailoring",
        state="Uttar Pradesh",
        district="Lucknow",
        available_capital=50000,
        monthly_expenses=15000,
        expected_monthly_revenue=30000,
        monthly_emi=2000,
        initial_investment=100000,
        monthly_operating_expenses=18000,
    )
    payload.update(overrides)
    return run_unified_analysis(**payload)


def test_the_pipeline_tells_a_household_already_over_not_to_borrow():
    # ₹2,000 of ₹3,000 is 66.67% before any loan for the gap is counted.
    result = _pipeline(household_monthly_income=3000)
    risk = result["risk_analysis"]
    codes = result["advisory"]["recommendation_codes"]

    assert risk["household_check_without_new_loan"] == "over_limit"
    assert risk["household_check"] == "over_limit"
    assert "adv.householdAlreadyOver" in codes
    assert "adv.householdOverLimit" not in codes
    assert result["mvp_summary"]["next_step_code"] == "nxt.householdOverLimit"


def test_the_pipeline_blames_the_new_loan_when_only_it_goes_over():
    # ₹2,000 of ₹5,000 is 40%; with ₹1,112 for the gap's loan it is 62.24%.
    result = _pipeline(household_monthly_income=5000)
    risk = result["risk_analysis"]
    codes = result["advisory"]["recommendation_codes"]

    assert risk["household_check_without_new_loan"] == "within_limit"
    assert risk["household_check"] == "over_limit"
    assert "adv.householdOverLimit" in codes
    assert "adv.householdAlreadyOver" not in codes
    assert result["mvp_summary"]["next_step_code"] == "nxt.householdNewLoanOver"


# --- mvp_service ------------------------------------------------------------


def _summary(risk=None, financial=None, feasibility="feasible", advisory=None):
    return build_mvp_summary(
        financial_analysis={"financial_status": "profitable", "funding_gap": 0, **(financial or {})},
        risk_analysis={"risk_level": "low", **(risk or {})},
        business_analysis={"feasibility_status": feasibility},
        advisory=advisory
        or {
            "recommendations": ["Maintain the current business model."],
            "recommendation_codes": ["adv.maintainExpand"],
        },
    )


def test_over_the_limit_is_never_good():
    result = _summary(risk={"household_check": "over_limit"})

    assert result["status"] == "attention_needed"
    assert result["message_code"] == "sum.householdOverLimit"
    assert result["simple_message"] == "Loan repayments are too high for the household's income."
    assert result["next_step_code"] == "nxt.householdOverLimit"
    assert result["next_step"] == (
        "The household's current loan repayments already take more than half of its "
        "monthly income. Bring them down before taking another loan."
    )
    assert result["priority"] == "high"


@pytest.mark.parametrize("check", ["not_checked", "within_limit"])
def test_not_checked_and_within_leave_the_summary_alone(check):
    assert _summary(risk={"household_check": check}) == _summary()
    assert _summary()["status"] == "good"


def test_the_surplus_problem_is_still_named_first():
    result = _summary(risk={"risk_level": "moderate", "household_check": "over_limit"})

    assert result["message_code"] == "sum.needsAttention"
    # Moderate is not high, so the next step is the household one.
    assert result["next_step_code"] == "nxt.householdOverLimit"


def test_high_risk_keeps_its_own_next_step():
    result = _summary(risk={"risk_level": "high", "household_check": "over_limit"})

    assert result["message_code"] == "sum.needsAttention"
    assert result["next_step_code"] == "nxt.reducePressure"


def test_a_loss_keeps_its_own_next_step():
    result = _summary(
        financial={"financial_status": "loss"},
        risk={"risk_level": "high", "household_check": "over_limit"},
    )

    assert result["next_step_code"] == "nxt.reviewExpenses"


def test_over_the_limit_outranks_a_funding_gap_in_the_summary():
    result = _summary(
        financial={"funding_gap": 50000},
        risk={
            "household_check": "over_limit",
            "household_check_without_new_loan": "over_limit",
            "estimated_new_emi": 1112,
        },
    )

    assert result["message_code"] == "sum.householdOverLimit"
    assert result["next_step_code"] == "nxt.householdOverLimit"
    assert result["priority"] == "high"


def test_the_loan_for_the_gap_is_named_when_it_is_what_goes_over():
    result = _summary(
        financial={"funding_gap": 50000},
        risk={
            "household_check": "over_limit",
            "household_check_without_new_loan": "within_limit",
            "estimated_new_emi": 1112,
        },
    )

    assert result["status"] == "attention_needed"
    assert result["message_code"] == "sum.householdOverLimit"
    assert result["next_step_code"] == "nxt.householdNewLoanOver"
    assert result["next_step"] == (
        "A loan for the funding gap would take repayments above half of the "
        "household's monthly income. Plan a smaller start, or raise more of the money first."
    )
    assert result["priority"] == "high"


def test_no_new_loan_means_the_current_repayments_are_named():
    # Without-new-loan "within" can only differ from the total when a new loan
    # exists. With no estimated loan the current repayments are the problem.
    result = _summary(
        risk={
            "household_check": "over_limit",
            "household_check_without_new_loan": "within_limit",
            "estimated_new_emi": 0,
        },
    )

    assert result["next_step_code"] == "nxt.householdOverLimit"


def test_over_the_limit_outranks_an_infeasible_plan_in_the_next_step():
    result = _summary(feasibility="not_feasible", risk={"household_check": "over_limit"})

    assert result["message_code"] == "sum.householdOverLimit"
    assert result["next_step_code"] == "nxt.householdOverLimit"


def test_an_infeasible_plan_within_the_limit_is_still_review():
    result = _summary(feasibility="not_feasible", risk={"household_check": "within_limit"})

    assert result["status"] == "review"
    assert result["next_step_code"] == "nxt.reviewPlan"


# --- the real pipeline ------------------------------------------------------


def test_every_household_branch_is_reachable_through_the_real_pipeline():
    """Every new branch, and every old one, is landable on from real input.

    The same shape as test_priority_advice_is_reachable_through_the_real_pipeline
    in test_mvp_service.py, with household income as a sixth dimension. None is
    in it so every pre-existing outcome is still swept exactly as before.
    """
    seen_codes = set()
    seen_messages = set()
    seen_status = set()
    seen_priority = set()
    seen_checks = set()
    seen_without = set()
    seen_range = set()
    seen_advice = set()

    for cap, rev, exp, emi, opex, income in product(
        [0, 150000, 250000],
        [0, 5000, 20000, 30000],
        [0, 5000, 15000, 40000],
        [0, 3000, 12000],
        [0, 10000, 35000],
        [None, 0, 2000, 8000, 30000],
    ):
        common = dict(
            business_category="tailoring",
            state="Uttar Pradesh",
            district="Lucknow",
            available_capital=cap,
            monthly_expenses=exp,
            expected_monthly_revenue=rev,
            monthly_emi=emi,
            initial_investment=200000,
            monthly_operating_expenses=opex,
        )
        result = run_unified_analysis(household_monthly_income=income, **common)
        risk = result["risk_analysis"]
        summary = result["mvp_summary"]
        advisory = result["advisory"]

        seen_codes.add(summary["next_step_code"])
        seen_messages.add(summary["message_code"])
        seen_status.add(summary["status"])
        seen_priority.add(summary["priority"])
        seen_checks.add(risk["household_check"])
        seen_without.add(risk["household_check_without_new_loan"])
        seen_range.add(risk["household_in_microfinance_range"])

        assert HOUSEHOLD_KEYS <= set(risk)
        assert len(advisory["recommendations"]) == len(advisory["recommendation_codes"])
        # Nothing the reader told us about themselves is echoed on any branch.
        assert set(summary) == {
            "status",
            "simple_message",
            "message_code",
            "next_step",
            "next_step_code",
            "priority",
            "location_type",
        }
        assert all("local_context" not in row for row in result["market_context"])

        if income is None:
            # No income given changes nothing anywhere in the response.
            assert result == run_unified_analysis(**common)
            assert risk["household_check"] == "not_checked"

        if income is not None and income > 0:
            assert risk["household_repayment_percent"] == round(
                risk["total_monthly_emi"] / income * 100, 2
            )
            assert (risk["household_check"] == "over_limit") == (
                risk["household_repayment_percent"] > 50
            )

        # Nobody with no repayments at all is over the limit.
        if risk["total_monthly_emi"] == 0:
            assert risk["household_check"] != "over_limit"

        household_advice = HOUSEHOLD_ADVICE & set(advisory["recommendation_codes"])
        seen_advice |= household_advice

        if risk["household_check"] == "over_limit":
            # Never told it looks good, never told to expand, always told why.
            assert summary["status"] != "good"
            assert "adv.maintainExpand" not in advisory["recommendation_codes"]
            assert "adv.healthyMargin" not in advisory["recommendation_codes"]
            # "Take a smaller loan" only where a smaller loan could fit: when
            # the loans already repaid are over on their own, it cannot.
            if risk["household_check_without_new_loan"] == "over_limit":
                assert household_advice == {"adv.householdAlreadyOver"}
            else:
                assert household_advice == {"adv.householdOverLimit"}
        else:
            assert household_advice == set()

        # The loan for the gap is only blamed when there is one.
        if summary["next_step_code"] == "nxt.householdNewLoanOver":
            assert risk["estimated_new_emi"] > 0
            assert risk["household_check_without_new_loan"] == "within_limit"

    assert seen_checks == CHECKS
    assert seen_without == CHECKS
    assert seen_range == {True, False, None}
    assert seen_advice == HOUSEHOLD_ADVICE
    assert {
        "nxt.reviewExpenses",
        "nxt.reducePressure",
        "nxt.reviewPlan",
        "nxt.gapTooLarge",
        "nxt.arrangeGap",
        "nxt.householdOverLimit",
        "nxt.householdNewLoanOver",
    } <= seen_codes
    assert {
        "sum.positive",
        "sum.needsAttention",
        "sum.needsFunding",
        "sum.reviewCarefully",
        "sum.householdOverLimit",
    } <= seen_messages
    assert seen_status == {"good", "attention_needed", "review"}
    assert seen_priority == {"high", "medium", "low"}


# --- the routes -------------------------------------------------------------


# The demo payload: tailoring in Lucknow, a ₹50,000 funding gap priced at
# ₹1,112 a month on top of the ₹2,000 EMI already paid, so ₹3,112 in total.
ANALYSIS_PAYLOAD = {
    "business_category": "tailoring",
    "state": "Uttar Pradesh",
    "district": "Lucknow",
    "location_type": "rural",
    "available_capital": 50000,
    "monthly_expenses": 15000,
    "expected_monthly_revenue": 30000,
    "monthly_emi": 2000,
    "initial_investment": 100000,
    "monthly_operating_expenses": 18000,
}


def _run(**extra):
    response = client.post("/api/analysis/run", json={**ANALYSIS_PAYLOAD, **extra})

    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.parametrize("extra", [{}, {"household_monthly_income": None}])
def test_the_route_without_household_income_is_not_checked(extra):
    data = _run(**extra)
    risk = data["risk_analysis"]

    assert HOUSEHOLD_KEYS <= set(risk)
    assert risk["household_monthly_income"] is None
    assert risk["household_repayment_percent"] is None
    assert risk["household_check"] == "not_checked"
    assert risk["household_check_without_new_loan"] == "not_checked"
    assert risk["household_in_microfinance_range"] is None
    assert risk["household_reason_code"] == "rsn.householdNotChecked"
    assert risk["household_limit_percent"] == 50
    assert risk["household_microfinance_income_limit"] == 300000
    # The demo outcome is unchanged when the question is left blank.
    assert data["mvp_summary"]["message_code"] == "sum.needsFunding"


def test_the_route_passes_household_income_through():
    data = _run(household_monthly_income=20000)
    risk = data["risk_analysis"]

    assert risk["total_monthly_emi"] == 3112
    assert risk["household_monthly_income"] == 20000
    assert risk["household_repayment_percent"] == 15.56
    assert risk["household_check"] == "within_limit"
    assert risk["household_in_microfinance_range"] is True
    assert data["mvp_summary"]["message_code"] == "sum.needsFunding"


def test_the_route_reports_a_household_over_the_limit():
    data = _run(household_monthly_income=5000)
    risk = data["risk_analysis"]

    assert risk["household_repayment_percent"] == 62.24
    assert risk["household_check"] == "over_limit"
    # 2000 of 5000 is 40%: it is the loan for the gap that goes over.
    assert risk["household_check_without_new_loan"] == "within_limit"
    assert data["mvp_summary"]["status"] == "attention_needed"
    assert data["mvp_summary"]["message_code"] == "sum.householdOverLimit"
    assert data["mvp_summary"]["next_step_code"] == "nxt.householdNewLoanOver"
    assert "adv.householdOverLimit" in data["advisory"]["recommendation_codes"]


def test_the_route_treats_zero_income_as_an_answer():
    data = _run(household_monthly_income=0)
    risk = data["risk_analysis"]

    assert risk["household_monthly_income"] == 0
    assert risk["household_repayment_percent"] is None
    assert risk["household_check"] == "over_limit"
    assert risk["household_in_microfinance_range"] is True


def test_the_advisory_route_runs_the_check():
    response = client.post(
        "/api/advisory/recommend",
        json={
            "available_capital": 50000,
            "monthly_expenses": 20000,
            "expected_monthly_revenue": 60000,
            "monthly_emi": 5000,
            "household_monthly_income": 8000,
        },
    )

    assert response.status_code == 200, response.text

    data = response.json()
    risk = data["risk_assessment"]

    assert risk["household_repayment_percent"] == 62.5
    assert risk["household_check"] == "over_limit"
    # No plan amount on this route, so no loan for a gap is priced: the check
    # is the EMI alone, and an EMI alone over the line cannot be fixed by a
    # smaller new loan.
    assert risk["estimated_new_emi"] == 0
    assert risk["total_monthly_emi"] == 5000
    assert risk["household_check_without_new_loan"] == "over_limit"
    assert data["advisory"]["recommendation_codes"] == ["adv.householdAlreadyOver"]


def test_the_advisory_route_without_household_income_is_unchanged():
    response = client.post(
        "/api/advisory/recommend",
        json={
            "available_capital": 50000,
            "monthly_expenses": 20000,
            "expected_monthly_revenue": 60000,
            "monthly_emi": 5000,
        },
    )

    assert response.status_code == 200, response.text

    data = response.json()

    assert data["risk_assessment"]["household_check"] == "not_checked"
    assert data["advisory"]["recommendation_codes"] == [
        "adv.maintainExpand",
        "adv.healthyMargin",
    ]
