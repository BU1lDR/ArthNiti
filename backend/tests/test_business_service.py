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
    # None, not 0. A margin is a share OF revenue, so with no revenue there is no
    # margin — and this branch is reached exactly when someone entered costs but
    # no expected income, which is the worst case. 0 printed on the page as "0%",
    # which a reader takes for break-even. Same reasoning as
    # estimated_roi_percent, which has always returned None here.
    assert result["operating_margin_percent"] is None
    assert result["feasibility_status"] == "not_feasible"
    # And no margin observation, because there is no margin to describe. The
    # surplus observation above already names the actual problem.
    assert not any("operating margin" in item for item in result["observations"])
    assert "obs.lowMargin" not in result["observation_codes"]


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


def test_ten_percent_margin_is_not_called_low():
    # The band is `< 10`, so exactly 10 must fall out of it. An off-by-one here
    # is invisible in the output — the sentence is fluent either way — and the
    # suite had a case at 5 and a case at 30 but nothing on either boundary.
    result = calculate_business_analysis(
        business_type="Shop",
        initial_investment=50000,
        expected_monthly_revenue=10000,
        monthly_operating_expenses=9000,
    )

    assert result["operating_margin_percent"] == 10
    assert not any("operating margin is low" in item for item in result["observations"])
    assert "obs.lowMargin" not in result["observation_codes"]


def test_just_under_thirty_percent_margin_is_not_called_healthy():
    # The other boundary: `>= 30` is healthy, so 29.99 must not be.
    result = calculate_business_analysis(
        business_type="Food",
        initial_investment=50000,
        expected_monthly_revenue=10000,
        monthly_operating_expenses=7001,
    )

    assert result["operating_margin_percent"] == 29.99
    assert not any(
        "operating margin is healthy" in item for item in result["observations"]
    )


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