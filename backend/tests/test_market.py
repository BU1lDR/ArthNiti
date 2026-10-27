"""
Market context lookup, on sourced rows.

market_data.json holds whatever the last fetch wrote (20 rows for two districts
as of 24 Sept 2026), so every test that needs a row uses the synthetic rows in
market_fixtures.py and stays independent of the fetch: six rows in Uttar
Pradesh, shaped exactly as the fetch writes them. The indexes below name them.

What these tests pin is the lookup's honesty, not its arithmetic: the
entrepreneur's own district first, a figure for the whole state only when it is
labelled as one, and never a row from some other district.
"""

import pytest
from fastapi.testclient import TestClient

from app.core.data_loader import load_json
from app.main import app
from app.services import market_service
from app.services.market_service import get_market_context
from market_fixtures import synthetic_market, synthetic_market_file, synthetic_rows  # noqa: F401


client = TestClient(app)

UP_TAILORING, LUCKNOW_WHEAT, LUCKNOW_POTATO, LUCKNOW_HANDICRAFTS, LUCKNOW_TAILORING, VARANASI_SERVICES = range(6)


def expected(rows, index, match_level):
    return {**rows[index], "match_level": match_level}


# ---------------------------------------------------------------- the lookup


def test_market_context_returns_the_entrepreneurs_own_district(synthetic_market):
    result = get_market_context("Uttar Pradesh", "Lucknow", "tailoring")

    # The Lucknow row only: the state row is a fallback, not an addition.
    assert result == [expected(synthetic_market, LUCKNOW_TAILORING, "district")]


def test_market_context_is_case_insensitive(synthetic_market):
    result = get_market_context("  uttar pradesh", "LUCKNOW ", "Tailoring")

    assert result == [expected(synthetic_market, LUCKNOW_TAILORING, "district")]


def test_market_context_returns_every_price_row_for_the_district_in_file_order(synthetic_market):
    result = get_market_context("Uttar Pradesh", "Lucknow", "agriculture")

    assert result == [
        expected(synthetic_market, LUCKNOW_WHEAT, "district"),
        expected(synthetic_market, LUCKNOW_POTATO, "district"),
    ]


def test_market_context_returns_a_suppressed_count_as_it_is(synthetic_market):
    # A count under 10 is withheld by the fetch, not by the lookup. The row still
    # comes back, with its null count, so the page can say the figure is held back.
    result = get_market_context("Uttar Pradesh", "Lucknow", "handicrafts")

    assert result == [expected(synthetic_market, LUCKNOW_HANDICRAFTS, "district")]
    assert result[0]["count"] is None
    assert result[0]["count_suppressed"] is True


def test_market_context_falls_back_to_the_state_row(synthetic_market):
    # There is no Kanpur Nagar row, so the figure for the whole of Uttar Pradesh
    # is shown instead, and match_level says that is what it is.
    result = get_market_context("Uttar Pradesh", "Kanpur Nagar", "tailoring")

    assert result == [expected(synthetic_market, UP_TAILORING, "state")]
    assert result[0]["district"] == ""


def test_market_context_never_offers_another_districts_row(synthetic_market):
    # Lucknow has a tailoring row, but it is not evidence about Varanasi. The
    # state row is the only fallback.
    assert get_market_context("Uttar Pradesh", "Varanasi", "tailoring") == [
        expected(synthetic_market, UP_TAILORING, "state"),
    ]

    # With no state row for the category there is nothing honest to show, even
    # though another district of the same state has one.
    assert get_market_context("Uttar Pradesh", "Kanpur Nagar", "agriculture") == []
    assert get_market_context("Uttar Pradesh", "Kanpur Nagar", "handicrafts") == []
    assert get_market_context("Uttar Pradesh", "Kanpur Nagar", "services") == []
    assert get_market_context("Uttar Pradesh", "Lucknow", "services") == []


