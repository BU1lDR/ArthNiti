from app.services.advisory_service import generate_advice


def test_loss_business_advice():
    result = generate_advice(
        financial_status="loss",
        profit_margin_percent=-20,
        available_capital=5000
    )

    assert "recommendations" in result
    assert len(result["recommendations"]) > 0


def test_profitable_business_advice():
    result = generate_advice(
        financial_status="profitable",
        profit_margin_percent=35,
        available_capital=50000
    )

    assert "recommendations" in result
    assert len(result["recommendations"]) > 0