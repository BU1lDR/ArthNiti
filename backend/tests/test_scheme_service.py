from app.services.scheme_service import (
    LEVEL_RANK,
    calculate_match_score,
    level_rank,
    load_schemes,
    match_schemes,
    serves_state,
)


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
    # A scheme that names this state gets the stronger sentence and the full 40.
    assert "covers your state in particular" in reasons[1]


def test_all_states_scores_below_a_state_specific_scheme():
    scheme = make_scheme(
        categories=["Dairy"],
        states=["all"],
    )

    score, reasons = calculate_match_score(
        scheme=scheme,
        business_category="Dairy",
        state="Delhi",
    )

    # 90, not 100. A nationwide scheme is a real match but a weaker lead than
    # one run for the entrepreneur's own state, and with thirty schemes in the
    # file a flat +40 for both put nearly every match on exactly 100.
    assert score == 90
    assert len(reasons) == 2
    assert "available in your state" in reasons[1]


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


# --- availability by state -------------------------------------------------
# The scorer still gives a wrong-state scheme 60 (see the test above): it
# explains fit and knows nothing about what should be offered. match_schemes
# is what drops it, so these two must be tested separately or the split stops
# being real.


def test_serves_state_accepts_all_and_the_named_state():
    assert serves_state(make_scheme(states=["all"]), "Kerala") is True
    assert serves_state(make_scheme(states=["ALL"]), "Kerala") is True
    assert serves_state(make_scheme(states=["Kerala"]), "Kerala") is True
    assert serves_state(make_scheme(states=[" Kerala "]), "  kerala  ") is True


def test_serves_state_rejects_a_state_the_scheme_does_not_list():
    assert serves_state(make_scheme(states=["Uttar Pradesh"]), "Kerala") is False


def test_serves_state_treats_an_empty_list_as_everywhere():
    # A scheme with no states at all is a data omission, not a restriction.
    # Reading it as "nowhere" would silently hide the scheme from every user.
    assert serves_state({"states": []}, "Kerala") is True
    assert serves_state({}, "Kerala") is True


def test_state_only_schemes_are_not_offered_in_another_state():
    up_only = [
        scheme["name"]
        for scheme in load_schemes()
        if scheme["states"] == ["Uttar Pradesh"]
    ]

    assert up_only, "expected the file to carry some Uttar Pradesh-only schemes"

    offered = {
        match["name"]
        for match in match_schemes(business_category="tailoring", state="Kerala")
    }

    for name in up_only:
        assert name not in offered


def test_a_state_scheme_outranks_a_nationwide_one():
    matches = match_schemes(business_category="tailoring", state="Uttar Pradesh")

    assert matches
    # The entrepreneur's own state comes first, which is the whole point of
    # scoring "ALL" below a named state.
    assert matches[0]["match_score"] == 100
    assert matches[0]["level"] == "state"


# --- level -----------------------------------------------------------------


def test_level_rank_orders_outward_from_the_centre():
    ranks = [level_rank(level) for level in LEVEL_RANK]

    assert ranks == sorted(ranks)
    assert level_rank("central") < level_rank("district")
    assert level_rank("district") < level_rank("local_body")


def test_level_rank_sorts_an_unknown_level_last_instead_of_raising():
    assert level_rank("ward_committee") == len(LEVEL_RANK)
    assert level_rank(None) == level_rank("central")


def test_matches_are_sorted_by_score_then_level():
    matches = match_schemes(business_category="tailoring", state="Uttar Pradesh")

    keys = [
        (-match["match_score"], level_rank(match["level"]), match["name"])
        for match in matches
    ]

    assert keys == sorted(keys)


def test_every_matched_scheme_reports_a_known_level():
    matches = match_schemes(business_category="tailoring", state="Uttar Pradesh")

    assert matches

    for match in matches:
        assert match["level"] in LEVEL_RANK


def test_the_seven_levels_are_all_reachable_from_real_input():
    """
    Every tier the UI renders a heading for must be reachable, or a group box
    on /schemes can never appear and the tier is decoration.
    """
    reached = set()

    for category, state in [
        ("tailoring", "Uttar Pradesh"),
        ("handicrafts", "Assam"),
        ("dairy", "Sikkim"),
        ("food processing", "Kerala"),
        ("trading", "Karnataka"),
        ("agriculture", "Maharashtra"),
        ("services", "West Bengal"),
        ("manufacturing", "Tamil Nadu"),
    ]:
        for match in match_schemes(business_category=category, state=state):
            reached.add(match["level"])

    assert reached == set(LEVEL_RANK)