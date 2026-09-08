from functools import lru_cache

from app.core.data_loader import load_json


def load_market_data() -> list[dict]:
    return load_json("market_data.json")


@lru_cache(maxsize=None)
def _market_index():
    """
    market_data.json with the three fields the lookup compares on lowercased once,
    in file order.

    Same reasoning as `_scheme_index`: the normalization depends only on the file,
    so doing it per request repeated identical work — and it happened twice per
    request, because the old two-pass search re-scanned and re-lowercased every row
    when no district row was found.

    The row itself is carried rather than copied, and stays exactly the shape of
    the file. `get_market_context` copies it with {**row} before adding anything.
    """
    return tuple(
        (
            row,
            row["state"].strip().lower(),
            row["district"].strip().lower(),
            row["business_category"].strip().lower(),
        )
        for row in load_market_data()
    )


def get_market_context(
    state: str,
    district: str,
    business_category: str,
    village: str = "",
    market_type: str = "",
    customers: str = "",
) -> list[dict]:
    state = state.strip().lower()
    district = district.strip().lower()
    business_category = business_category.strip().lower()

    local_context = {
        "village": village.strip(),
        "market_type": market_type.strip(),
        "customers": customers.strip(),
    }

    # One pass, two buckets. The entrepreneur's own district is the most useful
    # answer; requiring it meant every district we have no row for got an empty
    # section, so we fall back to the same state and let each row say which it is.
    #
    # This used to be two passes over the whole file, the second one running only
    # when the first found nothing — which is the case that needed it least, since
    # a district with no row is the common one. Collecting both buckets as we go
    # gives the same rows in the same order for one scan instead of two.
    same_district = []
    same_state = []

    for row, row_state, row_district, row_category in _market_index():
        if row_state != state or row_category != business_category:
            continue

        bucket = same_district if row_district == district else same_state

        bucket.append(
            {
                **row,
                "match_level": "district" if bucket is same_district else "state",
                "local_context": local_context,
            }
        )

    return same_district or same_state
