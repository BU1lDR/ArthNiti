from functools import lru_cache

from app.core.data_loader import load_json


# The scheme documents use their own vocabulary — "trading", "manufacturing",
# "services" — while the app asks the entrepreneur to tap a plain-language
# button. Without this bridge a village shop picks "retail" and matches nothing,
# because no scheme ever says "retail". This translates wording only; it never
# widens a scheme's real eligibility. That is why plain "agriculture" maps to
# nothing: PMEGP and PMMY cover allied activities such as dairy, poultry and
# beekeeping, not crop farming itself.
CATEGORY_SYNONYMS = {
    "retail": ("trading",),
    "shop": ("trading",),
    "kirana": ("trading",),
    "handicraft": ("manufacturing",),
    "handicrafts": ("manufacturing",),
    "tailoring": ("manufacturing", "services"),
    "livestock": ("dairy",),
    # The button reads "Livestock / Dairy" but sends the single word "dairy", so
    # the phrase set for it has to cover the livestock half of its own label.
    # Every scheme in the file that says "poultry" also says "dairy" — except the
    # National Livestock Mission, which says "poultry" and "agriculture". So the
    # one scheme the Livestock button missed was the livestock mission itself,
    # and this entry is the only thing it adds anywhere in the dataset.
    #
    # This is wording, not eligibility: NLM's own printed rules name poultry,
    # sheep and goat, piggery and fodder, so a dairy-cattle keeper who sees the
    # card reads what it covers, the same way every broad scheme here works.
    "dairy": ("poultry",),
}


# Rural, semi-urban or urban. Mirrors `states` above: most schemes are open
# everywhere and carry ["ALL"], and only a scheme whose OWN eligibility text
# names a settlement type is restricted here.
#
# Read with .get(...) for the same reason as `level`: a scheme dict written in a
# test before this field existed must still match rather than vanish.
DEFAULT_LOCATION_TYPES = ("ALL",)


# Which layer of government runs the scheme. Ordered outward from the national
# government to the village office, which is the order /schemes groups them in
# and the order this file sorts equal scores by — so a nationwide scheme is
# offered before the Gram Panchayat counter, not the other way round.
#
# Read with .get(level, ...) everywhere: the level is a late addition and a
# hand-written scheme dict in a test may not carry one.
LEVEL_RANK = {
    "central": 0,
    "state": 1,
    "regional": 2,
    "district": 3,
    "sub_district": 4,
    "block": 5,
    "local_body": 6,
}

DEFAULT_LEVEL = "central"


def load_schemes():
    return load_json("schemes.json")


def level_rank(level):
    """
    Sort position for a scheme's level. An unrecognised level sorts last rather
    than raising, so a level added to schemes.json before this map is updated
    still renders.
    """
    return LEVEL_RANK.get(str(level or DEFAULT_LEVEL).lower().strip(), len(LEVEL_RANK))


# The two availability rules, over inputs that are already lowercased.
#
# They are the single copy of each rule: the public serves_* functions below
# normalize a hand-written scheme dict and call these, and match_schemes reads the
# precomputed index and calls these. Inlining either rule into the matcher for
# speed would leave two copies of an eligibility gate free to drift apart, which
# is the one kind of bug in this file that reads as working code.
#
# Note they are NOT the same rule with different arguments, and must not be merged
# into one. They differ deliberately on an empty user value: an unknown location
# type filters nothing at all, while an unknown state still drops the schemes that
# name a specific set of states, leaving everything open nationwide. See each
# public function's docstring.
def _state_is_served(scheme_states, user_state):
    if not scheme_states or "all" in scheme_states:
        return True

    return user_state in scheme_states


def _location_is_served(scheme_locations, wanted):
    if not wanted:
        return True

    if not scheme_locations or "all" in scheme_locations:
        return True

    return wanted in scheme_locations


def serves_state(scheme, state):
    """
    Is this scheme available where the entrepreneur is?

    True for a scheme listed as "ALL", and for one that names their state.
    False only when the scheme names a specific set of states and theirs is not
    among them — a Uttar Pradesh-only subsidy must not be offered in Kerala.
    """
    return _state_is_served(
        frozenset(item.lower().strip() for item in scheme.get("states", [])),
        str(state or "").lower().strip(),
    )


