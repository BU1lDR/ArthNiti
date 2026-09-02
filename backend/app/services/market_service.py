import json
from pathlib import Path


DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "market_data.json"


def load_market_data() -> list[dict]:
    with DATA_FILE.open("r", encoding="utf-8") as file:
        return json.load(file)


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