from app.services.scheme_service import (
    LEVEL_RANK,
    calculate_match_score,
    level_rank,
    load_schemes,
    match_schemes,
    serves_location,
    serves_state,
)

# The exact strings the nine buttons on /business send, minus "other" (which
# sends whatever the entrepreneur typed). Several tests below sweep these,
# because a scheme is only real if one of these values can reach it.
BUTTON_CATEGORIES = [
    "retail",
    "food processing",
    "handicrafts",
    "tailoring",
    "agriculture",
    "dairy",
    "services",
    "manufacturing",
]

# The three values /location sends as location_type.
LOCATION_TYPES = ["rural", "semi-urban", "urban"]


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


# --- availability by kind of place -----------------------------------------
# The other half of availability, and the half that was missing: /location has
# always collected rural / semi-urban / urban and FinancePage has always sent it
# as location_type, but match_schemes ignored the argument entirely.


def test_serves_location_accepts_all_and_the_named_kind_of_place():
    assert serves_location({"location_types": ["ALL"]}, "rural") is True
    assert serves_location({"location_types": ["all"]}, "urban") is True
    assert serves_location({"location_types": ["rural"]}, "rural") is True
    assert serves_location({"location_types": [" Rural "]}, "  RURAL ") is True


def test_serves_location_rejects_a_kind_of_place_the_scheme_does_not_list():
    urban_only = {"location_types": ["semi-urban", "urban"]}

    assert serves_location(urban_only, "rural") is False
    assert serves_location(urban_only, "urban") is True


def test_serves_location_treats_a_missing_field_as_everywhere():
    # Same reasoning as serves_state: an absent list is a data omission, not a
    # restriction. Reading it as "nowhere" would hide the scheme from everyone.
    assert serves_location({"location_types": []}, "rural") is True
    assert serves_location({}, "rural") is True


def test_serves_location_does_not_filter_when_the_caller_did_not_ask():
    # /api/schemes/match collects no location_type. Filtering on a value nobody
    # supplied would silently drop every location-specific scheme from it.
    assert serves_location({"location_types": ["rural"]}, "") is True
    assert serves_location({"location_types": ["urban"]}, None) is True


def test_a_scheme_is_never_offered_outside_the_places_it_names():
    """The defect this gate closes, stated as data rather than as an example.

    Every location-specific scheme in the file must appear for exactly the
    location types it declares and no others. PM SVANidhi's own first rule is
    "the activity must be in a town or city area covered by an urban local
    body", and it was being offered to a village entrepreneur at 90% — a wasted
    trip to an office that cannot enrol them.
    """
    gated = {
        scheme["id"]: (
            [item.lower() for item in scheme.get("location_types", ["ALL"])],
            scheme["states"],
        )
        for scheme in load_schemes()
        if [item.lower() for item in scheme.get("location_types", ["ALL"])]
        != ["all"]
    }

    assert gated, "expected the file to carry some location-specific schemes"

    for scheme_id, (allowed, states) in gated.items():
        # A scheme can be gated on both axes — the Vibrant Villages Programme is
        # rural AND border-block-only — so the state has to be one the scheme
        # actually serves, or a state-gate miss would read as a location-gate
        # miss and this test would be asserting the wrong thing.
        state = "Uttar Pradesh" if states == ["ALL"] else states[0]

        for location_type in LOCATION_TYPES:
            offered = {
                match["scheme_id"]
                for category in BUTTON_CATEGORIES
                for match in match_schemes(
                    business_category=category,
                    state=state,
                    location_type=location_type,
                )
            }

            assert (scheme_id in offered) == (location_type in allowed), (
                f"{scheme_id} declares {allowed} but "
                f"{'appeared' if scheme_id in offered else 'was missing'} "
                f"for {location_type} in {state}"
            )


def test_the_seven_levels_stay_reachable_for_every_kind_of_place():
    """The location gate must not empty a tier.

    Dropping a scheme is invisible to the reader, so a gate that took the last
    scheme out of a tier would silently delete a /schemes group box for every
    urban entrepreneur and nothing would report it.
    """
    for location_type in LOCATION_TYPES:
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
            for match in match_schemes(
                business_category=category,
                state=state,
                location_type=location_type,
            ):
                reached.add(match["level"])

        assert reached == set(LEVEL_RANK), (
            f"{location_type} cannot reach {sorted(set(LEVEL_RANK) - reached)}"
        )


