"""
Synthetic NECC egg-price rows, for the tests that need them to exist.

necc_egg_prices.json holds whatever the last run of tools/fetch-necc-prices.mjs
wrote, so a test that needs a row brings its own and stays independent of the
fetch. These rows are shaped exactly the way that script writes them, and
test_necc_data_guards.py runs its guard over them as well as over the real file,
which is what proves the guard fires on something whatever the real file holds.

The figures are invented but the wording is not. The constants below are the
words that have to reach the reader unchanged: NECC's own clarification, our
reading of its unit, the permission line and the method. They are written out
here in full on purpose. The guard compares every row, real or synthetic, to
THESE, so a wording change in tools/necc-lib.mjs cannot pass by agreeing with
itself.

Three shapes the lookup has to tell apart:

  - a state-scope row (Delhi, one centre for the whole union territory);
  - a suggested price in Namakkal, a week and a day old, so it is stale;
  - a prevailing price in Lucknow, printed on the day of the run.

They are listed in the order the fetch sorts a file into: state, district, kind.
"""

import copy
import json

import pytest

from app.core import data_loader
from app.core.data_loader import clear_data_cache
from app.services import market_service
from market_fixtures import SCRIPT_SHA256, synthetic_rows


PUBLISHER = "National Egg Co-ordination Committee (NECC)"
PAGE_URL = "https://www.e2necc.com/home/eggprice"
SHEET = "Daily Rate Sheet"

SOURCE_NECC = "Daily egg prices published by the National Egg Co-ordination Committee (NECC)"

# The first three sentences of the clarification NECC prints above its sheet, word
# for word. The fourth sentence asks anyone who passes the prices on to include
# the clarification, which is why every row carries it.
CLARIFICATION = (
    "The daily egg prices suggested by NECC, on its official website or through any other medium "
    "(including verbal, print and digital media) are merely suggestive and not mandatory. "
    "The suggested prices are published solely for the reference and information of the trade and industry. "
    "NECC does not by itself or through any person enforce compliance or adherence with such suggested egg prices "
    "in any manner whatsoever."
)

UNIT_READING = (
    "NECC prints each price as a whole number with no unit. It is read here as paise per egg, "
    "so 640 means ₹6.40 an egg, which is also ₹640 for 100 eggs."
)

PERMISSION = "Used with the agreement of NECC, given by e-mail in October 2026."

METHOD = (
    "The last price NECC printed for this centre in the month shown, read by tools/fetch-necc-prices.mjs. "
    "Nothing is averaged or estimated."
)

CROSSWALK_VERSION = 1
FETCHED_AT = "2026-10-28T18:30:00+05:30"
RUN_DATE = "2026-10-28"
MONTH = "2026-10"


def attribution(month, run_date):
    yyyy, mm, dd = run_date.split("-")
    return f"{PUBLISHER}, Daily Rate Sheet for {month}, {PAGE_URL}, read on {dd}/{mm}/{yyyy}."


def _provenance(centre_label, published_value):
    return {
        "publisher": PUBLISHER,
        "page_url": PAGE_URL,
        "sheet": SHEET,
        "month": MONTH,
        "centre_label": centre_label,
        "published_value": published_value,
        "unit_reading": UNIT_READING,
        "permission": PERMISSION,
        "fetched_at": FETCHED_AT,
        "method": METHOD,
        "crosswalk_version": CROSSWALK_VERSION,
        "script_sha256": SCRIPT_SHA256,
        "clarification": CLARIFICATION,
        "attribution": attribution(MONTH, RUN_DATE),
    }


def _row(state, district, scope, kind, centre, label, published_value, last_reported, stale):
    return {
        "state": state,
        "district": district,
        "business_category": "poultry",
        "scope": scope,
        "metric": "egg_price",
        "price_kind": kind,
        "centre": centre,
        "unit": "egg",
        "indicative_price": published_value / 100,
        "last_reported": last_reported,
        "stale": stale,
        "source": SOURCE_NECC,
        "source_code": "src.necc",
        "last_verified": RUN_DATE,
        "provenance": _provenance(label, published_value),
    }


NECC_ROWS = [
    _row("Delhi", "", "state", "suggested", "Delhi", "Delhi (CC)", 630, "2026-10-27", False),
    _row("Tamil Nadu", "Namakkal", "district", "suggested", "Namakkal", "Namakkal", 575, "2026-10-20", True),
    _row("Uttar Pradesh", "Lucknow", "district", "prevailing", "Lucknow", "Luknow (CC)", 640, "2026-10-28", False),
]

DELHI_EGG, NAMAKKAL_EGG, LUCKNOW_EGG = range(3)


def necc_rows():
    """A fresh deep copy, so no test can change the rows another test sees."""
    return copy.deepcopy(NECC_ROWS)


@pytest.fixture
def necc_market(monkeypatch):
    """
    Serve the synthetic market rows AND the synthetic egg rows as the market
    data, through the service's own index.

    _market_index is lru_cached, so it is cleared before the patch takes effect
    and again afterwards, for the reason synthetic_market gives.
    """
    rows = synthetic_rows() + necc_rows()
    market_service._market_index.cache_clear()
    monkeypatch.setattr(market_service, "load_market_data", lambda: rows)
    yield rows
    market_service._market_index.cache_clear()


@pytest.fixture
def necc_market_file(tmp_path, monkeypatch):
    """
    Write both data files to a temporary directory and point the loader at it.

    For the tests that have to go through load_json's own cache, where a shared
    object could be poisoned, and through load_market_data's merge of the two
    files. Yields (market rows, egg rows).
    """
    market, necc = synthetic_rows(), necc_rows()
    for name, rows in (("market_data.json", market), ("necc_egg_prices.json", necc)):
        (tmp_path / name).write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    clear_data_cache()
    monkeypatch.setattr(data_loader, "DATA_DIR", tmp_path)
    yield market, necc
    clear_data_cache()
