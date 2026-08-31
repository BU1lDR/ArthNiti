from app.services.financial_service import calculate_financial_metrics


def test_profitable_business():
    result = calculate_financial_metrics(
        available_capital=100000,
        monthly_expenses=25000,
        expected_monthly_revenue=40000
    )

    assert result["monthly_profit"] == 15000
    assert result["profit_margin_percent"] == 37.5
    assert result["financial_status"] == "profitable"