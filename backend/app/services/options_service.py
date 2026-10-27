from app.services.risk_service import (
    ASSUMED_ANNUAL_INTEREST_PERCENT,
    calculate_repayment_pressure,
)

# How much of the funding gap can be borrowed, over how long, and still leave the
# repayment in the low band. This module has no rule of its own: every figure
# comes back from calculate_repayment_pressure, the function the analysis prices
# its own gap loan with, so an option's band and household check cannot differ
# from the analysis's. It only searches for the largest loan that function still
# calls low, once for each tenure.
#
# The rate is the analysis's assumed 12% a year, not a quote. Tenures are fixed
# rather than asked for: a person who has never borrowed does not know what to
# type, and four rows are a choice they can read.
TENURES_MONTHS = (12, 24, 36, 60)

# Loans are offered in whole thousands of rupees, or the whole gap. A cap of
# ₹71,905 is false precision on an assumed rate and reads like a quote.
LOAN_STEP = 1000


def _is_safe(risk: dict):
    # "Safe" is this app's own line (under 30% of the surplus, see risk_service),
    # and the household cap on top of it. It is not a lender's decision.
    return risk["risk_level"] == "low" and risk["household_check"] != "over_limit"


def _blocker(
    monthly_surplus: float,
    monthly_emi: float,
    funding_gap: float,
    household_monthly_income: float | None,
):
    # Why no loan can be offered at all, or None. The order is the order the
    # summary reads its own: nothing to finance, then no profit, then a
    # household already over its cap, then a surplus the current loans have
    # already used up.
    if funding_gap <= 0:
        return "no_gap"
    if monthly_surplus <= 0:
        return "no_surplus"

    without_loan = calculate_repayment_pressure(
        monthly_surplus, monthly_emi, 0, household_monthly_income
    )
    if without_loan["household_check"] == "over_limit":
        return "household_over_limit"
    if without_loan["risk_level"] != "low":
        return "no_room"
    return None


def _largest_safe_loan(gap: float, is_safe):
    # A bigger loan has a bigger instalment, so once a loan is too heavy every
    # bigger one is too. That is what makes a binary search valid. A loan of 0
    # is safe: _blocker has already ruled out the cases where it is not.
    if is_safe(gap):
        return gap

    low, high = 0, int(gap // LOAN_STEP)
    while low < high:
        middle = (low + high + 1) // 2
        if is_safe(middle * LOAN_STEP):
            low = middle
        else:
            high = middle - 1
    return low * LOAN_STEP


def _option(tenure: int, loan: float, gap: float, risk: dict):
    monthly_repayment = risk["estimated_new_emi"]
    total_repayment = monthly_repayment * tenure
    return {
        "code": f"term_{tenure}",
        "tenure_months": tenure,
        "loan_amount": loan,
        "remaining_gap": round(gap - loan, 2),
        "monthly_repayment": monthly_repayment,
        "total_repayment": total_repayment,
        # The instalment is rounded to whole rupees, so on a loan of a few rupees
        # the total can come out under the loan. Interest is never negative.
        "total_interest": max(round(total_repayment - loan, 2), 0),
        "pressure_ratio_percent": risk["pressure_ratio_percent"],
        "risk_level": risk["risk_level"],
        "household_repayment_percent": risk["household_repayment_percent"],
        "household_check": risk["household_check"],
    }


def build_financing_options(
    monthly_surplus: float,
    monthly_emi: float,
    funding_gap: float,
    household_monthly_income: float | None = None,
):
    """
    For each tenure, the largest loan towards the funding gap that keeps the
    total repayment in the low band and inside the household cap, and what the
    gap would still be after it. A tenure that allows no loan at all is left
    out.

    `recommended_by_rules` is the shortest tenure that covers the whole gap. Every
    option is already safe, so the shortest costs the least interest. It is None
    when no option covers the gap: no rule here can say where the rest comes from.
    """
    options = []
    recommended = None
    status = _blocker(monthly_surplus, monthly_emi, funding_gap, household_monthly_income)

    if status is None:

        def price(loan, tenure):
            return calculate_repayment_pressure(
                monthly_surplus,
                monthly_emi,
                loan,
                household_monthly_income,
                ASSUMED_ANNUAL_INTEREST_PERCENT,
                tenure,
            )

        for tenure in TENURES_MONTHS:
            loan = _largest_safe_loan(
                funding_gap, lambda amount, tenure=tenure: _is_safe(price(amount, tenure))
            )
            if loan > 0:
                options.append(_option(tenure, loan, funding_gap, price(loan, tenure)))

        covering = [o["code"] for o in options if o["remaining_gap"] == 0]
        if covering:
            status, recommended = "covered", covering[0]
        else:
            status = "partial" if options else "no_room"

    return {
        "status": status,
        "funding_gap": funding_gap,
        "assumed_interest_rate_percent": ASSUMED_ANNUAL_INTEREST_PERCENT,
        "household_checked": household_monthly_income is not None,
        "options": options,
        "recommended_by_rules": recommended,
    }
