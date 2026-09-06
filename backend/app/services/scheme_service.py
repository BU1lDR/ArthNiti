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


def load_schemes():
    return load_json("schemes.json")


def expand_category(category):
    """
    Return the entrepreneur's own wording plus any scheme wording it falls under.
    """
    phrases = {category}

    for button_wording, scheme_wording in CATEGORY_SYNONYMS.items():
        if button_wording in category:
            phrases.update(scheme_wording)

    return phrases


def calculate_match_score(
    scheme,
    business_category,
    state
):
    score = 0
    reasons = []

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
        return 0, []

    score += 60
    reasons.append(
        "Your kind of work is supported by this scheme (listed as "
        + " / ".join(matched_categories)
        + ")."
    )

    # State match
    if "all" in scheme_states or user_state in scheme_states:
        score += 40
        reasons.append(
            "This scheme is available in your state."
        )

    return score, reasons


def match_schemes(
    business_category,
    state
):
    schemes = load_schemes()

    matches = []

    for scheme in schemes:
        score, reasons = calculate_match_score(
            scheme=scheme,
            business_category=business_category,
            state=state
        )

        if score > 0:
            matches.append(
                {
                    "name": scheme["name"],
                    "description": scheme["description"],
                    "support_type": scheme["support_type"],
                    "match_score": score,
                    "match_reasons": reasons,
                    "eligibility_rules": scheme["eligibility_rules"],
                    "documents": scheme["documents"],
                    "official_url": scheme["official_url"],
                    "last_verified": scheme["last_verified"]
                }
            )

    matches.sort(
        key=lambda item: item["match_score"],
        reverse=True
    )

    return matches