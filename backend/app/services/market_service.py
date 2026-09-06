from app.core.data_loader import load_json


def load_market_data() -> list[dict]:
    return load_json("market_data.json")


def get_market_context(
    state: str,
    district: str,
    business_category: str,
    village: str = "",
    market_type: str = "",
    customers: str = "",
) -> list[dict]:
    data = load_market_data()

    state = state.strip().lower()
    district = district.strip().lower()
    business_category = business_category.strip().lower()

    local_context = {
        "village": village.strip(),
        "market_type": market_type.strip(),
        "customers": customers.strip(),
    }

    def rows(same_district: bool) -> list[dict]:
        found = []

        for item in data:
            if item["state"].strip().lower() != state:
                continue

            if item["business_category"].strip().lower() != business_category:
                continue

            if same_district != (item["district"].strip().lower() == district):
                continue

            found.append(
                {
                    **item,
                    "match_level": "district" if same_district else "state",
                    "local_context": local_context,
                }
            )

        return found

    # The entrepreneur's own district is the most useful answer. Requiring it
    # meant that every district we have no row for got an empty section, so fall
    # back to the same state and let each row say which it is.
    exact = rows(same_district=True)

    if exact:
        return exact

    return rows(same_district=False)