def test_market_context_with_no_district_gets_only_the_state_row(synthetic_market):
    # The unified analysis defaults district to "", and a district row always
    # names one, so an empty district can only ever be answered by a state row.
    assert get_market_context("Uttar Pradesh", "", "tailoring") == [
        expected(synthetic_market, UP_TAILORING, "state"),
    ]
    assert get_market_context("Uttar Pradesh", "", "agriculture") == []


def test_market_context_returns_empty_for_unknown_state_or_category(synthetic_market):
    assert get_market_context("Kerala", "Ernakulam", "tailoring") == []
    assert get_market_context("Uttar Pradesh", "Lucknow", "space tourism") == []


def test_market_rows_carry_no_local_context(synthetic_market):
    # The rows used to echo the reader's village, market type and customers
    # back as local_context. Nothing on the server needs them, so they are no
    # longer taken in or returned.
    result = get_market_context("Uttar Pradesh", "Lucknow", "tailoring")

    assert result == [expected(synthetic_market, LUCKNOW_TAILORING, "district")]
    assert all("local_context" not in row for row in result)


def test_a_row_with_no_scope_counts_as_a_district_row(synthetic_market):
    # Every row was a district row before `scope` existed.
    del synthetic_market[LUCKNOW_TAILORING]["scope"]

    assert get_market_context("Uttar Pradesh", "Lucknow", "tailoring") == [
        expected(synthetic_market, LUCKNOW_TAILORING, "district"),
    ]
    assert get_market_context("Uttar Pradesh", "Kanpur Nagar", "tailoring") == [
        expected(synthetic_market, UP_TAILORING, "state"),
    ]


def test_a_row_with_any_other_scope_is_never_returned(synthetic_market):
    synthetic_market[UP_TAILORING]["scope"] = "block"
    synthetic_market[LUCKNOW_TAILORING]["scope"] = "block"

    assert get_market_context("Uttar Pradesh", "Lucknow", "tailoring") == []
    assert get_market_context("Uttar Pradesh", "Kanpur Nagar", "tailoring") == []


# ---------------------------------------------------------------- the typed route

ROUTE_CASES = [
    ("Uttar Pradesh", "Lucknow", "agriculture"),
    ("Uttar Pradesh", "Lucknow", "tailoring"),
    ("Uttar Pradesh", "Lucknow", "handicrafts"),
    ("Uttar Pradesh", "Varanasi", "services"),
    ("Uttar Pradesh", "Kanpur Nagar", "tailoring"),
]


def _post_market(state, district, category):
    return client.post(
        "/api/market/context",
        json={"state": state, "district": district, "business_category": category},
    )


@pytest.mark.parametrize("state, district, category", ROUTE_CASES)
def test_the_market_route_returns_exactly_the_service_rows(synthetic_market, state, district, category):
    # A response_model FILTERS to its declared fields and, without exclude_unset,
    # adds a null for every field it declares that a row lacks. Either would make
    # the route disagree with the service, so the two are compared key for key.
    # Key ORDER is not compared: the model emits its own declaration order, and a
    # JSON object has none.
    response = _post_market(state, district, category)
    rows = get_market_context(state, district, category)

    assert response.status_code == 200
    body = response.json()

    assert body == rows
    assert [set(row) for row in body] == [set(row) for row in rows]
    assert [set(row["provenance"]) for row in body] == [set(row["provenance"]) for row in rows]


def test_the_route_cases_cover_every_synthetic_row(synthetic_market):
    returned = [
        (row["district"], row["business_category"], row.get("commodity_id"))
        for case in ROUTE_CASES
        for row in get_market_context(*case)
    ]
    every_row = [
        (row["district"], row["business_category"], row.get("commodity_id"))
        for row in synthetic_market
    ]

    assert sorted(returned) == sorted(every_row)


