"""
Egg prices in the market context, on synthetic rows.

necc_egg_prices.json holds whatever the last run of tools/fetch-necc-prices.mjs
wrote, so every test that needs a row brings its own from necc_fixtures.py and
stays independent of the fetch: a state-scope row for Delhi, a stale suggested
price in Namakkal and a prevailing price in Lucknow, shaped exactly as the fetch
writes them. The indexes in necc_fixtures name them.

The egg prices live in their own file and are merged into the market data by
load_market_data, so these tests pin four things:

  - the merge is the market rows then the egg rows, and changes neither;
  - the lookup stays honest for them: a district's own centre first, a figure for
    the whole state only when the centre IS the whole state's (Delhi), and never
    another district's price;
  - an egg price is returned for poultry and for nothing else, and nothing else
    changes for the other kinds of business;
  - the typed route and the unified analysis carry every word of a row through,
    the clarification NECC asked to travel with its prices included.
"""

import copy

import pytest
from fastapi.testclient import TestClient

from app.core.data_loader import load_json
from app.main import app
from app.services import market_service
from app.services.market_service import get_market_context
from market_fixtures import synthetic_rows
from necc_fixtures import (  # noqa: F401
    CLARIFICATION,
    DELHI_EGG,
    LUCKNOW_EGG,
    NAMAKKAL_EGG,
    UNIT_READING,
    necc_market,
    necc_market_file,
    necc_rows,
)
from plan_fixtures import analyse
from app.services.plan_service import build_context


client = TestClient(app)

# In the necc_market fixture the egg rows come after the market rows.
FIRST_EGG = len(synthetic_rows())


def expected(rows, index, match_level):
    return {**rows[FIRST_EGG + index], "match_level": match_level}


# ---------------------------------------------------------------- the merge


def test_the_market_data_is_the_market_rows_then_the_egg_rows(necc_market_file):
    market, necc = necc_market_file

    assert market_service.load_market_data() == market + necc


def test_the_merged_rows_are_the_cached_objects_not_copies(necc_market_file):
    # get_market_context copies a row before it adds anything to it, so the merge
    # may share the cached rows. If it copied them, every request would pay for it.
    merged = market_service.load_market_data()
    cached = load_json("market_data.json") + load_json("necc_egg_prices.json")

    assert len(merged) == len(cached)
    assert all(a is b for a, b in zip(merged, cached))


def test_the_shipped_market_data_is_the_market_file_then_the_egg_file():
    market, eggs = load_json("market_data.json"), load_json("necc_egg_prices.json")

    assert eggs, "necc_egg_prices.json has no rows"
    assert market_service.load_market_data() == market + eggs


def test_each_shipped_file_keeps_to_its_own_rows():
    # market_data.json is written by the frozen data.gov.in fetch, which has no
    # poultry; the egg file by the NECC fetch, which writes nothing else.
    for row in load_json("market_data.json"):
        assert row["metric"] != "egg_price" and row["business_category"] != "poultry"
    for row in load_json("necc_egg_prices.json"):
        assert row["metric"] == "egg_price" and row["business_category"] == "poultry"


# ---------------------------------------------------------------- the lookup


def test_a_poultry_reader_gets_the_egg_price_of_their_own_district(necc_market):
    result = get_market_context("Uttar Pradesh", "Lucknow", "poultry")

    assert result == [expected(necc_market, LUCKNOW_EGG, "district")]


def test_the_egg_lookup_is_case_insensitive(necc_market):
    result = get_market_context("  uttar pradesh", "LUCKNOW ", "Poultry")

    assert result == [expected(necc_market, LUCKNOW_EGG, "district")]


def test_a_union_territory_with_one_centre_gets_it_as_a_figure_for_the_whole_state(necc_market):
    # Delhi has one centre and no district rows, so every district of Delhi, and
    # an unanswered one, is given the same row, labelled as a figure for the state.
    for district in ("New Delhi", "South Delhi", ""):
        result = get_market_context("Delhi", district, "poultry")

        assert result == [expected(necc_market, DELHI_EGG, "state")], district
        assert result[0]["district"] == ""


def test_an_egg_price_is_never_offered_from_another_district(necc_market):
    # Lucknow and Namakkal have a centre; nothing else in their states does, and a
    # centre's price is not evidence about the next district.
    assert get_market_context("Uttar Pradesh", "Kanpur Nagar", "poultry") == []
    assert get_market_context("Uttar Pradesh", "Varanasi", "poultry") == []
    assert get_market_context("Uttar Pradesh", "", "poultry") == []
    assert get_market_context("Tamil Nadu", "Salem", "poultry") == []
    assert get_market_context("Tamil Nadu", "", "poultry") == []


