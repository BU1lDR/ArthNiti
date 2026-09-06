from app.services.scheme_service import calculate_match_score, match_schemes


def make_scheme(
    categories=None,
    states=None,
    name="Test Scheme",
):
    return {
        "name": name,
        "description": "Test scheme description",
        "support_type": "Financial support",
        "business_categories": categories or ["Dairy"],
        "states": states or ["Delhi"],
        "eligibility_rules": ["Test eligibility rule"],
        "documents": ["Test document"],
        "official_url": "https://example.com",
        "last_verified": "2026-01-01",
    }


def test_matching_business_category_gives_60_points():
    scheme = make_scheme(
        categories=["Dairy"],
        states=["Mumbai"],
    )

    score, reasons = calculate_match_score(
        scheme=scheme,
        business_category="Dairy",
        state="Delhi",
    )

    assert score == 60
    assert len(reasons) == 1
    assert "supported by this scheme" in reasons[0]


def test_matching_category_and_state_gives_100_points():
    scheme = make_scheme(
        categories=["Dairy"],
        states=["Delhi"],
    )

    score, reasons = calculate_match_score(
        scheme=scheme,
        business_category="Dairy",
        state="Delhi",
    )

    assert score == 100
    assert len(reasons) == 2
    assert "supported by this scheme" in reasons[0]
    assert "available in your state" in reasons[1]


def test_all_states_gives_full_score():
    scheme = make_scheme(
        categories=["Dairy"],
        states=["all"],
    )

    score, reasons = calculate_match_score(
        scheme=scheme,
        business_category="Dairy",
        state="Delhi",
    )

    assert score == 100
    assert len(reasons) == 2


def test_non_matching_category_gets_zero_score():
    scheme = make_scheme(
        categories=["Agriculture"],
        states=["Delhi"],
    )

    score, reasons = calculate_match_score(
        scheme=scheme,
        business_category="Dairy",
        state="Delhi",
    )

    assert score == 0
    assert reasons == []


def test_category_matching_is_case_insensitive():
    scheme = make_scheme(
        categories=["Dairy"],
        states=["Delhi"],
    )

    score, reasons = calculate_match_score(
        scheme=scheme,
        business_category="DAIRY",
        state="DELHI",
    )

    assert score == 100
    assert len(reasons) == 2


def test_category_and_state_matching_ignore_whitespace():
    scheme = make_scheme(
        categories=[" Dairy "],
        states=[" Delhi "],
    )

    score, reasons = calculate_match_score(
        scheme=scheme,
        business_category="  Dairy  ",
        state="  Delhi  ",
    )

    assert score == 100


def test_matching_category_with_wrong_state_returns_60():
    scheme = make_scheme(
        categories=["Dairy"],
        states=["Punjab"],
    )

    score, reasons = calculate_match_score(
        scheme=scheme,
        business_category="Dairy",
        state="Delhi",
    )

    assert score == 60
    assert len(reasons) == 1


def test_match_schemes_returns_only_matching_categories():
    matches = match_schemes(
        business_category="Dairy",
        state="Delhi",
    )

    assert isinstance(matches, list)

    for match in matches:
        assert match["match_score"] > 0
        assert "name" in match
        assert "description" in match
        assert "support_type" in match
        assert "match_reasons" in match
        assert "eligibility_rules" in match
        assert "documents" in match
        assert "official_url" in match
        assert "last_verified" in match


def test_match_schemes_are_sorted_by_score():
    matches = match_schemes(
        business_category="Dairy",
        state="Delhi",
    )

    scores = [match["match_score"] for match in matches]

    assert scores == sorted(scores, reverse=True)


def test_nonexistent_category_returns_empty_list():
    matches = match_schemes(
        business_category="CompletelyUnknownBusiness",
        state="Delhi",
    )

    assert matches == []