def test_the_market_route_does_not_invent_or_drop_nulls(synthetic_market):
    prices = _post_market("Uttar Pradesh", "Lucknow", "agriculture").json()
    wheat, potato = prices

    # A price row carries no count field at all, not a null one.
    for row in prices:
        assert not {"count", "count_suppressed", "share_percent", "district_total", "nic_classes"} & set(row)
        assert "note_code" not in row and "note" not in row
    assert "stale" not in wheat
    assert potato["stale"] is True
    assert potato["indicative_price"] == 26

    # The nulls a count row does carry mean something, so they arrive.
    suppressed = _post_market("Uttar Pradesh", "Lucknow", "handicrafts").json()[0]
    assert suppressed["count"] is None
    assert suppressed["share_percent"] is None

    aggregate = _post_market("Uttar Pradesh", "Varanasi", "services").json()[0]
    assert aggregate["share_percent"] is None
    assert aggregate["district_total"] is None
    assert aggregate["nic_classes"] == []
    assert aggregate["provenance"]["nic_map_version"] is None
    assert aggregate["provenance"]["period_start"] is None


def test_the_market_route_returns_404_when_nothing_matches(synthetic_market):
    response = _post_market("Kerala", "Ernakulam", "tailoring")

    assert response.status_code == 404
    assert response.json()["detail"] == (
        "No market data found for the requested location and business category."
    )


def test_the_market_route_returns_404_against_the_shipped_file():
    # No fixture: this reads the real market_data.json. No row can carry a
    # category that is not a category value, whatever the fetch has written.
    response = _post_market("Uttar Pradesh", "Lucknow", "space tourism")

    assert response.status_code == 404


def test_the_market_route_rejects_an_empty_field():
    response = client.post(
        "/api/market/context",
        json={"state": "Uttar Pradesh", "district": "", "business_category": "tailoring"},
    )

    assert response.status_code == 422


# ---------------------------------------------------------------- the unified analysis


def test_the_unified_analysis_passes_market_rows_through_unchanged(synthetic_market):
    response = client.post(
        "/api/analysis/run",
        json={
            "business_category": "tailoring",
            "state": "Uttar Pradesh",
            "district": "Lucknow",
            "village": "Khera",
            "market_type": "weekly",
            "customers": "Local families",
            "available_capital": 50000,
            "monthly_expenses": 15000,
            "expected_monthly_revenue": 30000,
            "monthly_emi": 2000,
            "initial_investment": 100000,
            "monthly_operating_expenses": 18000,
        },
    )

    assert response.status_code == 200
    assert response.json()["market_context"] == get_market_context(
        "Uttar Pradesh",
        "Lucknow",
        "tailoring",
    )
    assert response.json()["market_context"][0]["match_level"] == "district"
    # The village, market type and customers are accepted and ignored.
    assert all("local_context" not in row for row in response.json()["market_context"])


# ---------------------------------------------------------------- the shared cache


def test_a_response_cannot_poison_the_cached_market_rows(synthetic_market_file):
    """market_data.json is parsed once per process, so the rows are shared
    across every request. get_market_context copies each row, nested provenance
    and lists included, before adding match_level; without
    that, a consumer editing a returned row would rewrite the dataset for the
    rest of the process.
    """
    cached = load_json("market_data.json")

    # Not vacuous: the index carries the very objects load_json cached, so the
    # copy in get_market_context is the only thing between a caller and them.
    assert cached == synthetic_market_file
    assert market_service._market_index()[LUCKNOW_TAILORING][0] is cached[LUCKNOW_TAILORING]

    first = get_market_context("Uttar Pradesh", "Lucknow", "tailoring")
    assert first, "expected a district row to test against"

    first[0]["source"] = "POISON"
    first[0]["count"] = -1
    first[0]["provenance"]["licence"] = "POISON"
    first[0]["provenance"]["rows_dropped"]["unparseable"] = -1
    first[0]["nic_classes"].append("9999")

    second = get_market_context("Uttar Pradesh", "Lucknow", "tailoring")

    assert second == [expected(synthetic_rows(), LUCKNOW_TAILORING, "district")]
    assert load_json("market_data.json") is cached
    assert cached == synthetic_rows()
