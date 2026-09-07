from app.services.financial_service import calculate_financial_metrics


def test_profitable_business():
    result = calculate_financial_metrics(
        available_capital=100000,
        monthly_expenses=30000,
        expected_monthly_revenue=50000,
    )

    assert result["monthly_profit"] == 20000
    assert result["profit_margin_percent"] == 40
    assert result["financial_status"] == "profitable"
    assert result["available_capital"] == 100000


def test_loss_making_business():
    result = calculate_financial_metrics(
        available_capital=50000,
        monthly_expenses=40000,
        expected_monthly_revenue=30000,
    )

    assert result["monthly_profit"] == -10000
    assert result["profit_margin_percent"] == -33.33
    assert result["financial_status"] == "loss"


def test_break_even_business():
    result = calculate_financial_metrics(
        available_capital=50000,
        monthly_expenses=30000,
        expected_monthly_revenue=30000,
    )

    assert result["monthly_profit"] == 0
    assert result["profit_margin_percent"] == 0
    assert result["financial_status"] == "break_even"


def test_zero_revenue():
    result = calculate_financial_metrics(
        available_capital=10000,
        monthly_expenses=5000,
        expected_monthly_revenue=0,
    )

    assert result["monthly_profit"] == -5000
    # None, not 0. There is no revenue to take a share of, and a printed "0%"
    # reads as break-even on a page that is in fact reporting a loss.
    assert result["profit_margin_percent"] is None
    assert result["financial_status"] == "loss"


def test_zero_expenses_and_revenue():
    result = calculate_financial_metrics(
        available_capital=10000,
        monthly_expenses=0,
        expected_monthly_revenue=0,
    )

    assert result["monthly_profit"] == 0
    assert result["profit_margin_percent"] is None
    assert result["financial_status"] == "break_even"


def test_a_real_zero_margin_still_reports_zero():
    """
    The None above is "could not compute", not "collapse every zero". A business
    whose revenue exactly equals its expenses has a genuine 0% margin and must
    print 0%, or the two cases become indistinguishable to the reader.
    """
    result = calculate_financial_metrics(
        available_capital=50000,
        monthly_expenses=30000,
        expected_monthly_revenue=30000,
    )

    assert result["profit_margin_percent"] == 0
    assert result["profit_margin_percent"] is not None


def test_profit_margin_is_rounded():
    result = calculate_financial_metrics(
        available_capital=25000,
        monthly_expenses=7000,
        expected_monthly_revenue=12000,
    )

    assert result["monthly_profit"] == 5000
    assert result["profit_margin_percent"] == 41.67
    assert result["financial_status"] == "profitable"


def test_available_capital_is_preserved():
    result = calculate_financial_metrics(
        available_capital=123456.78,
        monthly_expenses=10000,
        expected_monthly_revenue=15000,
    )

    assert result["available_capital"] == 123456.78