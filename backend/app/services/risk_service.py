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

    pressure_ratio = (monthly_emi / monthly_surplus) * 100

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
        "pressure_ratio_percent": round(pressure_ratio, 2),
        "risk_level": risk_level,
        "reason": reason,
        "reason_code": reason_code
    }
