from functools import lru_cache

from app.core.data_loader import load_json


def load_market_data() -> list[dict]:
    # Two files, because two scripts write them: the data.gov.in fetch writes
    # market_data.json and the NECC fetch writes necc_egg_prices.json. Neither
    # script touches the other's file. The list is new and the rows in it are
    # the cached objects, so a caller must treat them as read-only, as with
    # load_json. A missing egg file is an error, not an empty list.
    return load_json("market_data.json") + load_json("necc_egg_prices.json")


@lru_cache(maxsize=None)
def _market_index():
    """
    market_data.json with the four fields the lookup compares on lowercased once,
    in file order.

    Same reasoning as `_scheme_index`: the normalization depends only on the file,
    so doing it per request repeated identical work.

    A row with no `scope` counts as a district row, which is what every row was
    before the field existed.

    The row itself is carried rather than copied, and stays exactly the shape of
    the file. `get_market_context` copies it before adding anything.
    """
    return tuple(
        (
            row,
            row["state"].strip().lower(),
            row["district"].strip().lower(),
            row["business_category"].strip().lower(),
            (row.get("scope") or "district").strip().lower(),
        )
        for row in load_market_data()
    )


def _detached(value):
    # {**row} alone copies only the top level. A sourced row carries a nested
    # `provenance` object and lists such as `nic_classes`, and a shallow copy
    # would hand the caller the cached originals of those. So the dicts and lists
    # are rebuilt all the way down; strings, numbers and None are immutable and
    # can be shared.
    if isinstance(value, dict):
        return {key: _detached(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_detached(item) for item in value]
    return value


def get_market_context(
    state: str,
    district: str,
    business_category: str,
) -> list[dict]:
    # Rows used to carry a `local_context` echoing the village, market type and
    # customers from the request. Nothing here computed from them, so the echo
    # and those parameters are gone; the frontend keeps those answers in the tab.
    state = state.strip().lower()
    district = district.strip().lower()
    business_category = business_category.strip().lower()

    # One pass, two buckets. The entrepreneur's own district is the most useful
    # answer: a row with scope "district" for exactly that district. Failing
    # that, a row with scope "state" -- a figure for the whole state -- is still
    # worth showing, as long as it says which it is.
    #
    # The fallback takes ONLY state rows. It used to take any row in the same
    # state, which meant a Lucknow figure was shown to someone in Kanpur. A count
    # of Lucknow's registered tailors, or Lucknow's mandi price, is not evidence
    # about Kanpur, and match_level "state" would have described it as a figure
    # for the whole of Uttar Pradesh, which it is not. So another district's row
    # is never returned, and a row with any other scope is skipped.
    #
    # An empty requested district never matches a district row: the unified
    # analysis defaults district to "", and a district row always names one.
    same_district = []
    same_state = []

    for row, row_state, row_district, row_category, row_scope in _market_index():
        if row_state != state or row_category != business_category:
            continue

        if row_scope == "district":
            if not district or row_district != district:
                continue
            bucket, match_level = same_district, "district"
        elif row_scope == "state":
            bucket, match_level = same_state, "state"
        else:
            continue

        bucket.append(
            {
                **_detached(row),
                "match_level": match_level,
            }
        )

    return same_district or same_state
