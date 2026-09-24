"""
Synthetic sourced market rows, for the tests that need market data to exist.

market_data.json holds whatever the last fetch wrote (20 rows for two districts
as of 24 Sept 2026), so a test that needs a row brings its own and stays
independent of the fetch. These rows are shaped exactly the
way tools/fetch-market-data.mjs writes them (section 2 of the market spec), and
test_market_data_guards.py runs its guard over them as well as over the real
file, which is what proves the guard fires on something whatever the real file
holds, an empty list included.

The figures are invented. Nothing here was fetched, and nothing here is a real
unit, name or address: count rows carry a count, never a registration.

They cover the shapes the lookup has to tell apart, all in one state so the
fallback has something to get wrong:

  - a state-scope count row (Uttar Pradesh, tailoring);
  - two price rows in Lucknow, one fractional and one whole and stale;
  - a suppressed count row in Lucknow (handicrafts, fewer than 10);
  - an ordinary count row in Lucknow (tailoring);
  - a Ministry aggregate row in Varanasi (services), i.e. a row in ANOTHER
    district of the same state, which must never be offered as a fallback.

They are listed in the order the fetch sorts a file into, so the file-level
order check can run on them unchanged.
"""

import copy
import json

import pytest

from app.core import data_loader
from app.core.data_loader import clear_data_cache
from app.services import market_service


LICENCE = "Government Open Data License - India"
LICENCE_URL = "https://www.data.gov.in/Godl"

AGRI_PUBLISHER = "Ministry of Agriculture and Farmers Welfare (Directorate of Marketing and Inspection)"
MSME_PUBLISHER = "Ministry of Micro, Small and Medium Enterprises"

AGMARKNET_ID = "35985678-0d79-46b4-9ed6-6f13308a1d24"
AGMARKNET_TITLE = "Variety-wise Daily Market Prices Data of Commodity"
AGMARKNET_URL = "https://www.data.gov.in/resource/variety-wise-daily-market-prices-data-commodity"

UDYAM_LIST_ID = "8b68ae56-84cf-4728-a0a6-1be11028dea7"
UDYAM_LIST_TITLE = "List of MSME Registered Units under UDYAM"
UDYAM_LIST_URL = "https://www.data.gov.in/resource/list-msme-registered-units-under-udyam"

UDYAM_SERVICES_ID = "c3dfe7e6-0cfd-4ddb-8f79-9cb3695d9866"
UDYAM_SERVICES_TITLE = "District wise Services MSME Registered Enterprises under UDYAM Registration till last date"
UDYAM_SERVICES_URL = "https://www.data.gov.in/resource/district-wise-services-msme-registered-enterprises-under-udyam-registration-till-last-date"

SOURCE_MANDI = "Daily mandi prices reported to Agmarknet, published on data.gov.in"
SOURCE_LIST = "Udyam registrations, published on data.gov.in"
SOURCE_AGGREGATE = "The Ministry of MSME's district counts of Udyam registrations, published on data.gov.in"

NOTE_OUR_GROUPING = "We chose which kinds of registered work to count in this figure."
NOTE_MINISTRY_SERVICES = (
    "This is the Ministry's own count of registered service businesses. "
    "It may include shops and traders."
)

HANDICRAFTS_NIC = [
    "1312", "1313", "1392", "1393", "1399", "1512", "1520",
    "1629", "2393", "3211", "3212", "3240", "3290",
]

# A fixed 64-character sha256, standing in for the hash of the two fetch scripts.
SCRIPT_SHA256 = "d399bd8cb28b1fb0f3d15077005d94b31c3f378e794dac3920580836b464f07b"

FETCHED_AT = "2026-09-23T10:15:00+05:30"
FETCH_DATE = "2026-09-23"

# 23:40 UTC on the 22nd is the 23rd in India. The count rows' period_end and
# attribution date both have to carry India's date, so this timestamp is chosen
# to make a UTC-date mistake visible.
COUNT_UPDATED = "2026-09-22T23:40:00Z"
PRICE_UPDATED = "2026-09-23T04:30:00Z"


def _attribution(publisher, title, page_url, ist_day):
    yyyy, mm, dd = ist_day.split("-")
    return (
        f"{publisher}, {yyyy}, {title}, Open Government Data Platform India, "
        f"{dd}/{mm}, {page_url}. Published under {LICENCE}: {LICENCE_URL}."
    )


def _price_method(scope):
    where = "every district of the state" if scope == "state" else "the district"
    return (
        "The median of the daily median modal price, in rupees per kg, over the "
        f"last 30 reporting days or fewer across every reporting mandi in {where}, "
        "with a range from the 10th to the 90th percentile of those daily medians."
    )


def _list_method(scope):
    where = "summed over every district of the state" if scope == "state" else "for the district"
    return (
        f"A count of the units in the full Udyam unit list {where} whose registered "
        "NIC 2008 activities include one of nic_classes, with a unit that lists "
        "several kinds of work counted under each heading it qualifies for."
    )


