"""The month-by-month repayment schedule of one loan.

Money is counted in whole paise (integers), so every column adds up exactly and
the loan ends on a balance of exactly zero. The instalment is the one
`estimate_monthly_repayment` prices, rounded to a whole rupee; the last payment
absorbs what that rounding leaves. A calculation at an assumed rate, never a
quote.
"""
from decimal import Decimal, ROUND_HALF_EVEN

from app.services.risk_service import estimate_monthly_repayment


def _whole(amount: Decimal):
    return int(amount.quantize(Decimal(1), ROUND_HALF_EVEN))


def _paise(rupees: float):
    return _whole(Decimal(str(rupees)) * 100)


def _interest(balance: int, rate: Decimal):
    return _whole(Decimal(balance) * rate / 1200)


def amortization_schedule(principal: float, annual_interest_percent: float, tenure_months: int):
    rate = Decimal(str(annual_interest_percent))
    instalment = _paise(estimate_monthly_repayment(principal, annual_interest_percent, tenure_months))
    balance = _paise(principal)

    # An instalment that rounds to nothing, or to less than the first month's
    # interest, would let the balance grow: there is no schedule to print.
    if instalment <= _interest(balance, rate):
        return {"schedule": [], "total_repayment": 0.0, "total_interest": 0.0}

    rows = []
    paid = interest_paid = 0
    for month in range(1, tenure_months + 1):
        interest = _interest(balance, rate)
        due = balance + interest
        payment = due if month == tenure_months else min(instalment, due)
        rows.append({
            "month": month,
            "opening_balance": balance / 100,
            "payment": payment / 100,
            "interest": interest / 100,
            "principal": (payment - interest) / 100,
            "closing_balance": (due - payment) / 100,
        })
        paid += payment
        interest_paid += interest
        balance = due - payment
        if balance == 0:
            break

    return {"schedule": rows, "total_repayment": paid / 100, "total_interest": interest_paid / 100}
