from itertools import product

from app.services.analysis_service import run_unified_analysis
from app.services.mvp_service import build_mvp_summary


def test_positive_business_generates_good_status():
    result = build_mvp_summary(
        financial_analysis={
            "financial_status": "profitable",
        },
        risk_analysis={
            "risk_level": "low",
        },
        business_analysis={
            "feasibility_status": "feasible",
        },
        advisory={
            "recommendations": [
                "Maintain the current business model."
            ],
        },
    )

    assert result["status"] == "good"
    assert result["priority"] == "low"


def test_high_risk_generates_attention_needed():
    result = build_mvp_summary(
        financial_analysis={
            "financial_status": "profitable",
        },
        risk_analysis={
            "risk_level": "high",
        },
        business_analysis={
            "feasibility_status": "feasible",
        },
        advisory={
            "recommendations": [],
        },
    )

    assert result["status"] == "attention_needed"
    assert result["priority"] == "high"
    assert "repayment" in result["next_step"].lower()


def test_unprofitable_business_generates_high_priority():
    # NOTE: loss + risk_level "low" is a combination the wired pipeline cannot
    # produce — analysis_service passes monthly_profit in as risk's
    # monthly_surplus, so a loss always arrives with risk "high". This unit test
    # constructs it at the seam, which is legitimate for checking the branch, but
    # it is also how a dead branch stayed certified as working for so long: the
    # advice a real loss-making user actually received came from the risk branch,
    # not this one. test_priority_advice_is_reachable_through_the_real_pipeline
    # below is the counterpart that only uses inputs a user can actually enter.
    result = build_mvp_summary(
        financial_analysis={
            "financial_status": "loss",
        },
        risk_analysis={
            "risk_level": "low",
        },
        business_analysis={
            "feasibility_status": "feasible",
        },
        advisory={
            "recommendations": [],
        },
    )

    assert result["priority"] == "high"
    assert result["status"] == "review"
    # The profitability problem must be named, not the repayment one.
    assert result["next_step_code"] == "nxt.reviewExpenses"


def test_a_loss_with_no_loan_is_not_told_to_reduce_repayment_pressure():
    """The single most misleading sentence the summary could produce.

    risk_service returns "high" whenever the monthly surplus is non-positive,
    loan or no loan. The priority chain used to lead with that, so someone with
    monthly_emi = 0 and costs above income was told to "reduce repayment pressure
    before taking another loan" — advice about a debt they do not have, with the
    thing actually wrong with their business left unmentioned.
    """
    result = run_unified_analysis(
        business_category="tailoring",
        state="Uttar Pradesh",
        district="Lucknow",
        available_capital=50000,
        monthly_expenses=20000,
        expected_monthly_revenue=10000,
        monthly_emi=0,
        initial_investment=100000,
        monthly_operating_expenses=12000,
    )
    summary = result["mvp_summary"]

    assert result["risk_analysis"]["risk_level"] == "high"
    assert result["financial_analysis"]["financial_status"] == "loss"
    assert summary["next_step_code"] == "nxt.reviewExpenses"
    assert "repayment" not in summary["next_step"].lower()
    assert "loan" not in summary["next_step"].lower()


def test_repayment_advice_still_reaches_someone_who_has_a_loan():
    """The other half of the reorder: the repayment branch must stay live.

    A positive surplus with an EMI eating more than half of it is the case that
    branch was written for.
    """
    result = run_unified_analysis(
        business_category="tailoring",
        state="Uttar Pradesh",
        district="Lucknow",
        available_capital=50000,
        monthly_expenses=10000,
        expected_monthly_revenue=20000,
        monthly_emi=8000,
        initial_investment=100000,
        monthly_operating_expenses=5000,
    )
    summary = result["mvp_summary"]

    assert result["financial_analysis"]["financial_status"] == "profitable"
    assert result["risk_analysis"]["risk_level"] == "high"
    assert summary["next_step_code"] == "nxt.reducePressure"
    assert summary["priority"] == "high"