def _aggregate_method(category):
    kind = "service" if category == "services" else "manufacturing"
    return (
        f"The Ministry of MSME's own published district total of registered {kind} "
        "enterprises (micro, small and medium together), used as published."
    )


def _price_provenance(query, period_start, period_end, total, used, dropped):
    return {
        "resource_id": AGMARKNET_ID,
        "resource_title": AGMARKNET_TITLE,
        "publisher": AGRI_PUBLISHER,
        "resource_updated_date": {"before": PRICE_UPDATED, "after": PRICE_UPDATED},
        "page_url": AGMARKNET_URL,
        "query": query,
        "total_reported": total,
        "rows_fetched": total,
        "rows_used": used,
        "rows_dropped": dropped,
        "fetched_at": FETCHED_AT,
        "period_start": period_start,
        "period_end": period_end,
        "method": _price_method("district"),
        "nic_map_version": None,
        "crosswalk_version": 1,
        "script_sha256": SCRIPT_SHA256,
        "licence": LICENCE,
        "licence_url": LICENCE_URL,
        "attribution": _attribution(AGRI_PUBLISHER, AGMARKNET_TITLE, AGMARKNET_URL, "2026-09-23"),
    }


def _list_provenance(scope, query, total, used, unparseable):
    return {
        "resource_id": UDYAM_LIST_ID,
        "resource_title": UDYAM_LIST_TITLE,
        "publisher": MSME_PUBLISHER,
        "resource_updated_date": {"before": COUNT_UPDATED, "after": COUNT_UPDATED},
        "page_url": UDYAM_LIST_URL,
        "query": query,
        "total_reported": total,
        "rows_fetched": total,
        "rows_used": used,
        "rows_dropped": {"unparseable": unparseable, "wrong_place": 0},
        "fetched_at": FETCHED_AT,
        "period_start": None,
        "period_end": "2026-09-23",
        "method": _list_method(scope),
        "nic_map_version": 1,
        "crosswalk_version": 1,
        "script_sha256": SCRIPT_SHA256,
        "licence": LICENCE,
        "licence_url": LICENCE_URL,
        "attribution": _attribution(MSME_PUBLISHER, UDYAM_LIST_TITLE, UDYAM_LIST_URL, "2026-09-23"),
    }


def _services_aggregate_provenance(query):
    return {
        "resource_id": UDYAM_SERVICES_ID,
        "resource_title": UDYAM_SERVICES_TITLE,
        "publisher": MSME_PUBLISHER,
        "resource_updated_date": {"before": COUNT_UPDATED, "after": COUNT_UPDATED},
        "page_url": UDYAM_SERVICES_URL,
        "query": query,
        "total_reported": 1,
        "rows_fetched": 1,
        "rows_used": 1,
        "rows_dropped": {"unparseable": 0, "wrong_place": 0},
        "fetched_at": FETCHED_AT,
        "period_start": None,
        "period_end": "2026-09-23",
        "method": _aggregate_method("services"),
        "nic_map_version": None,
        "crosswalk_version": 1,
        "script_sha256": SCRIPT_SHA256,
        "licence": LICENCE,
        "licence_url": LICENCE_URL,
        "attribution": _attribution(
            MSME_PUBLISHER, UDYAM_SERVICES_TITLE, UDYAM_SERVICES_URL, "2026-09-23"
        ),
    }


LUCKNOW_PRICE_QUERY = (
    "filters[State]=Uttar Pradesh&filters[District]=Lucknow"
    "&range[Arrival_Date][gte]=24/07/2026&range[Arrival_Date][lte]=22/09/2026"
    "&limit=10000&offset=0"
)

