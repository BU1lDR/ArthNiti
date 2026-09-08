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


def test_the_printed_figure_and_the_band_come_from_the_same_number():
    """A ratio that rounds across a band edge must not print one thing and be
    classified as another.

    29.9997% used to be tested raw — so it fell in the "low" band — and then
    returned rounded, so the page printed "30%" beside the word "low" while
    /analysis coloured anything at 30 amber. The reader saw a figure that
    contradicted both the word and the colour next to it. Rounding once, before
    the band tests, is what makes the two agree.
    """
    result = calculate_repayment_pressure(
        monthly_surplus=100001,
        monthly_emi=30000,
    )

    assert result["pressure_ratio_percent"] == 30
    assert result["risk_level"] == "moderate"
    assert "between 30% and 50%" in result["reason"]


def test_every_band_edge_agrees_with_its_printed_figure():
    """The general form of the test above, swept rather than sampled.

    Whatever figure the reader is shown, re-deriving the band from that figure
    alone must give back the band they were put in. This is the invariant; the
    single case above is the one that was broken.
    """
    for surplus in (9999, 10000, 30000, 50000, 100001, 123457):
        for emi in (0, 1, 2999, 3000, 3001, 14999, 15000, 15001, 50000):
            result = calculate_repayment_pressure(
                monthly_surplus=surplus,
                monthly_emi=emi,
            )
            shown = result["pressure_ratio_percent"]

            assert shown is not None
            implied = (
                "low" if shown < 30
                else "moderate" if shown <= 50
                else "high"
            )

            assert implied == result["risk_level"], (
                f"surplus={surplus} emi={emi} prints {shown}% "
                f"but is called {result['risk_level']}"
            )