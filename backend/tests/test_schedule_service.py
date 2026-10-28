from decimal import Decimal

import pytest

from app.services.risk_service import estimate_monthly_repayment
from app.services.schedule_service import amortization_schedule

# The worked rows below come from the textbook instalment formula and the
# month-by-month balance written out in Decimal arithmetic, a separate program
# from the code under test. The instalment is rounded to a whole rupee, as the
# repayment-pressure figure rounds it, so the last payment makes up the few
# rupees that rounding leaves: 4,442.44 a month becomes 4,442, and the twelfth
# payment is 4,447.58.


def _rows(principal, rate, months):
    return amortization_schedule(principal, rate, months)["schedule"]


def _row(month, opening, payment, interest, principal, closing):
    return {
        "month": month,
        "opening_balance": opening,
        "payment": payment,
        "interest": interest,
        "principal": principal,
        "closing_balance": closing,
    }


def test_a_year_loan_of_fifty_thousand_matches_the_worked_schedule():
    result = amortization_schedule(50000, 12, 12)

    rows = result["schedule"]
    assert len(rows) == 12
    assert rows[0] == _row(1, 50000.0, 4442.0, 500.0, 3942.0, 46058.0)
    assert rows[1] == _row(2, 46058.0, 4442.0, 460.58, 3981.42, 42076.58)
    assert rows[10] == _row(11, 8757.96, 4442.0, 87.58, 4354.42, 4403.54)
    assert rows[11] == _row(12, 4403.54, 4447.58, 44.04, 4403.54, 0.0)
    assert result["total_repayment"] == 53309.58
    assert result["total_interest"] == 3309.58


@pytest.mark.parametrize(
    "principal, months, regular, last, total",
    [
        (50000, 24, 2354.0, 2345.2, 56487.2),
        (50000, 36, 1661.0, 1648.74, 59783.74),
        (50000, 60, 1112.0, 1130.18, 66738.18),
        (100000, 60, 2224.0, 2260.31, 133476.31),
    ],
)
def test_every_payment_is_the_whole_rupee_instalment_except_the_last(
    principal, months, regular, last, total
):
    result = amortization_schedule(principal, 12, months)

    payments = [row["payment"] for row in result["schedule"]]
    assert payments == [regular] * (months - 1) + [last]
    assert result["total_repayment"] == total
    assert result["total_interest"] == round(total - principal, 2)


def test_the_instalment_is_the_one_the_repayment_pressure_figure_uses():
    # options_service prices a loan with estimate_monthly_repayment; a schedule
    # that paid a different amount would disagree with the card beside it.
    for principal in (7000, 48750, 250000, 1234567):
        for months in (12, 24, 36, 60):
            first = _rows(principal, 12, months)[0]["payment"]
            assert first == estimate_monthly_repayment(principal, 12, months)


def test_the_loan_is_paid_off_to_the_paisa_in_every_kind_of_loan():
    for principal in (1500, 48750.55, 100000, 999999.99, 2500000, 10**9):
        for rate in (0, 7.5, 12, 24):
            for months in (1, 6, 12, 24, 36, 60):
                result = amortization_schedule(principal, rate, months)
                rows = result["schedule"]

                assert len(rows) == months
                assert rows[0]["opening_balance"] == principal
                assert rows[-1]["closing_balance"] == 0
                for row, following in zip(rows, rows[1:]):
                    assert following["opening_balance"] == row["closing_balance"]
                for row in rows:
                    assert row["principal"] > 0
                    assert row["interest"] >= 0
                    assert row["closing_balance"] >= 0
                    paid = Decimal(str(row["interest"])) + Decimal(str(row["principal"]))
                    assert paid == Decimal(str(row["payment"]))

                # Exact, not approximately: the columns are added as decimals.
                def column(name):
                    return sum(Decimal(str(row[name])) for row in rows)

                assert column("principal") == Decimal(str(principal))
                assert column("payment") == Decimal(str(result["total_repayment"]))
                assert column("interest") == Decimal(str(result["total_interest"]))


def test_interest_falls_and_the_loan_part_grows_month_by_month():
    rows = _rows(100000, 12, 60)

    interest = [row["interest"] for row in rows]
    assert interest == sorted(interest, reverse=True)
    # The last row repays whatever is left, so it is left out of the comparison.
    loan_part = [row["principal"] for row in rows[:-1]]
    assert loan_part == sorted(loan_part)


def test_a_loan_with_no_interest_is_paid_in_equal_parts():
    result = amortization_schedule(12000, 0, 12)

    assert [row["payment"] for row in result["schedule"]] == [1000.0] * 12
    assert result["total_interest"] == 0.0
    assert result["total_repayment"] == 12000.0


def test_a_loan_that_does_not_divide_evenly_ends_on_the_remainder():
    result = amortization_schedule(10000, 0, 12)

    payments = [row["payment"] for row in result["schedule"]]
    assert payments == [833.0] * 11 + [837.0]
    assert result["total_repayment"] == 10000.0


def test_a_loan_too_small_for_a_whole_rupee_instalment_has_no_schedule():
    # ₹5 over 12 months is ₹0.44 a month, which rounds to ₹0. Paying nothing
    # would let the balance grow, so there is no month-by-month plan to print.
    nothing = {"schedule": [], "total_repayment": 0.0, "total_interest": 0.0}

    assert amortization_schedule(5, 12, 12) == nothing
    assert amortization_schedule(0, 12, 12) == nothing


def test_an_instalment_below_the_first_months_interest_has_no_schedule():
    # ₹130 over 600 months needs ₹1.30 a month, which rounds to ₹1, and the first
    # month's interest alone is ₹1.30. Paying less than the interest would make
    # the balance grow, so there is nothing honest to print.
    nothing = {"schedule": [], "total_repayment": 0.0, "total_interest": 0.0}

    assert amortization_schedule(130, 12, 600) == nothing


def test_a_tiny_loan_that_rounds_up_is_paid_off_early_and_never_goes_negative():
    # ₹6 over 12 months is ₹0.53 a month, which rounds up to ₹1, so the loan is
    # gone in seven months. The last row is the 21 paise left, not a ₹1 payment.
    result = amortization_schedule(6, 12, 12)

    rows = result["schedule"]
    assert len(rows) == 7
    assert rows[0] == _row(1, 6.0, 1.0, 0.06, 0.94, 5.06)
    assert rows[-1] == _row(7, 0.21, 0.21, 0.0, 0.21, 0.0)
    assert result["total_repayment"] == 6.21
    assert result["total_interest"] == 0.21


def test_the_schedule_does_not_share_rows_between_calls():
    first = amortization_schedule(50000, 12, 12)
    first["schedule"][0]["payment"] = 1.0
    first["schedule"].clear()

    again = amortization_schedule(50000, 12, 12)
    assert again["schedule"][0]["payment"] == 4442.0
    assert len(again["schedule"]) == 12
