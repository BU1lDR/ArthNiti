from app.services.scheme_service import (
    calculate_match_score,
    load_schemes,
    match_schemes,
)


def score_of(matches, name):
    """
    The score of one named scheme in a match list.

    Asserting on matches[0] stopped being meaningful once schemes.json held
    thirty rows: the top slot belongs to whichever scheme names the
    entrepreneur's own state, which is not the scheme any of these tests is
    about. Raises StopIteration if the scheme is missing, which is the failure
    these tests want.
    """
    return next(
        match["match_score"]
        for match in matches
        if match["name"] == name
    )


def test_load_schemes():
    schemes = load_schemes()

    assert len(schemes) == 30
    assert all("name" in scheme for scheme in schemes)

    # Every scheme must declare which layer of government runs it, because
    # /schemes groups the cards by it and an unlabelled scheme would fall into
    # the wrong group rather than fail loudly.
    levels = {scheme["level"] for scheme in schemes}

    assert levels == {
        "central",
        "state",
        "regional",
        "district",
        "sub_district",
        "block",
        "local_body",
    }


def test_every_scheme_carries_complete_translation_codes():
    """
    Checked over the whole file, not over a match list.

    The frontend translates a scheme's prose by looking up the code sitting
    beside each sentence, and pairs them by index. A scheme with four documents
    and three document codes therefore prints one document in English while the
    rest are translated -- which no existing test would catch, because a scheme
    that happens to match nothing never reaches a match list at all.
    """
    for scheme in load_schemes():
        where = scheme["name"]

        assert scheme["id"], where
        assert scheme["description_code"] == "sdata.%s.description" % scheme["id"], where
        assert scheme["support_type_code"] == "sdata.%s.support" % scheme["id"], where

        assert len(scheme["eligibility_codes"]) == len(scheme["eligibility_rules"]), where
        assert len(scheme["document_codes"]) == len(scheme["documents"]), where

        assert scheme["eligibility_rules"], where
        assert scheme["documents"], where
        assert scheme["business_categories"], where
        assert scheme["states"], where

        # Inverted on purpose, not deleted. The dataset must NOT carry a link
        # out to the scheme's own government portal, so this fails on the
        # field coming back rather than on it being absent -- including via a
        # regeneration from gen_schemes.py, which still holds the source URLs
        # as citations and must never emit them.
        assert "official_url" not in scheme, where


def test_scheme_ids_are_unique():
    ids = [scheme["id"] for scheme in load_schemes()]

    assert len(set(ids)) == len(ids)


def test_no_scheme_claims_a_category_the_matcher_cannot_reach():
    """
    Matching tests `scheme_category in user_phrase`, so a scheme category only
    ever matches if the entrepreneur's own wording contains it. Two words are
    therefore unreachable and must never appear in the file:

    - "livestock", because CATEGORY_SYNONYMS maps livestock -> dairy and not the
      reverse, so the dairy button would miss it.
    - "other", because for the Other button the frontend sends the text the user
      typed, never the literal string "other".
    """
    for scheme in load_schemes():
        words = [item.lower().strip() for item in scheme["business_categories"]]

        assert "livestock" not in words, scheme["name"]
        assert "other" not in words, scheme["name"]


def test_exact_category_match():
    schemes = load_schemes()

    pmmy = next(
        scheme
        for scheme in schemes
        if scheme["name"] == "Pradhan Mantri MUDRA Yojana (PMMY)"
    )

    score, reasons = calculate_match_score(
        scheme=pmmy,
        business_category="dairy",
        state="Uttar Pradesh",
    )

    # 90 rather than 100: PMMY is listed for ALL states, and a nationwide
    # scheme now scores below one run for this state in particular.
    assert score == 90
    assert len(reasons) == 2


def test_category_matching_is_case_insensitive():
    schemes = load_schemes()

    pmmy = next(
        scheme
        for scheme in schemes
        if scheme["name"] == "Pradhan Mantri MUDRA Yojana (PMMY)"
    )

    score, _ = calculate_match_score(
        scheme=pmmy,
        business_category="DAIRY",
        state="Uttar Pradesh",
    )

    assert score == 90


def test_category_matching_ignores_spaces():
    schemes = load_schemes()

    pmmy = next(
        scheme
        for scheme in schemes
        if scheme["name"] == "Pradhan Mantri MUDRA Yojana (PMMY)"
    )

    score, _ = calculate_match_score(
        scheme=pmmy,
        business_category="  dairy  ",
        state="Uttar Pradesh",
    )

    assert score == 90


def test_non_matching_category_returns_zero():
    schemes = load_schemes()

    pmmy = next(
        scheme
        for scheme in schemes
        if scheme["name"] == "Pradhan Mantri MUDRA Yojana (PMMY)"
    )

    score, reasons = calculate_match_score(
        scheme=pmmy,
        business_category="textile",
        state="Uttar Pradesh",
    )

    assert score == 0
    assert reasons == []


def test_match_schemes_returns_dairy_scheme():
    matches = match_schemes(
        business_category="dairy",
        state="Uttar Pradesh",
    )

    assert matches
    assert score_of(matches, "Pradhan Mantri MUDRA Yojana (PMMY)") == 90


def test_category_matching_supports_business_phrases():
    matches = match_schemes(
        business_category="dairy farming",
        state="Uttar Pradesh",
    )

    assert matches
    assert score_of(matches, "Pradhan Mantri MUDRA Yojana (PMMY)") == 90


def test_unrelated_category_still_returns_no_match():
    matches = match_schemes(
        business_category="textile",
        state="Uttar Pradesh",
    )

    assert matches == []


def test_category_matching_handles_services():
    matches = match_schemes(
        business_category="services",
        state="Uttar Pradesh",
    )

    assert matches
    assert score_of(
        matches,
        "Prime Minister's Employment Generation Programme (PMEGP)"
    ) == 90