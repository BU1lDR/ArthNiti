from app.services.business_service import calculate_business_analysis


def test_feasible_business():
    result = calculate_business_analysis(
        business_type="Dairy",
        initial_investment=100000,
        expected_monthly_revenue=50000,
        monthly_operating_expenses=30000,
        employees=2,
        existing_debt=0,
    )

    assert result["business_type"] == "Dairy"
    assert result["monthly_operating_surplus"] == 20000
    assert result["operating_margin_percent"] == 40
    assert result["annual_operating_surplus"] == 240000
    assert result["estimated_roi_percent"] == 240
    assert result["feasibility_status"] == "feasible"


def test_break_even_business():
    result = calculate_business_analysis(
        business_type="Retail",
        initial_investment=100000,
        expected_monthly_revenue=30000,
        monthly_operating_expenses=30000,
    )

    assert result["monthly_operating_surplus"] == 0
    assert result["operating_margin_percent"] == 0
    assert result["annual_operating_surplus"] == 0
    assert result["estimated_roi_percent"] == 0
    assert result["feasibility_status"] == "break_even"
    assert any("break-even" in item for item in result["observations"])


def test_not_feasible_business():
    result = calculate_business_analysis(
        business_type="Manufacturing",
        initial_investment=100000,
        expected_monthly_revenue=20000,
        monthly_operating_expenses=30000,
    )

    assert result["monthly_operating_surplus"] == -10000
    assert result["operating_margin_percent"] == -50
    assert result["annual_operating_surplus"] == -120000
    assert result["estimated_roi_percent"] == -120
    assert result["feasibility_status"] == "not_feasible"
    assert any("higher than expected revenue" in item for item in result["observations"])


def test_zero_revenue():
    result = calculate_business_analysis(
        business_type="Services",
        initial_investment=50000,
        expected_monthly_revenue=0,
        monthly_operating_expenses=5000,
    )

    assert result["monthly_operating_surplus"] == -5000
    assert result["operating_margin_percent"] == 0
    assert result["feasibility_status"] == "not_feasible"


def test_zero_initial_investment_returns_none_roi():
    result = calculate_business_analysis(
        business_type="Agriculture",
        initial_investment=0,
        expected_monthly_revenue=20000,
        monthly_operating_expenses=10000,
    )

    assert result["monthly_operating_surplus"] == 10000
    assert result["annual_operating_surplus"] == 120000
    assert result["estimated_roi_percent"] is None
    assert result["feasibility_status"] == "feasible"


def test_low_margin_observation():
    result = calculate_business_analysis(
        business_type="Shop",
        initial_investment=50000,
        expected_monthly_revenue=10000,
        monthly_operating_expenses=9500,
    )

    assert result["operating_margin_percent"] == 5
    assert any("operating margin is low" in item for item in result["observations"])


def test_healthy_margin_observation():
    result = calculate_business_analysis(
        business_type="Food",
        initial_investment=50000,
        expected_monthly_revenue=10000,
        monthly_operating_expenses=7000,
    )

    assert result["operating_margin_percent"] == 30
    assert any("operating margin is healthy" in item for item in result["observations"])


def test_existing_debt_observation():
    result = calculate_business_analysis(
        business_type="Dairy",
        initial_investment=100000,
        expected_monthly_revenue=50000,
        monthly_operating_expenses=30000,
        existing_debt=25000,
    )

    assert any("Existing debt" in item for item in result["observations"])


def test_values_are_rounded():
    result = calculate_business_analysis(
        business_type="Retail",
        initial_investment=12345.678,
        expected_monthly_revenue=12000,
        monthly_operating_expenses=7000,
    )

    assert result["initial_investment"] == 12345.68
    assert result["monthly_operating_surplus"] == 5000
    assert result["operating_margin_percent"] == 41.67
    assert result["annual_operating_surplus"] == 60000