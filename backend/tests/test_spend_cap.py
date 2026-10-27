"""The ceiling on what this app asks Meta to bill (core/spend.py).

The owner has no budget for the model API: the hackathon credit is the most that
may be used, and a bill for anything else is a failure whatever the code does
well. So the ceiling is a file on disk, and not a counter in memory that a
restart would reset, and it is charged before a request leaves, with a price
that is too high rather than too low.

These tests use the real class and a real file. The network is not involved.
"""

import threading
import time

import pytest

from app.core.meta_client import MetaError
from app.core.spend import SpendCap


def make(tmp_path, usd=1.0):
    return SpendCap(tmp_path / "ledger", usd)


def recorded(tmp_path):
    path = tmp_path / "ledger"
    return path.read_text().split() if path.exists() else []


def refused(cap, usd):
    with pytest.raises(MetaError) as caught:
        cap.charge(usd)

    assert caught.value.kind == "spend_cap"
    assert caught.value.status is None
    return caught.value


def test_a_charge_under_the_cap_is_recorded_in_whole_micro_dollars(tmp_path):
    cap = make(tmp_path)

    cap.charge(0.0025)

    assert recorded(tmp_path) == ["2500"]
    assert cap.spent_usd() == 0.0025


def test_a_charge_is_rounded_up_and_never_down(tmp_path):
    make(tmp_path).charge(0.0000011)

    assert recorded(tmp_path) == ["2"]


def test_charges_add_up(tmp_path):
    cap = make(tmp_path)

    for _ in range(3):
        cap.charge(0.25)

    assert recorded(tmp_path) == ["250000"] * 3
    assert cap.spent_usd() == 0.75


def test_the_total_survives_a_restart(tmp_path):
    make(tmp_path).charge(0.6)

    # A new object on the same file: what a restarted server has.
    again = make(tmp_path)

    assert again.spent_usd() == 0.6
    refused(again, 0.5)


def test_a_charge_that_would_pass_the_cap_is_refused_and_not_recorded(tmp_path):
    cap = make(tmp_path)
    cap.charge(0.9)

    error = refused(cap, 0.2)

    assert recorded(tmp_path) == ["900000"]
    # What the smoke script prints: the cap and what is already recorded.
    assert "cap $1.00" in error.detail and "recorded $0.90" in error.detail


def test_spending_exactly_the_cap_is_allowed_and_one_micro_dollar_more_is_not(tmp_path):
    cap = make(tmp_path)
    cap.charge(0.9)

    cap.charge(0.1)

    assert recorded(tmp_path) == ["900000", "100000"]
    refused(cap, 0.000001)
    assert recorded(tmp_path) == ["900000", "100000"]


def test_a_cap_is_the_amount_that_was_typed_to_the_last_micro_dollar(tmp_path):
    # 2.01 * 1,000,000 is 2009999.9999999998 in floating point, and a cap cut
    # to a whole number would be one micro-dollar under the $2.01 that was set.
    cap = make(tmp_path, 2.01)

    cap.charge(2.01)

    assert recorded(tmp_path) == ["2010000"]


# True is an int in Python, and it is not a price.
@pytest.mark.parametrize("amount", [float("nan"), float("inf"), -0.01, None, "0.5", True])
def test_an_amount_that_is_not_a_plain_price_is_refused_and_not_recorded(tmp_path, amount):
    refused(make(tmp_path), amount)

    assert recorded(tmp_path) == []


@pytest.mark.parametrize("usd", [0, -1, float("nan"), float("inf"), True])
def test_a_cap_that_is_not_a_positive_number_is_refused(tmp_path, usd):
    with pytest.raises(ValueError, match="spend cap"):
        make(tmp_path, usd)


# The last is sixteen digits: a billion dollars and more, so damage and not a total.
@pytest.mark.parametrize("contents", ["abc\n", "12.5\n", "-5\n", "1_000\n", "١٢\n", "\x00\x00", "1" * 16 + "\n"])
def test_a_ledger_that_is_not_whole_numbers_stops_the_start(tmp_path, contents):
    (tmp_path / "ledger").write_text(contents, encoding="utf-8")

    with pytest.raises(ValueError, match="ledger"):
        make(tmp_path)


def test_a_ledger_that_is_damaged_while_running_refuses_every_call(tmp_path):
    cap = make(tmp_path)
    cap.charge(0.1)
    (tmp_path / "ledger").write_text("0.1\n", encoding="utf-8")

    refused(cap, 0.1)

    assert recorded(tmp_path) == ["0.1"]


def test_a_ledger_that_cannot_be_written_refuses_the_call(tmp_path):
    cap = make(tmp_path)
    # A folder where the file was: it can neither be read as text nor appended to.
    (tmp_path / "ledger").mkdir()

    refused(cap, 0.1)


def test_a_write_that_fails_refuses_the_call_and_records_nothing(tmp_path, monkeypatch):
    cap = make(tmp_path)

    def full(*args, **kwargs):
        raise OSError(28, "No space left on device")

    # The ledger is read fine here and only the append fails, which is what a
    # full disk or a file that was made read-only does.
    monkeypatch.setattr("app.core.spend.open", full, raising=False)

    refused(cap, 0.1)

    assert recorded(tmp_path) == []


def test_a_ledger_in_a_folder_that_does_not_exist_stops_the_start(tmp_path):
    with pytest.raises(ValueError, match="folder"):
        SpendCap(tmp_path / "missing" / "ledger", 1.0)


def test_a_ledger_that_is_a_folder_stops_the_start(tmp_path):
    (tmp_path / "ledger").mkdir()

    with pytest.raises(ValueError, match="ledger"):
        make(tmp_path)


def test_a_missing_ledger_is_nothing_spent_and_is_not_made_by_starting(tmp_path):
    cap = make(tmp_path)

    assert cap.spent_usd() == 0
    assert not (tmp_path / "ledger").exists()


def test_threads_cannot_both_spend_the_last_of_the_cap(tmp_path, monkeypatch):
    cap = make(tmp_path)
    read = SpendCap._total

    def slow(self):
        # Long enough for every thread to have read the total before any writes.
        total = read(self)
        time.sleep(0.05)
        return total

    monkeypatch.setattr(SpendCap, "_total", slow)

    start = threading.Barrier(8)
    outcomes = []

    def spend():
        start.wait()

        try:
            cap.charge(0.25)
            outcomes.append("charged")
        except MetaError as error:
            outcomes.append(error.kind)

    threads = [threading.Thread(target=spend) for _ in range(8)]

    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert sorted(outcomes) == ["charged"] * 4 + ["spend_cap"] * 4
    assert recorded(tmp_path) == ["250000"] * 4