def test_priority_advice_is_reachable_through_the_real_pipeline():
    """Every branch a user can land in must be landable on from real input.

    build_mvp_summary's arguments are NOT independent, so branch coverage at the
    unit seam proves nothing about what a user can receive. Sweeping the wired
    pipeline is the only way to see that a branch is dead: before the priority
    chain was reordered, this sweep found `nxt.reviewExpenses` and status
    "review" unreachable across every one of these combinations.
    """
    seen_codes = set()
    seen_messages = set()
    seen_status = set()
    seen_priority = set()

    # Capital is a dimension because the funding gap now drives status and
    # risk: 0 leaves the whole ₹2 lakh to borrow, 150000 leaves ₹50,000, and
    # 250000 covers it. With capital fixed below the investment, as it was
    # before the gap was wired in, "good" became unreachable.
    for cap, rev, exp, emi, opex in product(
        [0, 150000, 250000],
        [0, 5000, 20000, 30000],
        [0, 5000, 15000, 40000],
        [0, 3000, 12000],
        [0, 10000, 35000],
    ):
        result = run_unified_analysis(
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
        summary = result["mvp_summary"]
        seen_codes.add(summary["next_step_code"])
        seen_messages.add(summary["message_code"])
        seen_status.add(summary["status"])
        seen_priority.add(summary["priority"])

        # No one without a loan may be advised about repayment pressure.
        if emi == 0:
            assert summary["next_step_code"] != "nxt.reducePressure"

        # No one short of the money their plan needs is told it looks good.
        if cap < 200000:
            assert summary["status"] != "good"
            assert "adv.maintainExpand" not in result["advisory"]["recommendation_codes"]

    assert {
        "nxt.reviewExpenses",
        "nxt.reducePressure",
        "nxt.reviewPlan",
        "nxt.gapTooLarge",
        "nxt.arrangeGap",
    } <= seen_codes
    assert {
        "sum.positive",
        "sum.needsAttention",
        "sum.needsFunding",
        "sum.reviewCarefully",
    } <= seen_messages
    # All three documented statuses and priorities are live.
    assert seen_status == {"good", "attention_needed", "review"}
    assert seen_priority == {"high", "medium", "low"}


def test_infeasible_business_generates_review_action():
    result = build_mvp_summary(
        financial_analysis={
            "financial_status": "profitable",
        },
        risk_analysis={
            "risk_level": "low",
        },
        business_analysis={
            "feasibility_status": "not_feasible",
        },
        advisory={
            "recommendations": [],
        },
    )

    assert result["priority"] == "medium"
    assert "business plan" in result["next_step"].lower()


def test_the_summary_does_not_echo_language_dialect_or_literacy():
    # The page already holds the reader's language, dialect and literacy level,
    # and no rule here reads them, so the summary no longer repeats them.
    # location_type is added by run_unified_analysis, not here.
    result = build_mvp_summary(
        financial_analysis={
            "financial_status": "profitable",
        },
        risk_analysis={
            "risk_level": "low",
        },
        business_analysis={
            "feasibility_status": "feasible",
        },
        advisory={
            "recommendations": [],
        },
    )

    assert set(result) == {
        "status",
        "simple_message",
        "message_code",
        "next_step",
        "next_step_code",
        "priority",
    }


def test_no_capital_against_a_large_plan_is_not_told_to_keep_going():
    # The reported case: nothing in hand, ₹5 lakh needed, no loan today. It used
    # to come back "good" with "keep going" because the gap was ignored.
    result = run_unified_analysis(
        business_category="tailoring",
        state="Uttar Pradesh",
        district="Lucknow",
        available_capital=0,
        monthly_expenses=15000,
        expected_monthly_revenue=30000,
        monthly_emi=0,
        initial_investment=500000,
        monthly_operating_expenses=18000,
    )
    summary = result["mvp_summary"]

    assert result["financial_analysis"]["funding_gap"] == 500000
    assert result["risk_analysis"]["risk_level"] == "high"
    assert summary["status"] == "attention_needed"
    assert summary["next_step_code"] == "nxt.gapTooLarge"
    assert summary["priority"] == "high"
    assert "adv.maintainExpand" not in result["advisory"]["recommendation_codes"]


def test_a_small_gap_is_flagged_without_calling_the_risk_high():
    # ₹20,000 short costs ₹445 a month against ₹15,000 left: the plan is sound,
    # it just is not fully funded yet.
    result = run_unified_analysis(
        business_category="tailoring",
        state="Uttar Pradesh",
        district="Lucknow",
        available_capital=480000,
        monthly_expenses=15000,
        expected_monthly_revenue=30000,
        monthly_emi=0,
        initial_investment=500000,
        monthly_operating_expenses=18000,
    )
    summary = result["mvp_summary"]

    assert result["risk_analysis"]["risk_level"] == "low"
    assert summary["status"] == "attention_needed"
    assert summary["message_code"] == "sum.needsFunding"
    assert summary["next_step_code"] == "nxt.arrangeGap"
    assert summary["priority"] == "medium"
