# The terms a loan for the funding gap is priced at. These are a stated
# assumption, not a quote, and the page prints both numbers beside the figure
# they produce. 12% a year is a mid-range bank rate for a small-business loan;
# microfinance usually costs more, so this is not a worst case. Five years is a
# common tenure for the loans on the schemes page.
ASSUMED_ANNUAL_INTEREST_PERCENT = 12
ASSUMED_TENURE_MONTHS = 60


def estimate_monthly_repayment(
    principal: float,
    annual_interest_percent: float = ASSUMED_ANNUAL_INTEREST_PERCENT,
    tenure_months: int = ASSUMED_TENURE_MONTHS,
):
    if principal <= 0:
        return 0.0

    monthly_rate = annual_interest_percent / 100 / 12
    if monthly_rate == 0:
        return round(principal / tenure_months, 0)

    # The standard equal-instalment formula every Indian bank's EMI calculator
    # uses. `round(x, 0)` rather than `round(x)`: the one-argument form converts
    # to int, which raises OverflowError on an infinite principal instead of
    # passing it through.
    factor = (1 + monthly_rate) ** tenure_months
    return round(principal * monthly_rate * factor / (factor - 1), 0)


def _band(pressure_ratio: float):
    if pressure_ratio < 30:
        return "low"
    if pressure_ratio <= 50:
        return "moderate"
    return "high"


# (band, includes a new loan) -> (reason, reason_code). `reason_code` is the
# translatable twin of `reason`. See advisory_service for why both travel
# together.
_REASONS = {
    ("low", False): (
        "Indicative EMI is below 30% of the monthly surplus.",
        "rsn.emiBelow30",
    ),
    ("moderate", False): (
        "Indicative EMI is between 30% and 50% of the monthly surplus.",
        "rsn.emi30to50",
    ),
    ("high", False): (
        "Indicative EMI exceeds 50% of the monthly surplus.",
        "rsn.emiAbove50",
    ),
    ("low", True): (
        "Including an estimated loan for the funding gap, indicative repayments are below 30% of the monthly surplus.",
        "rsn.gapBelow30",
    ),
    ("moderate", True): (
        "Including an estimated loan for the funding gap, indicative repayments are between 30% and 50% of the monthly surplus.",
        "rsn.gap30to50",
    ),
    ("high", True): (
        "Including an estimated loan for the funding gap, indicative repayments exceed 50% of the monthly surplus.",
        "rsn.gapAbove50",
    ),
}


def calculate_repayment_pressure(
    monthly_surplus: float,
    monthly_emi: float,
    funding_gap: float = 0,
):
    # A funding gap is money the plan needs and the entrepreneur does not have.
    # It used to be computed and then ignored here, so someone with no capital
    # against a ₹5 lakh plan and no current loan read as "low" risk and was told
    # to keep going. The gap is priced as the loan that would fill it and added
    # to the EMI they already pay. That is not double counting: the EMI question
    # on /finance asks about loans they already have, and this is a new one.
    #
    # `existing_debt` is deliberately not added. Its repayment is the EMI the
    # entrepreneur has already entered, so counting the debt as well would count
    # the same loan twice.
    estimated_new_emi = estimate_monthly_repayment(funding_gap)
    total_monthly_emi = round(monthly_emi + estimated_new_emi, 2)

    terms = {
        "monthly_emi": monthly_emi,
        "estimated_new_emi": estimated_new_emi,
        "total_monthly_emi": total_monthly_emi,
        "assumed_interest_rate_percent": ASSUMED_ANNUAL_INTEREST_PERCENT,
        "assumed_tenure_months": ASSUMED_TENURE_MONTHS,
    }

    if monthly_surplus <= 0:
        return {
            "pressure_ratio_percent": None,
            "risk_level": "high",
            "risk_level_without_new_loan": "high",
            "reason": "There is no positive monthly surplus available for repayment.",
            "reason_code": "rsn.noSurplus",
            **terms,
        }

    # Round once, then classify on the rounded value. Classifying on the raw ratio
    # and returning the rounded one lets the two disagree at the band edges: an
    # EMI of 30000 against a surplus of 100001 is 29.9997%, which rounds to 30.0
    # and prints as "30%" — but tested raw it is < 30, so the page showed "30%"
    # beside the word "low" while /analysis coloured the bar green for anything
    # under 30 and amber at exactly 30. The figure the reader sees and the band
    # they are put in have to come from the same number.
    pressure_ratio = round((total_monthly_emi / monthly_surplus) * 100, 2)
    risk_level = _band(pressure_ratio)

    # The band the entered EMI alone would get. mvp_service needs it to tell
    # "your current loan is already too heavy" apart from "the loan you would
    # need for the gap is too heavy" — the two call for different next steps.
    risk_level_without_new_loan = _band(round((monthly_emi / monthly_surplus) * 100, 2))

    reason, reason_code = _REASONS[(risk_level, estimated_new_emi > 0)]

    return {
        "pressure_ratio_percent": pressure_ratio,
        "risk_level": risk_level,
        "risk_level_without_new_loan": risk_level_without_new_loan,
        "reason": reason,
        "reason_code": reason_code,
        **terms,
    }
