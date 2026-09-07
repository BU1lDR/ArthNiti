import json
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
}


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


def serves_state(scheme, state):
    """
    Is this scheme available where the entrepreneur is?

    True for a scheme listed as "ALL", and for one that names their state.
    False only when the scheme names a specific set of states and theirs is not
    among them — a Uttar Pradesh-only subsidy must not be offered in Kerala.
    """
    scheme_states = [item.lower().strip() for item in scheme.get("states", [])]

    if not scheme_states or "all" in scheme_states:
        return True

    return str(state or "").lower().strip() in scheme_states


def expand_category(category):
    """
    Return the entrepreneur's own wording plus any scheme wording it falls under.
    """
    phrases = {category}

    for button_wording, scheme_wording in CATEGORY_SYNONYMS.items():
        if button_wording in category:
            phrases.update(scheme_wording)

    return phrases


def calculate_match_details(
    scheme,
    business_category,
    state
):
    """
    Score a scheme and explain the score, both as English sentences and as
    translatable codes.

    `calculate_match_score` below stays a two-value function over this one. The
    scoring rules live here rather than there because the codes have to be built
    from the same branch that builds the sentence, or the two can drift apart.
    """
    score = 0
    reasons = []
    # Translatable twins of `reasons`, appended in lockstep. Each entry carries
    # its own `categories` list because the category reason names the matched
    # scheme wording, which is data rather than copy — the frontend translates
    # each word and rejoins them, so a sentence is never assembled from a
    # translated template plus untranslated English fragments.
    reason_codes = []

    category = business_category.lower().strip()
    user_state = state.lower().strip()

    scheme_categories = [
        item.lower().strip()
        for item in scheme["business_categories"]
    ]

    scheme_states = [
        item.lower().strip()
        for item in scheme["states"]
    ]

    # Business category must match, either in the entrepreneur's own words or
    # through the wording the scheme uses for the same activity.
    phrases = expand_category(category)

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

    score += 60
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


def match_schemes(
    business_category,
    state
):
    schemes = load_schemes()

    matches = []

    for scheme in schemes:
        # Availability is decided here rather than in the scorer, which stays a
        # pure explainer of fit. A scheme that names a specific set of states is
        # simply not on offer outside them, and showing a Uttar Pradesh-only
        # subsidy to a Kerala entrepreneur as a "60% match" is worse than not
        # showing it: they would spend a trip to the block office on it.
        if not serves_state(scheme, state):
            continue

        details = calculate_match_details(
            scheme=scheme,
            business_category=business_category,
            state=state
        )

        if details["score"] > 0:
            matches.append(
                {
                    "name": scheme["name"],
                    # Which layer of government runs it. The frontend groups the
                    # cards by this, so an entrepreneur can see that the help
                    # runs from Delhi down to their own Gram Panchayat.
                    "level": scheme.get("level", DEFAULT_LEVEL),
                    # A stable id so the frontend can look up a translation for
                    # this scheme's own prose. Falls back to an empty string so a
                    # scheme added without one still renders its English text.
                    "scheme_id": scheme.get("id", ""),
                    "description": scheme["description"],
                    "support_type": scheme["support_type"],
                    "match_score": details["score"],
                    "match_reasons": details["reasons"],
                    "match_reason_codes": details["reason_codes"],
                    "eligibility_rules": scheme["eligibility_rules"],
                    "documents": scheme["documents"],
                    # Translation codes for the scheme's own prose, carried
                    # straight from schemes.json. `.get` rather than `[...]`
                    # because a scheme may be added without them, and an
                    # untranslated scheme must still render its English.
                    "description_code": scheme.get("description_code"),
                    "support_type_code": scheme.get("support_type_code"),
                    "eligibility_codes": scheme.get("eligibility_codes", []),
                    "document_codes": scheme.get("document_codes", []),
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