# --- reachability of the dataset itself ------------------------------------


def test_every_scheme_in_the_file_is_reachable_from_a_category_button():
    """A scheme no button can reach is decoration in a file, not an offer.

    test_no_scheme_claims_a_category_the_matcher_cannot_reach guards the
    matcher's *direction*; this guards the *dataset*. They fail on different
    mistakes: a scheme can claim only categories that are individually
    well-formed and still be unreachable from every button.

    Note what this test deliberately does NOT catch, since assuming otherwise is
    how the same class of bug returns: it asks only whether *some* button reaches
    each scheme, so a scheme reachable from the wrong button passes. The
    National Livestock Mission was reachable here all along — via Agriculture,
    because it claims ["poultry", "agriculture"] — while the button actually
    labelled "Livestock / Dairy" missed it. Verified by removing the
    dairy -> poultry bridge and watching this test stay green while
    test_the_livestock_button_reaches_the_national_livestock_mission failed.
    That per-button pin is the one that catches it.
    """
    reachable = set()

    for category in BUTTON_CATEGORIES:
        for location_type in LOCATION_TYPES:
            for state in [
                "Uttar Pradesh",
                "Assam",
                "Kerala",
                "Maharashtra",
                "Tamil Nadu",
                "Karnataka",
                "West Bengal",
                "Sikkim",
            ]:
                for match in match_schemes(
                    business_category=category,
                    state=state,
                    location_type=location_type,
                ):
                    reachable.add(match["scheme_id"])

    all_ids = {scheme["id"] for scheme in load_schemes()}

    assert all_ids - reachable == set()


def test_the_livestock_button_reaches_the_national_livestock_mission():
    # Pinned by name rather than by count, because the interesting failure is
    # this specific card going missing, not the total moving.
    offered = {
        match["scheme_id"]
        for match in match_schemes(
            business_category="dairy",
            state="Uttar Pradesh",
            location_type="rural",
        )
    }

    assert "nlm" in offered


def test_no_scheme_is_offered_for_work_its_own_rules_exclude():
    """Stand-Up India's fourth eligibility rule, printed on its own card, reads
    "Activities allied to agriculture, such as dairy, poultry and food
    processing, are covered; crop cultivation on its own is not." It claimed the
    category "agriculture" anyway, so a crop farmer was shown a card whose match
    reason said their kind of work was supported directly above the rule saying
    it is not. The categories now follow the rule.
    """
    crop_farmer = {
        match["scheme_id"]
        for match in match_schemes(
            business_category="agriculture",
            state="Uttar Pradesh",
            location_type="rural",
        )
    }
    allied = {
        match["scheme_id"]
        for match in match_schemes(
            business_category="dairy",
            state="Uttar Pradesh",
            location_type="rural",
        )
    }

    assert "standupindia" not in crop_farmer
    # And it must not have been dropped altogether — it does serve the allied
    # activities its rule names.
    assert "standupindia" in allied

def test_a_response_cannot_poison_the_cached_scheme_dataset():
    """schemes.json is parsed once per process and the parsed lists are shared, so
    a response that carried one of them by reference would let any consumer that
    mutated it corrupt the dataset for every later request — with the file on disk
    still correct and a restart making the symptom vanish. match_schemes copies the
    four list fields for exactly this reason.

    This is the hazard the caching introduced, so it is pinned rather than trusted.
    """
    LIST_FIELDS = ("eligibility_rules", "documents", "eligibility_codes", "document_codes")

    first = match_schemes(
        business_category="tailoring",
        state="Uttar Pradesh",
        location_type="rural",
    )

    for field in LIST_FIELDS:
        first[0][field].append("POISON")

    second = match_schemes(
        business_category="tailoring",
        state="Uttar Pradesh",
        location_type="rural",
    )

    for field in LIST_FIELDS:
        assert "POISON" not in second[0][field], field

    # And the dataset the loader hands out is itself untouched.
    assert not any(
        "POISON" in scheme[field]
        for scheme in load_schemes()
        for field in LIST_FIELDS
    )
