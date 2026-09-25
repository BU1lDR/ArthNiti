# The terms a loan for the funding gap is priced at. These are a stated
# assumption, not a quote, and the page prints both numbers beside the figure
# they produce. 12% a year is a mid-range bank rate for a small-business loan;
# microfinance usually costs more, so this is not a worst case. Five years is a
# common tenure for the loans on the schemes page.
ASSUMED_ANNUAL_INTEREST_PERCENT = 12
ASSUMED_TENURE_MONTHS = 60

# The household check, from the Reserve Bank of India's microfinance directions
# (Regulatory Framework for Microfinance Loans, 2022). Every regulated lender
# must have a board-approved policy capping a household's monthly loan
# repayments at 50% of its monthly household income (para 5.1), counting the
# repayments, principal and interest, of ALL the household's outstanding loans,
# microfinance or not, plus the proposed one (para 5.2); a household already
# over the cap gets no new loan until it is back within it (para 5.3). A
# microfinance loan is a collateral-free loan to a household earning up to
# ₹3,00,000 a year (para 3.1), where the household is husband, wife and their
# unmarried children.
#
# The rule binds regulated lenders for microfinance loans. It does not bind a
# household above ₹3,00,000 a year, or a loan that is not microfinance, so the
# response says whether the household is in that range rather than calling
# anything compliant. And the new loan inside the total is priced at the
# assumption above, not at any lender's terms, so the result is an estimate of
# the test a lender would run, never a statement that one will lend.
#
# Annex I assesses household income over the past year, from all sources. It is
# silent on income expected from the activity being financed, and a new
# activity has no past income, so the figure compared here is the household's
# own, asked for separately, and never the business's expected revenue.
HOUSEHOLD_REPAYMENT_LIMIT_PERCENT = 50
MICROFINANCE_ANNUAL_INCOME_LIMIT = 300000


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


# household_check -> (household_reason, household_reason_code), on the same
# pattern as _REASONS.
_HOUSEHOLD_REASONS = {
    "within_limit": (
        "Loan repayments are no more than half of the household's monthly income.",
        "rsn.householdWithin",
    ),
    "over_limit": (
        "Loan repayments are more than half of the household's monthly income.",
        "rsn.householdOver",
    ),
    "not_checked": (
        "Household income was not given, so loan repayments were not checked against it.",
        "rsn.householdNotChecked",
    ),
}


def _household_share(monthly_repayment: float, household_monthly_income: float | None):
    # Returns (percent, check). Every comparison is guarded: an income that was
    # not given is None, and `None <= 0` is a TypeError in Python 3.
    if household_monthly_income is None:
        return None, "not_checked"

    # No income to take a share of, so there is no percentage to print. Any
    # repayment at all is then more than half of nothing; no repayment is not.
    if household_monthly_income <= 0:
        return None, "over_limit" if monthly_repayment > 0 else "within_limit"

    # Round once, then classify on the rounded value, for the same reason as the
    # pressure ratio below: the figure printed and the verdict beside it must
    # come from one number. So 50.004% prints as 50% and is within the limit,
    # and exactly 50% is within it too, because the cap is "no more than" half.
    percent = round((monthly_repayment / household_monthly_income) * 100, 2)
    if percent > HOUSEHOLD_REPAYMENT_LIMIT_PERCENT:
        return percent, "over_limit"
    return percent, "within_limit"


def _household_terms(
    monthly_emi: float,
    total_monthly_emi: float,
    household_monthly_income: float | None,
):
    # The check counts every repayment the household would make: the EMI it
    # already pays plus the estimated loan for the funding gap (para 5.2 counts
    # the proposed loan). `existing_debt` stays out for the reason given in
    # calculate_repayment_pressure. The without-new-loan check is on the EMI
    # alone, so mvp_service can tell "the loans you already have are too heavy
    # for the household" from "the loan for the gap would make them too heavy".
    percent, check = _household_share(total_monthly_emi, household_monthly_income)
    _, check_without_new_loan = _household_share(monthly_emi, household_monthly_income)
    reason, reason_code = _HOUSEHOLD_REASONS[check]

    if household_monthly_income is None:
        in_microfinance_range = None
    else:
        in_microfinance_range = (
            household_monthly_income * 12 <= MICROFINANCE_ANNUAL_INCOME_LIMIT
        )

    return {
        "household_monthly_income": household_monthly_income,
        "household_repayment_percent": percent,
        "household_check": check,
        "household_check_without_new_loan": check_without_new_loan,
        "household_limit_percent": HOUSEHOLD_REPAYMENT_LIMIT_PERCENT,
        "household_microfinance_income_limit": MICROFINANCE_ANNUAL_INCOME_LIMIT,
        "household_in_microfinance_range": in_microfinance_range,
        "household_reason": reason,
        "household_reason_code": reason_code,
    }


def calculate_repayment_pressure(
    monthly_surplus: float,
    monthly_emi: float,
    funding_gap: float = 0,
    household_monthly_income: float | None = None,
):
    # A funding gap is money the plan needs and the entrepreneur does not have.
    # It used to be computed and then ignored here, so someone with no capital
    # against a ₹5 lakh plan and no current loan read as "low" risk and was told
    # to keep going. The gap is priced as the loan that would fill it and added
    # to the EMI they already pay. That is not double counting: the EMI question
    # on /finance asks for the monthly repayment of every loan the household
    # already has, and this is a new one.
    #
    # The EMI is household-wide because the household check below needs every
    # loan the household repays (RBI para 5.2). Dividing a household EMI by the
    # business surplus is consistent, not a mix of scopes: monthly_surplus is
    # revenue minus `monthly_expenses`, and that question asks for everything
    # spent each month, home and family costs included. What it does not see is
    # another earner's wages paying their own loan; those raise the pressure
    # figure, which errs towards caution.
    #
    # `existing_debt` is deliberately not added. It is the outstanding amount of
    # a business loan whose monthly repayment is already inside the EMI entered,
    # so counting the debt as well would count the same loan twice.
    estimated_new_emi = estimate_monthly_repayment(funding_gap)
    total_monthly_emi = round(monthly_emi + estimated_new_emi, 2)

    terms = {
        "monthly_emi": monthly_emi,
        "estimated_new_emi": estimated_new_emi,
        "total_monthly_emi": total_monthly_emi,
        "assumed_interest_rate_percent": ASSUMED_ANNUAL_INTEREST_PERCENT,
        "assumed_tenure_months": ASSUMED_TENURE_MONTHS,
    }

    # The household check does not depend on the business surplus, so it is
    # computed before the early return and travels on both paths. A household
    # with no business surplus can still be told whether its loans fit its
    # income, and the frontend reads these keys without guarding for absence.
    household = _household_terms(monthly_emi, total_monthly_emi, household_monthly_income)

    if monthly_surplus <= 0:
        return {
            "pressure_ratio_percent": None,
            "risk_level": "high",
            "risk_level_without_new_loan": "high",
            "reason": "There is no positive monthly surplus available for repayment.",
            "reason_code": "rsn.noSurplus",
            **terms,
            **household,
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
        **household,
    }
