from app.services.business_service import calculate_business_analysis


def test_profitable_business():
    result = calculate_business_analysis(
        business_type="Dairy",
        initial_investment=100000,
        expected_monthly_revenue=50000,
        monthly_operating_expenses=30000,
    )

    assert result["monthly_operating_surplus"] == 20000
    assert result["operating_margin_percent"] == 40.0
    assert result["annual_operating_surplus"] == 240000
    assert result["estimated_roi_percent"] == 240.0
    assert result["feasibility_status"] == "feasible"


def test_loss_making_business():
    result = calculate_business_analysis(
        business_type="Retail",
        initial_investment=100000,
        expected_monthly_revenue=20000,
        monthly_operating_expenses=30000,
    )

    assert result["monthly_operating_surplus"] == -10000
    assert result["feasibility_status"] == "not_feasible"


def test_break_even_business():
    result = calculate_business_analysis(
        business_type="Shop",
        initial_investment=50000,
        expected_monthly_revenue=25000,
        monthly_operating_expenses=25000,
    )

    assert result["monthly_operating_surplus"] == 0
    assert result["feasibility_status"] == "break_even"


def test_zero_investment_roi():
    result = calculate_business_analysis(
        business_type="Service",
        initial_investment=0,
        expected_monthly_revenue=20000,
        monthly_operating_expenses=10000,
    )

    assert result["estimated_roi_percent"] is None


def test_existing_debt_observation():
    result = calculate_business_analysis(
        business_type="Manufacturing",
        initial_investment=200000,
        expected_monthly_revenue=60000,
        monthly_operating_expenses=30000,
        existing_debt=50000,
    )

    assert any(
        "Existing debt" in observation
        for observation in result["observations"]
    )