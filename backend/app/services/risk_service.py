def calculate_repayment_pressure(
    monthly_surplus: float,
    monthly_emi: float
):
    if monthly_surplus <= 0:
        return {
            "pressure_ratio_percent": None,
            "risk_level": "high",
            "reason": "There is no positive monthly surplus available for repayment."
        }

    pressure_ratio = (monthly_emi / monthly_surplus) * 100

    if pressure_ratio < 30:
        risk_level = "low"
        reason = "Indicative EMI is below 30% of the monthly surplus."

    elif pressure_ratio <= 50:
        risk_level = "moderate"
        reason = "Indicative EMI is between 30% and 50% of the monthly surplus."

    else:
        risk_level = "high"
        reason = "Indicative EMI exceeds 50% of the monthly surplus."

    return {
        "pressure_ratio_percent": round(pressure_ratio, 2),
        "risk_level": risk_level,
        "reason": reason
    }