def test_a_state_with_no_centre_gets_nothing(necc_market):
    assert get_market_context("Kerala", "Ernakulam", "poultry") == []


def test_the_delhi_row_is_not_given_to_a_reader_in_another_state(necc_market):
    assert get_market_context("Haryana", "Gurugram", "poultry") == []


@pytest.mark.parametrize(
    "category",
    ["agriculture", "dairy", "food processing", "handicrafts", "manufacturing", "retail", "services", "tailoring", "other"],
)
def test_no_egg_price_is_returned_for_any_other_kind_of_business(necc_market, category):
    for row in necc_market[FIRST_EGG:]:
        got = get_market_context(row["state"], row["district"] or "New Delhi", category)

        assert all(r["metric"] != "egg_price" for r in got), (category, row["provenance"]["centre_label"])


def test_the_other_kinds_of_business_see_the_same_rows_with_or_without_the_egg_rows(necc_market):
    with_eggs = [get_market_context("Uttar Pradesh", "Lucknow", c) for c in ("agriculture", "tailoring", "handicrafts")]

    assert [len(rows) for rows in with_eggs] == [2, 1, 1]
    assert all(row["metric"] != "egg_price" for rows in with_eggs for row in rows)


# ---------------------------------------------------------------- the typed route

ROUTE_CASES = [
    ("Uttar Pradesh", "Lucknow", "poultry"),
    ("Tamil Nadu", "Namakkal", "poultry"),
    ("Delhi", "New Delhi", "poultry"),
]


def _post_market(state, district, category):
    return client.post(
        "/api/market/context",
        json={"state": state, "district": district, "business_category": category},
    )


def _egg(state, district):
    """The one egg row the market route gives for a place, after it answers 200."""
    response = _post_market(state, district, "poultry")

    assert response.status_code == 200, response.text
    (row,) = response.json()
    return row


@pytest.mark.parametrize("state, district, category", ROUTE_CASES)
def test_the_market_route_returns_exactly_the_service_rows_for_an_egg_price(necc_market, state, district, category):
    # A response_model FILTERS to its declared fields: an egg-row key the model
    # does not declare would vanish here without a word. So the route and the
    # service are compared key for key, provenance included.
    response = _post_market(state, district, category)
    rows = get_market_context(state, district, category)

    assert response.status_code == 200
    body = response.json()

    assert body == rows
    assert [set(row) for row in body] == [set(row) for row in rows]
    assert [set(row["provenance"]) for row in body] == [set(row["provenance"]) for row in rows]


def test_the_egg_route_cases_cover_every_synthetic_egg_row(necc_market):
    returned = [row["provenance"]["centre_label"] for case in ROUTE_CASES for row in get_market_context(*case)]
    every_row = [row["provenance"]["centre_label"] for row in necc_market[FIRST_EGG:]]

    assert sorted(returned) == sorted(every_row)


def test_the_market_route_keeps_everything_an_egg_row_says(necc_market):
    lucknow = _egg("Uttar Pradesh", "Lucknow")

    assert lucknow["indicative_price"] == 6.4
    assert lucknow["unit"] == "egg"
    assert lucknow["metric"] == "egg_price"
    assert lucknow["price_kind"] == "prevailing"
    assert lucknow["centre"] == "Lucknow"
    assert lucknow["match_level"] == "district"
    # The words NECC asked to travel with its prices, and our reading of its unit.
    assert lucknow["provenance"]["clarification"] == CLARIFICATION
    assert lucknow["provenance"]["unit_reading"] == UNIT_READING
    assert lucknow["provenance"]["published_value"] == 640


def test_the_market_route_says_stale_for_an_egg_price_whether_it_is_or_not(necc_market):
    # A mandi row carries `stale` only when it is true. An egg row always carries
    # it, so a False has to arrive as a False and not be dropped as unset.
    fresh = _egg("Uttar Pradesh", "Lucknow")
    old = _egg("Tamil Nadu", "Namakkal")

    assert fresh["stale"] is False
    assert old["stale"] is True
    assert old["price_kind"] == "suggested"


