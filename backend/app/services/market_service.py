from app.core.data_loader import load_json


def load_market_data() -> list[dict]:
    return load_json("market_data.json")


def get_market_context(
    state: str,
    district: str,
    business_category: str,
) -> list[dict]:
    data = load_market_data()

    state = state.strip().lower()
    district = district.strip().lower()
    business_category = business_category.strip().lower()

    matches = []

    for item in data:
        if (
            item["state"].strip().lower() == state
            and item["district"].strip().lower() == district
            and item["business_category"].strip().lower() == business_category
        ):
            matches.append(item)

    return matches