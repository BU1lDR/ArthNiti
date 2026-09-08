# `reason_code` is the translatable twin of `reason`. See advisory_service for
# why both travel together.
def calculate_repayment_pressure(
    monthly_surplus: float,
    monthly_emi: float
):
    if monthly_surplus <= 0:
        return {
            "pressure_ratio_percent": None,
            "risk_level": "high",
            "reason": "There is no positive monthly surplus available for repayment.",
            "reason_code": "rsn.noSurplus"
        }

    # Round once, then classify on the rounded value. Classifying on the raw ratio
    # and returning the rounded one lets the two disagree at the band edges: an
    # EMI of 30000 against a surplus of 100001 is 29.9997%, which rounds to 30.0
    # and prints as "30%" — but tested raw it is < 30, so the page showed "30%"
    # beside the word "low" while /analysis coloured the bar green for anything
    # under 30 and amber at exactly 30. The figure the reader sees and the band
    # they are put in have to come from the same number.
    pressure_ratio = round((monthly_emi / monthly_surplus) * 100, 2)

    if pressure_ratio < 30:
        risk_level = "low"
        reason = "Indicative EMI is below 30% of the monthly surplus."
        reason_code = "rsn.emiBelow30"

    elif pressure_ratio <= 50:
        risk_level = "moderate"
        reason = "Indicative EMI is between 30% and 50% of the monthly surplus."
        reason_code = "rsn.emi30to50"

    else:
        risk_level = "high"
        reason = "Indicative EMI exceeds 50% of the monthly surplus."
        reason_code = "rsn.emiAbove50"

    return {
        "pressure_ratio_percent": pressure_ratio,
        "risk_level": risk_level,
        "reason": reason,
        "reason_code": reason_code
    }
