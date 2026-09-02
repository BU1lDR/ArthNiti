from app.services.advisory_service import generate_advice


def test_loss_status_generates_cost_reduction_advice():
    result = generate_advice(
        financial_status="loss",
        profit_margin_percent=-20,
        available_capital=50000,
    )

    assert len(result["recommendations"]) == 2
    assert any("Reduce unnecessary" in item for item in result["recommendations"])
    assert any("Improve the profit margin" in item for item in result["recommendations"])


def test_break_even_status_generates_revenue_advice():
    result = generate_advice(
        financial_status="break_even",
        profit_margin_percent=0,
        available_capital=50000,
    )

    assert len(result["recommendations"]) == 2
    assert any("increasing revenue" in item for item in result["recommendations"])
    assert any("Improve the profit margin" in item for item in result["recommendations"])


def test_profitable_status_generates_expansion_advice():
    result = generate_advice(
        financial_status="profitable",
        profit_margin_percent=20,
        available_capital=50000,
    )

    assert len(result["recommendations"]) == 1
    assert "controlled expansion" in result["recommendations"][0]


def test_healthy_margin_generates_expansion_advice():
    result = generate_advice(
        financial_status="profitable",
        profit_margin_percent=30,
        available_capital=50000,
    )

    assert len(result["recommendations"]) == 2
    assert any("controlled expansion" in item for item in result["recommendations"])
    assert any("healthy profit margin" in item for item in result["recommendations"])


def test_low_capital_generates_cash_reserve_warning():
    result = generate_advice(
        financial_status="profitable",
        profit_margin_percent=20,
        available_capital=5000,
    )

    assert len(result["recommendations"]) == 2
    assert any("cash reserve" in item for item in result["recommendations"])


def test_exactly_ten_percent_margin_has_no_low_margin_warning():
    result = generate_advice(
        financial_status="profitable",
        profit_margin_percent=10,
        available_capital=50000,
    )

    assert len(result["recommendations"]) == 1
    assert "controlled expansion" in result["recommendations"][0]


def test_margin_between_ten_and_thirty_has_no_margin_specific_advice():
    result = generate_advice(
        financial_status="profitable",
        profit_margin_percent=20,
        available_capital=50000,
    )

    assert len(result["recommendations"]) == 1
    assert "controlled expansion" in result["recommendations"][0]


def test_zero_capital_generates_cash_reserve_warning():
    result = generate_advice(
        financial_status="break_even",
        profit_margin_percent=0,
        available_capital=0,
    )

    assert len(result["recommendations"]) == 3
    assert any("increasing revenue" in item for item in result["recommendations"])
    assert any("Improve the profit margin" in item for item in result["recommendations"])
    assert any("cash reserve" in item for item in result["recommendations"])


def test_high_margin_and_low_capital_generate_both_recommendations():
    result = generate_advice(
        financial_status="profitable",
        profit_margin_percent=35,
        available_capital=5000,
    )

    assert len(result["recommendations"]) == 3
    assert any("controlled expansion" in item for item in result["recommendations"])
    assert any("healthy profit margin" in item for item in result["recommendations"])
    assert any("cash reserve" in item for item in result["recommendations"])


def test_advice_response_contains_recommendations_list():
    result = generate_advice(
        financial_status="profitable",
        profit_margin_percent=20,
        available_capital=50000,
    )

    assert "recommendations" in result
    assert isinstance(result["recommendations"], list)