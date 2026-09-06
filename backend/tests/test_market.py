from app.services.market_service import get_market_context


def test_market_context_returns_matching_data():
    result = get_market_context(
        "Uttar Pradesh",
        "Lucknow",
        "dairy",
    )

    assert len(result) == 1
    assert result[0]["indicative_price"] == 55.0
    assert result[0]["local_context"] == {
        "village": "",
        "market_type": "",
        "customers": "",
    }


def test_market_context_is_case_insensitive():
    result = get_market_context(
        "uttar pradesh",
        "LUCKNOW",
        "DAIRY",
    )

    assert len(result) == 1
    assert result[0]["business_category"] == "dairy"


def test_market_context_falls_back_to_the_same_state():
    # We hold no Kanpur row, but state-level dairy data is still more useful to
    # a Kanpur entrepreneur than an empty section — as long as it says so.
    result = get_market_context(
        "Uttar Pradesh",
        "Kanpur",
        "dairy",
    )

    assert len(result) > 0
    assert all(item["match_level"] == "state" for item in result)
    assert all(item["district"] != "Kanpur" for item in result)


def test_market_context_prefers_the_exact_district():
    result = get_market_context(
        "Uttar Pradesh",
        "Lucknow",
        "dairy",
    )

    assert [item["district"] for item in result] == ["Lucknow"]
    assert result[0]["match_level"] == "district"


def test_market_context_returns_empty_for_unknown_state_or_category():
    assert get_market_context("Kerala", "Kochi", "dairy") == []
    assert get_market_context("Uttar Pradesh", "Lucknow", "space tourism") == []


def test_market_context_includes_local_context():
    result = get_market_context(
        "Uttar Pradesh",
        "Lucknow",
        "dairy",
        village="Khera",
        market_type="weekly",
        customers="Local families",
    )

    assert len(result) == 1
    assert result[0]["local_context"] == {
        "village": "Khera",
        "market_type": "weekly",
        "customers": "Local families",
    }