from app.services.risk_service import calculate_repayment_pressure


def test_no_positive_surplus_is_high_risk():
    result = calculate_repayment_pressure(
        monthly_surplus=0,
        monthly_emi=5000,
    )

    assert result["pressure_ratio_percent"] is None
    assert result["risk_level"] == "high"
    assert "no positive monthly surplus" in result["reason"]


def test_negative_surplus_is_high_risk():
    result = calculate_repayment_pressure(
        monthly_surplus=-10000,
        monthly_emi=5000,
    )

    assert result["pressure_ratio_percent"] is None
    assert result["risk_level"] == "high"


def test_low_repayment_pressure():
    result = calculate_repayment_pressure(
        monthly_surplus=50000,
        monthly_emi=10000,
    )

    assert result["pressure_ratio_percent"] == 20
    assert result["risk_level"] == "low"
    assert "below 30%" in result["reason"]


def test_thirty_percent_pressure_is_moderate():
    result = calculate_repayment_pressure(
        monthly_surplus=50000,
        monthly_emi=15000,
    )

    assert result["pressure_ratio_percent"] == 30
    assert result["risk_level"] == "moderate"
    assert "between 30% and 50%" in result["reason"]


def test_fifty_percent_pressure_is_moderate():
    result = calculate_repayment_pressure(
        monthly_surplus=50000,
        monthly_emi=25000,
    )

    assert result["pressure_ratio_percent"] == 50
    assert result["risk_level"] == "moderate"
    assert "between 30% and 50%" in result["reason"]


def test_above_fifty_percent_pressure_is_high():
    result = calculate_repayment_pressure(
        monthly_surplus=50000,
        monthly_emi=30000,
    )

    assert result["pressure_ratio_percent"] == 60
    assert result["risk_level"] == "high"
    assert "exceeds 50%" in result["reason"]


def test_pressure_ratio_is_rounded():
    result = calculate_repayment_pressure(
        monthly_surplus=30000,
        monthly_emi=10000,
    )

    assert result["pressure_ratio_percent"] == 33.33
    assert result["risk_level"] == "moderate"