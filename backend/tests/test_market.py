from app.services.market_service import get_market_context


def test_market_context_returns_matching_data():
    result = get_market_context(
        "Uttar Pradesh",
        "Lucknow",
        "dairy",
    )

    assert len(result) == 1
    assert result[0]["state"] == "Uttar Pradesh"
    assert result[0]["district"] == "Lucknow"
    assert result[0]["business_category"] == "dairy"
    assert result[0]["indicative_price"] == 55.0


def test_market_context_is_case_insensitive():
    result = get_market_context(
        "uttar pradesh",
        "LUCKNOW",
        "DAIRY",
    )

    assert len(result) == 1
    assert result[0]["indicative_price"] == 55.0


def test_market_context_returns_empty_for_unknown_data():
    result = get_market_context(
        "Uttar Pradesh",
        "Kanpur",
        "dairy",
    )

    assert result == []