def test_the_market_route_labels_the_delhi_row_as_a_figure_for_the_state(necc_market):
    delhi = _egg("Delhi", "New Delhi")

    assert delhi["match_level"] == "state"
    assert delhi["scope"] == "state"
    assert delhi["district"] == ""
    assert delhi["centre"] == "Delhi"


def test_an_egg_row_carries_none_of_the_mandi_or_count_fields(necc_market):
    for state, district, _ in ROUTE_CASES:
        row = _egg(state, district)

        assert not {
            "commodity",
            "commodity_id",
            "price_low",
            "price_high",
            "n_days",
            "n_markets",
            "count",
            "count_suppressed",
            "share_percent",
            "district_total",
            "nic_classes",
            "note_code",
            "note",
        } & set(row)


# ---------------------------------------------------------------- the unified analysis


def _analysis_request(category, district):
    return {
        "business_category": category,
        "state": "Uttar Pradesh",
        "district": district,
        "available_capital": 50000,
        "monthly_expenses": 15000,
        "expected_monthly_revenue": 30000,
        "monthly_emi": 2000,
        "initial_investment": 100000,
        "monthly_operating_expenses": 18000,
    }


def test_the_unified_analysis_passes_an_egg_row_through_unchanged(necc_market):
    response = client.post("/api/analysis/run", json=_analysis_request("poultry", "Lucknow"))

    assert response.status_code == 200
    market = response.json()["market_context"]

    assert market == get_market_context("Uttar Pradesh", "Lucknow", "poultry")
    assert [row["match_level"] for row in market] == ["district"]
    assert market[0]["indicative_price"] == 6.4
    assert market[0]["provenance"]["clarification"] == CLARIFICATION


def test_the_unified_analysis_has_no_egg_row_for_a_district_without_a_centre(necc_market):
    response = client.post("/api/analysis/run", json=_analysis_request("poultry", "Kanpur Nagar"))

    assert response.status_code == 200
    assert response.json()["market_context"] == []


# ---------------------------------------------------------------- what the model is told


def test_an_egg_row_adds_nothing_to_what_the_plan_writer_is_told():
    # The plan route sends Meta no figure and no place. An egg price is both, so
    # build_context must not read it. This runs on the shipped file: Lucknow has
    # a centre, so the row is there to be ignored.
    answers, analysis = analyse(business_category="poultry")

    assert any(row["metric"] == "egg_price" for row in analysis["market_context"]), "no egg row to ignore"

    without = copy.deepcopy(analysis)
    without["market_context"] = [r for r in without["market_context"] if r["metric"] != "egg_price"]

    assert build_context(answers, analysis) == build_context(answers, without)


# ---------------------------------------------------------------- the shipped file


def test_every_shipped_egg_row_is_what_the_lookup_gives_for_its_place():
    # Not vacuous: the file has rows. A district row answers its own district; a
    # state row answers any district of its state, labelled as the whole state's.
    rows = load_json("necc_egg_prices.json")
    assert rows

    for row in rows:
        district = row["district"] or "Anywhere in the state"
        level = "district" if row["scope"] == "district" else "state"

        assert get_market_context(row["state"], district, "poultry") == [{**row, "match_level": level}], row["centre"]


# ---------------------------------------------------------------- the shared cache


def test_a_response_cannot_poison_the_cached_egg_rows(necc_market_file):
    """necc_egg_prices.json is parsed once per process, so its rows are shared
    across every request, exactly like market_data.json's. get_market_context
    copies each row, nested provenance included, before adding match_level;
    without that, a consumer editing a returned row would rewrite the clarification
    NECC asked to travel with its prices, for the rest of the process.
    """
    market, necc = necc_market_file
    cached = load_json("necc_egg_prices.json")

    # Not vacuous: the index carries the very objects load_json cached, so the
    # copy in get_market_context is the only thing between a caller and them.
    assert cached == necc
    assert market_service._market_index()[len(market) + LUCKNOW_EGG][0] is cached[LUCKNOW_EGG]

    first = get_market_context("Uttar Pradesh", "Lucknow", "poultry")
    assert first, "expected a district row to test against"

    first[0]["source"] = "POISON"
    first[0]["indicative_price"] = -1
    first[0]["provenance"]["clarification"] = "POISON"
    first[0]["provenance"]["unit_reading"] = "POISON"

    second = get_market_context("Uttar Pradesh", "Lucknow", "poultry")

    assert second == [{**necc_rows()[LUCKNOW_EGG], "match_level": "district"}]
    assert load_json("necc_egg_prices.json") is cached
    assert cached == necc_rows()
