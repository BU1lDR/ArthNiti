import json
from app.core.data_loader import load_json


def load_schemes():
    return load_json("schemes.json")


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
    # Business category must match
    category_matches = any(
        scheme_category in category
        for scheme_category in scheme_categories
    )

    if not category_matches:
        return 0, []

    score += 60
    reasons.append(
        "Business category matches the scheme's supported categories."
    )

    # State match
    if "all" in scheme_states or user_state in scheme_states:
        score += 40
        reasons.append(
            "Scheme is applicable to the entrepreneur's location."
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