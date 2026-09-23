from app.services.risk_service import (
    calculate_repayment_pressure,
    estimate_monthly_repayment,
)


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

def test_estimated_repayment_matches_the_standard_emi_formula():
    # ₹5 lakh at 12% a year over 60 months is ₹11,122 on any bank's calculator.
    assert estimate_monthly_repayment(500000) == 11122
    assert estimate_monthly_repayment(0) == 0
    assert estimate_monthly_repayment(-100) == 0


def test_no_funding_gap_leaves_the_pressure_on_the_entered_emi():
    result = calculate_repayment_pressure(
        monthly_surplus=50000,
        monthly_emi=10000,
        funding_gap=0,
    )

    assert result["estimated_new_emi"] == 0
    assert result["total_monthly_emi"] == 10000
    assert result["pressure_ratio_percent"] == 20.0
    assert result["risk_level"] == result["risk_level_without_new_loan"] == "low"
    assert result["reason_code"] == "rsn.emiBelow30"


def test_a_funding_gap_is_priced_as_a_loan_and_added_to_the_emi():
    # No loan today, ₹5 lakh short, ₹15,000 left each month: the loan for the
    # gap alone takes 74% of it. This is the case that used to read "low".
    result = calculate_repayment_pressure(
        monthly_surplus=15000,
        monthly_emi=0,
        funding_gap=500000,
    )

    assert result["estimated_new_emi"] == 11122
    assert result["total_monthly_emi"] == 11122
    assert result["pressure_ratio_percent"] == 74.15
    assert result["risk_level"] == "high"
    assert result["risk_level_without_new_loan"] == "low"
    assert result["reason_code"] == "rsn.gapAbove50"
    assert result["assumed_interest_rate_percent"] == 12
    assert result["assumed_tenure_months"] == 60


def test_the_gap_reason_codes_follow_the_same_bands():
    # 20000 short costs ₹445 a month; against 10000 left that is 4.45%.
    low = calculate_repayment_pressure(monthly_surplus=10000, monthly_emi=0, funding_gap=20000)
    # 3555 + 445 = 4000 of 10000 is exactly 40%.
    moderate = calculate_repayment_pressure(monthly_surplus=10000, monthly_emi=3555, funding_gap=20000)

    assert (low["risk_level"], low["reason_code"]) == ("low", "rsn.gapBelow30")
    assert (moderate["risk_level"], moderate["reason_code"]) == ("moderate", "rsn.gap30to50")


def test_no_surplus_still_reports_the_loan_terms():
    result = calculate_repayment_pressure(
        monthly_surplus=0,
        monthly_emi=2000,
        funding_gap=100000,
    )

    assert result["pressure_ratio_percent"] is None
    assert result["reason_code"] == "rsn.noSurplus"
    assert result["estimated_new_emi"] == 2224
    assert result["total_monthly_emi"] == 4224
