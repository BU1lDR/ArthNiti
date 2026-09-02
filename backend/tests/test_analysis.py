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
        employees=2,
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

    assert (
        result["risk_analysis"]["pressure_ratio_percent"]
        == 75.0
    )

    assert result["risk_analysis"]["risk_level"] == "high"