SYNTHETIC_ROWS = [
    {
        "state": "Uttar Pradesh",
        "district": "",
        "business_category": "tailoring",
        "scope": "state",
        "metric": "registered_units",
        "count": 52110,
        "count_suppressed": False,
        "share_percent": 1.1,
        "district_total": 4670000,
        "nic_classes": ["1410"],
        "source": SOURCE_LIST,
        "source_code": "src.udyamList",
        "last_verified": FETCH_DATE,
        "provenance": _list_provenance(
            "state",
            "fields=LG_DT_Code,Activities&filters[State]=UTTAR PRADESH&limit=10000&offset=0",
            total=4670000,
            used=4669980,
            unparseable=20,
        ),
    },
    {
        "state": "Uttar Pradesh",
        "district": "Lucknow",
        "business_category": "agriculture",
        "scope": "district",
        "metric": "wholesale_price_per_kg",
        "commodity": "Wheat",
        "commodity_id": "wheat",
        "unit": "kg",
        "indicative_price": 26.9,
        "price_low": 25.5,
        "price_high": 28.1,
        "n_days": 30,
        "n_markets": 2,
        "last_reported": "2026-09-22",
        "source": SOURCE_MANDI,
        "source_code": "src.agmarknetMandi",
        "last_verified": FETCH_DATE,
        "provenance": _price_provenance(
            LUCKNOW_PRICE_QUERY,
            period_start="2026-08-20",
            period_end="2026-09-22",
            total=412,
            used=380,
            dropped={
                "zero": 2,
                "nonnumeric": 0,
                "out_of_range": 0,
                "out_of_band": 3,
                "dupes": 27,
                "wrong_place": 0,
            },
        ),
    },
    {
        "state": "Uttar Pradesh",
        "district": "Lucknow",
        "business_category": "agriculture",
        "scope": "district",
        "metric": "wholesale_price_per_kg",
        "commodity": "Potato",
        "commodity_id": "potato",
        "unit": "kg",
        # A whole number on purpose: the page has to print it as a whole rupee
        # figure, and the typed route turns it into 26.0 on the way out.
        "indicative_price": 26,
        "price_low": 24.5,
        "price_high": 27.35,
        "n_days": 12,
        "n_markets": 1,
        # 13 days before the fetch: old enough to be stale, not old enough to drop.
        "last_reported": "2026-09-10",
        "stale": True,
        "source": SOURCE_MANDI,
        "source_code": "src.agmarknetMandi",
        "last_verified": FETCH_DATE,
        "provenance": _price_provenance(
            LUCKNOW_PRICE_QUERY,
            period_start="2026-08-12",
            period_end="2026-09-10",
            total=412,
            used=31,
            dropped={
                "zero": 0,
                "nonnumeric": 0,
                "out_of_range": 0,
                "out_of_band": 1,
                "dupes": 4,
                "wrong_place": 0,
            },
        ),
    },
    {
        "state": "Uttar Pradesh",
        "district": "Lucknow",
        "business_category": "handicrafts",
        "scope": "district",
        "metric": "registered_units",
        "count": None,
        "count_suppressed": True,
        "share_percent": None,
        "district_total": 249485,
        "nic_classes": list(HANDICRAFTS_NIC),
        "source": SOURCE_LIST,
        "source_code": "src.udyamList",
        "note_code": "mknote.ourGrouping",
        "note": NOTE_OUR_GROUPING,
        "last_verified": FETCH_DATE,
        "provenance": _list_provenance(
            "district",
            "fields=LG_DT_Code,Activities&filters[LG_DT_Code]=162&limit=10000&offset=0",
            total=249485,
            used=249480,
            unparseable=5,
        ),
    },
    {
        "state": "Uttar Pradesh",
        "district": "Lucknow",
        "business_category": "tailoring",
        "scope": "district",
        "metric": "registered_units",
        "count": 1843,
        "count_suppressed": False,
        "share_percent": 0.7,
        "district_total": 249485,
        "nic_classes": ["1410"],
        "source": SOURCE_LIST,
        "source_code": "src.udyamList",
        "last_verified": FETCH_DATE,
        "provenance": _list_provenance(
            "district",
            "fields=LG_DT_Code,Activities&filters[LG_DT_Code]=162&limit=10000&offset=0",
            total=249485,
            used=249480,
            unparseable=5,
        ),
    },
    {
        "state": "Uttar Pradesh",
        "district": "Varanasi",
        "business_category": "services",
        "scope": "district",
        "metric": "registered_units",
        "count": 41277,
        "count_suppressed": False,
        "share_percent": None,
        "district_total": None,
        "nic_classes": [],
        "source": SOURCE_AGGREGATE,
        "source_code": "src.udyamAggregate",
        "note_code": "mknote.ministryServices",
        "note": NOTE_MINISTRY_SERVICES,
        "last_verified": FETCH_DATE,
        "provenance": _services_aggregate_provenance("filters[lg_dt_code]=187&limit=10&offset=0"),
    },
]


def synthetic_rows():
    """A fresh deep copy, so no test can change the rows another test sees."""
    return copy.deepcopy(SYNTHETIC_ROWS)


@pytest.fixture
def synthetic_market(monkeypatch):
    """
    Serve SYNTHETIC_ROWS as the market data, through the service's own index.

    _market_index is lru_cached, so it is cleared before the patch takes effect
    and again afterwards; otherwise one test's rows would still be the index the
    next test reads, and the real (empty) file would never come back.
    """
    rows = synthetic_rows()
    market_service._market_index.cache_clear()
    monkeypatch.setattr(market_service, "load_market_data", lambda: rows)
    yield rows
    market_service._market_index.cache_clear()


@pytest.fixture
def synthetic_market_file(tmp_path, monkeypatch):
    """
    Write SYNTHETIC_ROWS to a market_data.json and point the data loader at it.

    For the tests that have to go through load_json's own cache, which is where
    a shared object could be poisoned. Every cache is dropped on both sides, so
    the real data files are read afresh once the patch is undone.
    """
    rows = synthetic_rows()
    (tmp_path / "market_data.json").write_text(
        json.dumps(rows, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    clear_data_cache()
    monkeypatch.setattr(data_loader, "DATA_DIR", tmp_path)
    yield rows
    clear_data_cache()
