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


def test_market_context_returns_empty_for_unknown_data():
    result = get_market_context(
        "Uttar Pradesh",
        "Kanpur",
        "dairy",
    )

    assert result == []


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