def serves_location(scheme, location_type):
    """
    Is this scheme available in the kind of place the entrepreneur works in?

    The exact counterpart of serves_state, for the same reason: PM SVANidhi
    requires "a town or city area covered by an urban local body", and offering
    it to a village farmer as a 90% match costs them a wasted trip. RSETI, the
    Gram Panchayat counter, the block rural-livelihoods desk and the Vibrant
    Villages Programme are the mirror case — each says "rural" or "village" in
    its own eligibility text and was being offered to urban entrepreneurs.

    An empty location_type means the caller never asked, which is not a
    restriction: /api/schemes/match does not collect one. Filtering on a value
    nobody supplied would hide five schemes from every consumer of that route.
    """
    return _location_is_served(
        frozenset(
            item.lower().strip()
            for item in scheme.get("location_types", DEFAULT_LOCATION_TYPES)
        ),
        str(location_type or "").lower().strip(),
    )


def expand_category(category):
    """
    Return the entrepreneur's own wording plus any scheme wording it falls under.
    """
    phrases = {category}

    for button_wording, scheme_wording in CATEGORY_SYNONYMS.items():
        if button_wording in category:
            phrases.update(scheme_wording)

    return phrases


def _score_normalized(scheme_categories, scheme_states, phrases, user_state):
    """
    The scoring rules, over inputs that are already lowercased.

    The single copy of them. `calculate_match_details` normalizes one scheme dict
    on demand and calls this; `match_schemes` reads the precomputed index and
    calls this. The codes have to be built from the same branch that builds the
    sentence or the two drift apart, so both callers share one body rather than
    the matcher keeping a fast copy of it.

    `phrases` is the entrepreneur's wording expanded through CATEGORY_SYNONYMS. It
    is a parameter rather than derived here because it depends only on what the
    entrepreneur tapped, not on the scheme — deriving it inside meant recomputing
    the same set thirty times per request, once per scheme in the file.
    """
    reasons = []
    # Translatable twins of `reasons`, appended in lockstep. Each entry carries
    # its own `categories` list because the category reason names the matched
    # scheme wording, which is data rather than copy — the frontend translates
    # each word and rejoins them, so a sentence is never assembled from a
    # translated template plus untranslated English fragments.
    reason_codes = []

    # Business category must match, either in the entrepreneur's own words or
    # through the wording the scheme uses for the same activity.
    #
    # Note the direction: the SCHEME's word must be a substring of the USER's
    # phrase. That is why scheme_categories stays an iterable of strings and is
    # scanned, rather than becoming a set like scheme_states — there is no hash
    # lookup for "is a substring of".
    matched_categories = sorted(
        {
            scheme_category
            for phrase in phrases
            for scheme_category in scheme_categories
            if scheme_category in phrase
        }
    )

    if not matched_categories:
        return {"score": 0, "reasons": [], "reason_codes": []}

    score = 60
    reasons.append(
        "Your kind of work is supported by this scheme (listed as "
        + " / ".join(matched_categories)
        + ")."
    )
    reason_codes.append(
        {
            "code": "why.categorySupported",
            "categories": matched_categories,
        }
    )

    # Geography. A scheme that names the entrepreneur's own state scores higher
    # than one open to the whole country: with thirty schemes in the file, a
    # single +40 for both put almost every match on exactly 100, and a
    # percentage that is always 100 tells the reader nothing.
    #
    # Neither sentence says who *runs* the scheme, because the states list does
    # not know: a regional scheme naming eight states is still central. The
    # scheme's `level` carries that, and the UI groups by it.
    if user_state and user_state in scheme_states:
        score += 40
        reasons.append(
            "This scheme covers your state in particular."
        )
        reason_codes.append({"code": "why.stateSpecific", "categories": []})
    elif "all" in scheme_states:
        score += 30
        reasons.append(
            "This scheme is available in your state."
        )
        reason_codes.append({"code": "why.stateAvailable", "categories": []})

    return {"score": score, "reasons": reasons, "reason_codes": reason_codes}


def calculate_match_details(
    scheme,
    business_category,
    state
):
    """
    Score a scheme and explain the score, both as English sentences and as
    translatable codes.

    `calculate_match_score` below stays a two-value function over this one. Takes
    a raw scheme dict and normalizes it here, so a hand-written one from a test
    works exactly as it always has.
    """
    category = business_category.lower().strip()

    return _score_normalized(
        scheme_categories=tuple(
            item.lower().strip()
            for item in scheme["business_categories"]
        ),
        scheme_states=frozenset(
            item.lower().strip()
            for item in scheme["states"]
        ),
        phrases=expand_category(category),
        user_state=state.lower().strip(),
    )


# Kept as a two-value function on purpose: it is the long-standing shape of this
# helper and several tests unpack it. New callers that need the codes should use
# calculate_match_details directly.
def calculate_match_score(
    scheme,
    business_category,
    state
):
    details = calculate_match_details(
        scheme=scheme,
        business_category=business_category,
        state=state
    )

    return details["score"], details["reasons"]


