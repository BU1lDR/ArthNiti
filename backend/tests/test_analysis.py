from app.services.analysis_service import run_unified_analysis


def test_unified_analysis_profitable_business():
    result = run_unified_analysis(
        business_category="Dairy",
        state="Delhi",
        available_capital=100000,
        monthly_expenses=30000,
        expected_monthly_revenue=50000,
        monthly_emi=5000,
        initial_investment=100000,
        monthly_operating_expenses=30000,
        existing_debt=10000,
    )

    assert "financial_analysis" in result
    assert "risk_analysis" in result
    assert "business_analysis" in result
    assert "scheme_matches" in result
    assert "advisory" in result

    assert (
        result["financial_analysis"]["financial_status"]
        == "profitable"
    )

    assert (
        result["business_analysis"]["feasibility_status"]
        == "feasible"
    )


def test_unified_analysis_loss_business():
    result = run_unified_analysis(
        business_category="Retail",
        state="Delhi",
        available_capital=5000,
        monthly_expenses=40000,
        expected_monthly_revenue=20000,
        monthly_emi=5000,
        initial_investment=100000,
        monthly_operating_expenses=30000,
    )

    assert (
        result["financial_analysis"]["financial_status"]
        == "loss"
    )

    assert (
        result["risk_analysis"]["risk_level"]
        == "high"
    )


def test_unified_analysis_risk_calculation():
    # Capital covers the investment, so no new loan is priced in and the ratio
    # is the entered EMI alone. The funding-gap case is the test below.
    result = run_unified_analysis(
        business_category="Dairy",
        state="Delhi",
        available_capital=100000,
        monthly_expenses=30000,
        expected_monthly_revenue=50000,
        monthly_emi=15000,
        initial_investment=100000,
        monthly_operating_expenses=25000,
    )

    assert (
        result["risk_analysis"]["pressure_ratio_percent"]
        == 75.0
    )

    assert result["risk_analysis"]["risk_level"] == "high"


def test_unified_analysis_prices_the_funding_gap_into_risk():
    # Same figures with ₹50,000 of the investment not in hand. The loan for it
    # at the assumed 12% over 5 years is ₹1,112 a month, so the pressure is
    # (15000 + 1112) / 20000 rather than 15000 / 20000.
    result = run_unified_analysis(
        business_category="Dairy",
        state="Delhi",
        available_capital=50000,
        monthly_expenses=30000,
        expected_monthly_revenue=50000,
        monthly_emi=15000,
        initial_investment=100000,
        monthly_operating_expenses=25000,
    )
    risk = result["risk_analysis"]

    assert result["financial_analysis"]["funding_gap"] == 50000
    assert risk["estimated_new_emi"] == 1112
    assert risk["total_monthly_emi"] == 16112
    assert risk["pressure_ratio_percent"] == 80.56
    assert risk["risk_level"] == "high"
    # The EMI they already pay is over half the surplus on its own, so the
    # advice is about that loan, not about the one they have not taken yet.
    assert risk["risk_level_without_new_loan"] == "high"
    assert result["mvp_summary"]["next_step_code"] == "nxt.reducePressure"
