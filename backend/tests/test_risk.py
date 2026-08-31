from app.services.risk_service import calculate_repayment_pressure


def test_low_repayment_pressure():
    result = calculate_repayment_pressure(
        monthly_surplus=20000,
        monthly_emi=5000
    )

    assert result["pressure_ratio_percent"] == 25
    assert result["risk_level"] == "low"


def test_moderate_repayment_pressure():
    result = calculate_repayment_pressure(
        monthly_surplus=20000,
        monthly_emi=8000
    )

    assert result["pressure_ratio_percent"] == 40
    assert result["risk_level"] == "moderate"


def test_high_repayment_pressure():
    result = calculate_repayment_pressure(
        monthly_surplus=20000,
        monthly_emi=12000
    )

    assert result["pressure_ratio_percent"] == 60
    assert result["risk_level"] == "high"


def test_no_monthly_surplus():
    result = calculate_repayment_pressure(
        monthly_surplus=0,
        monthly_emi=5000
    )

    assert result["pressure_ratio_percent"] is None
    assert result["risk_level"] == "high"