@lru_cache(maxsize=None)
def _scheme_index():
    """
    schemes.json with every field the matcher compares on lowercased once, in file
    order.

    Built once per process instead of once per request. The matcher used to
    lowercase all thirty schemes' categories, states and location types on every
    call — work whose result cannot change between requests, since it depends only
    on the file.

    Deliberately kept SEPARATE from what `load_schemes()` returns, which stays
    exactly the shape of the file. Tests and the /api/schemes routes iterate that,
    and a derived key showing up inside a scheme dict would be indistinguishable
    from one somebody typed into the dataset.

    `states` and `locations` are frozensets because both rules ask plain
    membership. `categories` stays an ordered tuple because its rule is substring
    containment — see the note in `_score_normalized`.
    """
    return tuple(
        {
            "scheme": scheme,
            "categories": tuple(
                item.lower().strip()
                for item in scheme["business_categories"]
            ),
            "states": frozenset(
                item.lower().strip()
                for item in scheme["states"]
            ),
            "locations": frozenset(
                item.lower().strip()
                for item in scheme.get("location_types", DEFAULT_LOCATION_TYPES)
            ),
            "level": scheme.get("level", DEFAULT_LEVEL),
        }
        for scheme in load_schemes()
    )


def match_schemes(
    business_category,
    state,
    location_type=""
):
    user_state = str(state or "").lower().strip()
    wanted_location = str(location_type or "").lower().strip()

    # Once per request rather than once per scheme: this depends only on what the
    # entrepreneur tapped, so recomputing it inside the loop repeated identical
    # work thirty times.
    phrases = expand_category(business_category.lower().strip())

    matches = []

    for entry in _scheme_index():
        # Availability is decided here rather than in the scorer, which stays a
        # pure explainer of fit. A scheme that names a specific set of states is
        # simply not on offer outside them, and showing a Uttar Pradesh-only
        # subsidy to a Kerala entrepreneur as a "60% match" is worse than not
        # showing it: they would spend a trip to the block office on it.
        if not _state_is_served(entry["states"], user_state):
            continue

        # Same rule, the other axis. The frontend has always collected rural /
        # semi-urban / urban on /location and always sent it as location_type;
        # this matcher ignored it, so a village entrepreneur was offered an
        # urban-local-body street vending loan and a town entrepreneur was
        # offered the rural training institute.
        if not _location_is_served(entry["locations"], wanted_location):
            continue

        details = _score_normalized(
            scheme_categories=entry["categories"],
            scheme_states=entry["states"],
            phrases=phrases,
            user_state=user_state,
        )

        if details["score"] > 0:
            scheme = entry["scheme"]

            matches.append(
                {
                    "name": scheme["name"],
                    # Which layer of government runs it. The frontend groups the
                    # cards by this, so an entrepreneur can see that the help
                    # runs from Delhi down to their own Gram Panchayat.
                    "level": entry["level"],
                    # A stable id so the frontend can look up a translation for
                    # this scheme's own prose. Falls back to an empty string so a
                    # scheme added without one still renders its English text.
                    "scheme_id": scheme.get("id", ""),
                    "description": scheme["description"],
                    "support_type": scheme["support_type"],
                    "match_score": details["score"],
                    "match_reasons": details["reasons"],
                    "match_reason_codes": details["reason_codes"],
                    # list(...) rather than the file's own list object. The loader
                    # caches the parsed file now, so these are shared across every
                    # request in the process — handing one straight into a response
                    # would let any future consumer that mutates it corrupt the
                    # dataset for every later request, with the file on disk still
                    # correct and a restart making the symptom disappear. Four
                    # short lists per matched scheme is nothing next to the disk
                    # read this replaced.
                    "eligibility_rules": list(scheme["eligibility_rules"]),
                    "documents": list(scheme["documents"]),
                    # Translation codes for the scheme's own prose, carried
                    # straight from schemes.json. `.get` rather than `[...]`
                    # because a scheme may be added without them, and an
                    # untranslated scheme must still render its English.
                    "description_code": scheme.get("description_code"),
                    "support_type_code": scheme.get("support_type_code"),
                    "eligibility_codes": list(scheme.get("eligibility_codes", [])),
                    "document_codes": list(scheme.get("document_codes", [])),
                    "official_url": scheme["official_url"],
                    "last_verified": scheme["last_verified"]
                }
            )

    # Score first, then outward from the national government, then by name.
    # Sorting on the score alone left thirty schemes in file order within each
    # score, so the same category could list a Gram Panchayat counter above
    # PMEGP. Only the score is reversed -- a lower level_rank is nearer the top,
    # so negating it keeps one sort key and no second pass.
    matches.sort(
        key=lambda item: (
            -item["match_score"],
            level_rank(item["level"]),
            item["name"]
        )
    )

    return matches