"""
Guards on backend/app/data/market_data.json.

The file is written by tools/fetch-market-data.mjs from data.gov.in, and real
people act on what it says, so every row is checked here against the shape the
fetch promises (section 2 of the market spec) and against the reference files
the fetch itself reads: tools/market-commodities.json, tools/market-nic-map.json,
the English in frontend/src/i18n/backendStrings.js and the state and district
names in frontend/src/data/indiaLocations.js.

The guard is two plain functions, check_row and check_rows, each returning a
list of problems, so the tests can prove each check FIRES as well as that the
data passes. That matters because the real file holds whatever the last fetch
wrote (20 rows as of 24 Sept 2026) and can be [], and every check passes
vacuously on an empty list. So each guard test
runs on the real file AND on market_fixtures.SYNTHETIC_ROWS, and the mutation
table at the bottom breaks one thing at a time and asserts the matching problem
is reported.

This mirrors validateRow in tools/market-lib.mjs, which runs before the fetch
will write. Where the two differ, this side is the stricter one: an unknown key
is refused, the attribution must be the exact GODL-India sentence, a price must
sit inside its commodity's band, `stale` must agree with the dates, and the file
itself is checked for duplicates, mixed sources, the per-place row cap and its
sort order.
"""

import json
import math
import re
from datetime import date, datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path

import pytest

from market_fixtures import (
    AGMARKNET_ID,
    NOTE_MINISTRY_SERVICES,
    NOTE_OUR_GROUPING,
    SYNTHETIC_ROWS,
    UDYAM_LIST_ID,
    synthetic_rows,
)


BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_DIR.parent

MARKET_FILE = BACKEND_DIR / "app" / "data" / "market_data.json"
COMMODITIES_FILE = REPO_ROOT / "tools" / "market-commodities.json"
NIC_MAP_FILE = REPO_ROOT / "tools" / "market-nic-map.json"
MARKET_LIB_FILE = REPO_ROOT / "tools" / "market-lib.mjs"
BACKEND_STRINGS_FILE = REPO_ROOT / "frontend" / "src" / "i18n" / "backendStrings.js"
LOCATIONS_FILE = REPO_ROOT / "frontend" / "src" / "data" / "indiaLocations.js"


LICENCE = "Government Open Data License - India"
LICENCE_URL = "https://www.data.gov.in/Godl"

METRIC_PRICE = "wholesale_price_per_kg"
METRIC_COUNT = "registered_units"

# The English category values CATEGORY_SYNONYMS in scheme_service.py keys off.
# "other" is absent on purpose: the Other button sends typed text, so a row for
# the literal word could never be reached.
CATEGORIES = (
    "agriculture",
    "dairy",
    "food processing",
    "handicrafts",
    "manufacturing",
    "retail",
    "services",
    "tailoring",
)

# The English, exactly as section 7 of the market spec fixes it.
SOURCE_EN = {
    "src.agmarknetMandi": "Daily mandi prices reported to Agmarknet, published on data.gov.in",
    "src.udyamList": "Udyam registrations, published on data.gov.in",
    "src.udyamAggregate": (
        "The Ministry of MSME's district counts of Udyam registrations, published on data.gov.in"
    ),
}

NOTE_EN = {
    "mknote.ourGrouping": "We chose which kinds of registered work to count in this figure.",
    "mknote.ministryServices": (
        "This is the Ministry's own count of registered service businesses. "
        "It may include shops and traders."
    ),
    "mknote.ministryManufacturing": (
        "This is the Ministry's own count of registered manufacturing businesses. "
        "It counts each business once, by its main kind of work."
    ),
    "mknote.dairyProducts": (
        "This counts registered businesses that make dairy products, such as ghee, paneer or packaged milk. "
        "Keeping cows or buffaloes is not counted in it."
    ),
}

AGRI_PUBLISHER = "Ministry of Agriculture and Farmers Welfare (Directorate of Marketing and Inspection)"
MSME_PUBLISHER = "Ministry of Micro, Small and Medium Enterprises"

# The resources a row may cite. The title is not checked against these: the
# attribution carries the title data.gov.in sent, which is what the fetch stores
# as resource_title.
RESOURCES = {
    "agmarknet": {
        "id": "35985678-0d79-46b4-9ed6-6f13308a1d24",
        "publisher": AGRI_PUBLISHER,
        "page_url": "https://www.data.gov.in/resource/variety-wise-daily-market-prices-data-commodity",
    },
    "udyamList": {
        "id": "8b68ae56-84cf-4728-a0a6-1be11028dea7",
        "publisher": MSME_PUBLISHER,
        "page_url": "https://www.data.gov.in/resource/list-msme-registered-units-under-udyam",
    },
    "udyamServices": {
        "id": "c3dfe7e6-0cfd-4ddb-8f79-9cb3695d9866",
        "publisher": MSME_PUBLISHER,
        "page_url": (
            "https://www.data.gov.in/resource/"
            "district-wise-services-msme-registered-enterprises-under-udyam-registration-till-last-date"
        ),
    },
    "udyamManufacturing": {
        "id": "ae789703-638a-4942-b79e-17868103dec8",
        "publisher": MSME_PUBLISHER,
        "page_url": "https://www.data.gov.in/catalog/udyam-registration-msme-registration",
    },
}

# Only services and manufacturing have a Ministry aggregate to fall back on.
AGGREGATE_KINDS = {
    "services": ("udyamServices", "mknote.ministryServices"),
    "manufacturing": ("udyamManufacturing", "mknote.ministryManufacturing"),
}

COMMON_KEYS = (
    "state",
    "district",
    "business_category",
    "scope",
    "metric",
    "source",
    "source_code",
    "last_verified",
    "provenance",
)
PRICE_KEYS = (
    "commodity",
    "commodity_id",
    "unit",
    "indicative_price",
    "price_low",
    "price_high",
    "n_days",
    "n_markets",
    "last_reported",
)
COUNT_KEYS = ("count", "count_suppressed", "share_percent", "district_total", "nic_classes")
OPTIONAL_KEYS = {
    METRIC_PRICE: ("note_code", "note", "stale"),
    METRIC_COUNT: ("note_code", "note"),
}

PROVENANCE_KEYS = (
    "resource_id",
    "resource_title",
    "publisher",
    "resource_updated_date",
    "page_url",
    "query",
    "total_reported",
    "rows_fetched",
    "rows_used",
    "rows_dropped",
    "fetched_at",
    "period_start",
    "period_end",
    "method",
    "nic_map_version",
    "crosswalk_version",
    "script_sha256",
    "licence",
    "licence_url",
    "attribution",
)
PRICE_DROPS = ("zero", "nonnumeric", "out_of_range", "out_of_band", "dupes", "wrong_place")
COUNT_DROPS = ("unparseable", "wrong_place")

MIN_COUNT = 10
MIN_DAYS = 8
MAX_DAYS = 30  # the statistic takes the last 30 reporting dates or fewer
STALE_AFTER_DAYS = 8
DROP_AFTER_DAYS = 30
MAX_PRICE_ROWS_PER_PLACE = 3

# Checked against every key at every depth. No legitimate key trips it, so
# there is no allow-list; if one is ever needed it belongs here, by exact name.
PII_KEY = re.compile(r"name|address|pin|registrationdate|api.?key", re.IGNORECASE)

# A data.gov.in API key is 56 hex characters. Unlike validateRow's bounded
# pattern, this one matches a key buried inside a longer hex run too, so the one
# 64-character hex value a row legitimately carries, provenance.script_sha256,
# is exempted by position and only when it is exactly a sha256.
KEY_RUN = re.compile(r"[0-9a-f]{56}", re.IGNORECASE)
SHA256 = re.compile(r"[0-9a-f]{64}")

# Personal data from the Udyam unit list that must never reach a row, as a
# value any more than as a key, and a full API URL, which is how a key would
# most likely leak.
FORBIDDEN_TEXT = (
    "api-key",
    "api.data.gov.in",
    "enterprisename",
    "communicationaddress",
    "registrationdate",
    "pincode",
)

FETCHED_AT = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+05:30")
IST = timezone(timedelta(hours=5, minutes=30))


# ---------------------------------------------------------------- reference data


def _read(path):
    if not path.is_file():
        raise AssertionError(f"{path.relative_to(REPO_ROOT)} is missing; the market guards read it.")
    return path.read_text(encoding="utf-8")


@lru_cache(maxsize=None)
def commodities():
    data = json.loads(_read(COMMODITIES_FILE))
    return {entry["id"]: entry for entry in data["commodities"]}


@lru_cache(maxsize=None)
def nic_map():
    return json.loads(_read(NIC_MAP_FILE))


@lru_cache(maxsize=None)
def dictionary_en():
    """The `en` dict of backendStrings.js, as {key: English}."""
    lines = _read(BACKEND_STRINGS_FILE).replace("\r", "").split("\n")
    start = lines.index("const en = {")
    entries = {}
    for line in lines[start + 1:]:
        if line.startswith("}"):
            break
        match = re.fullmatch(r"  '([^']+)': '(.*)',", line)
        if match:
            entries[match.group(1)] = re.sub(r"\\(['\\])", r"\1", match.group(2))
    return entries


@lru_cache(maxsize=None)
def locations():
    """indiaLocations.js as {state: frozenset of district names}."""
    text = _read(LOCATIONS_FILE)
    found = re.findall(
        r"name:\s*'([^']+)',\s*hi:\s*'[^']*',\s*districts:\s*\[([^\]]*)\]",
        text,
    )
    return {state: frozenset(re.findall(r"'([^']*)'", districts)) for state, districts in found}


def _lib_english(name):
    """One of the English tables in tools/market-lib.mjs, as {code: English}."""
    text = _read(MARKET_LIB_FILE).replace("\r", "")
    block = re.search(r"export const " + name + r" = \{\n(.*?)\n\}", text, re.DOTALL)
    if not block:
        raise AssertionError(f"tools/market-lib.mjs has no `export const {name} = {{...}}` block.")
    entries = {}
    for line in block.group(1).split("\n"):
        match = re.fullmatch(r"\s*'([^']+)':\s*(?:'((?:[^'\\]|\\.)*)'|\"((?:[^\"\\]|\\.)*)\"),?", line)
        if match:
            value = match.group(2) if match.group(2) is not None else match.group(3)
            entries[match.group(1)] = re.sub(r"\\(.)", r"\1", value)
    return entries


# ---------------------------------------------------------------- small checks


def _is_int(value):
    return isinstance(value, int) and not isinstance(value, bool)


def _is_number(value):
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
    )


def _has_decimals(value, places):
    return _is_number(value) and round(value, places) == value


def _ymd(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def ist_date(timestamp):
    """
    The date in India of a data.gov.in timestamp, as yyyy-mm-dd.

    The API sends UTC, and a timestamp with no zone is read as UTC too, the same
    way the fetch reads it. 23:40 UTC on the 22nd is the 23rd in India.
    """
    if not isinstance(timestamp, str):
        return None
    text = timestamp.strip()
    if re.search(r"T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$", text):
        text += "+00:00"
    try:
        moment = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(IST).date().isoformat()


def attribution(publisher, title, page_url, updated_after):
    """The GODL-India attribution sentence, exactly as the fetch writes it."""
    day = ist_date(updated_after)
    if day is None:
        return None
    yyyy, mm, dd = day.split("-")
    return (
        f"{publisher}, {yyyy}, {title}, Open Government Data Platform India, "
        f"{dd}/{mm}, {page_url}. Published under {LICENCE}: {LICENCE_URL}."
    )


def _walk(value, path=()):
    """Yield ("key", path) for every dict key and ("string", path, text) for every string."""
    if isinstance(value, dict):
        for key, item in value.items():
            yield ("key", path + (str(key),), None)
            yield from _walk(item, path + (str(key),))
    elif isinstance(value, list):
        for index, item in enumerate(value):
            yield from _walk(item, path + (str(index),))
    elif isinstance(value, str):
        yield ("string", path, value)


def _secret_problems(row):
    problems = []
    for kind, path, text in _walk(row):
        where = ".".join(path)
        if kind == "key":
            if PII_KEY.search(path[-1]):
                problems.append(f'key "{where}" looks like personal data or a secret')
            continue

        is_sha = path == ("provenance", "script_sha256") and SHA256.fullmatch(text)
        if not is_sha and KEY_RUN.search(text):
            problems.append(f'string at "{where}" carries a 56-character hex run, the shape of an API key')

        lowered = text.lower()
        for forbidden in FORBIDDEN_TEXT:
            if forbidden in lowered:
                problems.append(f'string at "{where}" contains "{forbidden}"')
    return problems


# ---------------------------------------------------------------- the guard


def check_row(row):
    """Every problem with one market row, as a list of sentences. [] is a pass."""
    if not isinstance(row, dict):
        return ["row is not an object"]

    problems = []
    bad = problems.append
    metric = row.get("metric")

    # Keys.
    if metric == METRIC_PRICE:
        required = COMMON_KEYS + PRICE_KEYS
    elif metric == METRIC_COUNT:
        required = COMMON_KEYS + COUNT_KEYS
    else:
        bad(f'metric "{metric}" is not {METRIC_PRICE} or {METRIC_COUNT}')
        required = COMMON_KEYS
    allowed = set(required) | set(OPTIONAL_KEYS.get(metric, ("note_code", "note")))

    for key in required:
        if key not in row:
            bad(f'missing key "{key}"')
    for key in row:
        if key not in allowed:
            bad(f'unexpected key "{key}" on a {metric} row')
        if re.search(r"_codes?$", key) and key not in ("source_code", "note_code"):
            bad(f'"{key}" ends in _code, so keycheck would read it as a translation code')

    problems.extend(_secret_problems(row))

    # Place.
    state = row.get("state")
    district = row.get("district")
    scope = row.get("scope")
    places = locations()

    if not isinstance(state, str) or not state:
        bad("state must be a non-empty string")
    elif state not in places:
        bad(f'state "{state}" is not a state in indiaLocations.js')

    if scope not in ("district", "state"):
        bad(f'scope "{scope}" is not district or state')
    elif scope == "state" and district != "":
        bad('a state row must have district ""')
    elif scope == "district":
        if not isinstance(district, str) or not district:
            bad("a district row must name its district")
        elif state in places and district not in places[state]:
            bad(f'district "{district}" is not a district of {state} in indiaLocations.js')

    category = row.get("business_category")
    if category not in CATEGORIES:
        bad(f'business_category "{category}" is not a category value')

    # Source and note, against the dictionary English.
    english = dictionary_en()
    source_code = row.get("source_code")
    if source_code not in SOURCE_EN:
        bad(f'source_code "{source_code}" is not one of {", ".join(SOURCE_EN)}')
    elif source_code in english and row.get("source") != english[source_code]:
        bad("source is not the English of source_code in backendStrings.js")

    last_verified = _ymd(row.get("last_verified"))
    if last_verified is None:
        bad("last_verified is not yyyy-mm-dd")

    if ("note_code" in row) != ("note" in row):
        bad("note_code and note must be both present or both absent")
    elif "note_code" in row:
        note_code = row["note_code"]
        if note_code not in NOTE_EN:
            bad(f'note_code "{note_code}" is not a known note')
        if not isinstance(row["note"], str):
            bad("note must be a string, never null")
        elif note_code in english and row["note"] != english[note_code]:
            bad("note is not the English of note_code in backendStrings.js")

    # Provenance.
    provenance = row.get("provenance")
    if not isinstance(provenance, dict):
        bad("provenance must be an object")
        provenance = None
    else:
        problems.extend(_provenance_problems(provenance, metric))

    if metric == METRIC_PRICE:
        problems.extend(_price_problems(row, provenance, last_verified))
    elif metric == METRIC_COUNT:
        problems.extend(_count_problems(row, provenance))

    return problems


def _provenance_problems(p, metric):
    problems = []
    bad = problems.append

    for key in PROVENANCE_KEYS:
        if key not in p:
            bad(f'provenance is missing "{key}"')
    # Closed, like the row itself: an extra key here is how a raw API record or
    # a debugging field would ride into the shipped file unnoticed.
    for key in p:
        if key not in PROVENANCE_KEYS:
            bad(f'unexpected key "provenance.{key}"')

    if p.get("licence") != LICENCE:
        bad("provenance.licence is not GODL-India")
    if p.get("licence_url") != LICENCE_URL:
        bad("provenance.licence_url is not the GODL-India URL")

    updated = p.get("resource_updated_date")
    if (
        not isinstance(updated, dict)
        or sorted(updated) != ["after", "before"]
        or not isinstance(updated.get("before"), str)
        or ist_date(updated.get("after")) is None
    ):
        bad("provenance.resource_updated_date must be {before, after} timestamps")
        updated = None

    page_url = p.get("page_url")
    text = p.get("attribution")
    if not isinstance(text, str) or not page_url or page_url not in text or LICENCE_URL not in text:
        bad("provenance.attribution must contain the page URL and the licence URL")
    elif updated is not None:
        expected = attribution(p.get("publisher"), p.get("resource_title"), page_url, updated["after"])
        if text != expected:
            bad("provenance.attribution is not the GODL-India sentence for this resource and date")

    if not isinstance(p.get("resource_title"), str) or not p.get("resource_title"):
        bad("provenance.resource_title must be the resource's title")
    if not isinstance(p.get("query"), str):
        bad("provenance.query must be a string")
    if not isinstance(p.get("fetched_at"), str) or not FETCHED_AT.fullmatch(p["fetched_at"]):
        bad("provenance.fetched_at must be ISO with +05:30")
    if not isinstance(p.get("script_sha256"), str) or not SHA256.fullmatch(p["script_sha256"]):
        bad("provenance.script_sha256 is not a sha256")
    if not isinstance(p.get("method"), str) or not p["method"]:
        bad("provenance.method must be a sentence")
    if _ymd(p.get("period_end")) is None:
        bad("provenance.period_end is not yyyy-mm-dd")
    if not _is_int(p.get("crosswalk_version")):
        bad("provenance.crosswalk_version must be the crosswalk's version")

    for key in ("total_reported", "rows_fetched", "rows_used"):
        if not _is_int(p.get(key)) or p[key] < 0:
            bad(f"provenance.{key} must be a whole number")

    drops = PRICE_DROPS if metric == METRIC_PRICE else COUNT_DROPS
    dropped = p.get("rows_dropped")
    if (
        not isinstance(dropped, dict)
        or sorted(dropped) != sorted(drops)
        or not all(_is_int(dropped[key]) and dropped[key] >= 0 for key in drops)
    ):
        bad(f"provenance.rows_dropped must be {{{', '.join(drops)}}}")

    return problems


def _cites(p, kind):
    resource = RESOURCES[kind]
    return (
        p.get("resource_id") == resource["id"]
        and p.get("publisher") == resource["publisher"]
        and p.get("page_url") == resource["page_url"]
    )


def _price_problems(row, p, last_verified):
    problems = []
    bad = problems.append

    if row.get("business_category") != "agriculture":
        bad("a price row must be agriculture")
    if row.get("source_code") != "src.agmarknetMandi":
        bad("a price row must come from Agmarknet")

    commodity = commodities().get(row.get("commodity_id"))
    if commodity is None:
        bad(f'commodity_id "{row.get("commodity_id")}" is not in tools/market-commodities.json')
    else:
        if row.get("commodity") != commodity["en"]:
            bad("commodity is not the English of its commodity_id")
        english = dictionary_en()
        if commodity["cmd"] in english and row.get("commodity") != english[commodity["cmd"]]:
            bad(f"commodity is not the English of {commodity['cmd']} in backendStrings.js")

    if row.get("unit") != "kg":
        bad('unit must be "kg"')

    prices = [row.get(key) for key in ("price_low", "indicative_price", "price_high")]
    for key, value in zip(("price_low", "indicative_price", "price_high"), prices):
        if not _has_decimals(value, 2) or value < 0:
            bad(f"{key} must be a non-negative number of rupees with at most 2 decimals")
    if all(_is_number(value) for value in prices):
        low, middle, high = prices
        if not (low <= middle <= high):
            bad("price_low <= indicative_price <= price_high does not hold")
        if commodity is not None:
            floor, ceiling = commodity["kg_band"]
            if low < floor or high > ceiling:
                bad(f"the price range falls outside the commodity's kg_band {commodity['kg_band']}")

    n_days = row.get("n_days")
    if not _is_int(n_days) or not MIN_DAYS <= n_days <= MAX_DAYS:
        bad(f"n_days must be a whole number from {MIN_DAYS} to {MAX_DAYS}")
    if not _is_int(row.get("n_markets")) or row["n_markets"] < 1:
        bad("n_markets must be a whole number of at least 1")

    if "stale" in row and row["stale"] is not True:
        bad("stale may only be present as true")

    last_reported = _ymd(row.get("last_reported"))
    if last_reported is None:
        bad("last_reported is not yyyy-mm-dd")
    elif last_verified is not None:
        # Age is measured against the fetch date, which is last_verified.
        age = (last_verified - last_reported).days
        if age < 0:
            bad("last_reported is after the fetch date")
        elif age > DROP_AFTER_DAYS:
            bad(f"last_reported is {age} days before the fetch; older than {DROP_AFTER_DAYS} must not be shown")
        elif (age >= STALE_AFTER_DAYS) != (row.get("stale") is True):
            bad(f"stale must be true exactly when the last price is {STALE_AFTER_DAYS} or more days old (it is {age})")

    if p is not None:
        if not _cites(p, "agmarknet"):
            bad("a price row must cite the Agmarknet history resource")
        if p.get("nic_map_version") is not None:
            bad("provenance.nic_map_version must be null on a price row")
        period_start = _ymd(p.get("period_start"))
        if period_start is None:
            bad("provenance.period_start is not yyyy-mm-dd")
        if p.get("period_end") != row.get("last_reported"):
            bad("provenance.period_end must be the last date used, last_reported")
        elif period_start is not None and last_reported is not None and period_start > last_reported:
            bad("provenance.period_start is after period_end")

    return problems


def _count_problems(row, p):
    problems = []
    bad = problems.append

    count = row.get("count")
    share = row.get("share_percent")
    total = row.get("district_total")
    nic_classes = row.get("nic_classes")
    category = row.get("business_category")
    source_code = row.get("source_code")

    if not (count is None or (_is_int(count) and count >= MIN_COUNT)):
        bad(f"count must be null or a whole number of at least {MIN_COUNT}")
    suppressed = row.get("count_suppressed")
    if not isinstance(suppressed, bool) or suppressed != (count is None):
        bad("count_suppressed must be true exactly when count is null")
    if not (share is None or (_has_decimals(share, 1) and 0 <= share <= 100)):
        bad("share_percent must be null or a number with 1 decimal")
    if not (total is None or (_is_int(total) and total > 0)):
        bad("district_total must be null or a whole number")
    if not isinstance(nic_classes, list) or not all(isinstance(item, str) for item in nic_classes):
        bad("nic_classes must be a list of strings")

    if suppressed is True and share is not None:
        bad("a suppressed count must have a null share")
    if share is not None:
        if not _is_int(count) or not _is_int(total) or total <= 0:
            bad("share_percent needs a count and a district_total")
        elif _is_number(share) and abs(share - count / total * 100) > 0.05 + 1e-9:
            bad("share_percent does not equal count / district_total to 1 decimal")

    if source_code == "src.udyamAggregate":
        kind = AGGREGATE_KINDS.get(category)
        if kind is None:
            bad("an aggregate row must be services or manufacturing")
        if share is not None or total is not None:
            bad("an aggregate row must have a null share and a null district_total")
        if nic_classes != []:
            bad("an aggregate row must have nic_classes []")
        if kind is not None:
            if row.get("note_code") != kind[1]:
                bad(f"an aggregate {category} row must carry {kind[1]}")
            if p is not None and not _cites(p, kind[0]):
                bad("the aggregate row cites the wrong resource")
        if p is not None and p.get("nic_map_version") is not None:
            bad("provenance.nic_map_version must be null on an aggregate row: no NIC map was used")

    elif source_code == "src.udyamList":
        mapping = nic_map()
        entry = mapping["categories"].get(category)
        if category == "agriculture":
            bad("agriculture gets prices only, never a count")
        elif entry is None:
            bad(f'"{category}" is not in the NIC map')
        else:
            if row.get("note_code") != entry.get("note_code"):
                bad("the note does not match the NIC map for this category")
            if nic_classes != [str(prefix) for prefix in entry["include"]]:
                bad("nic_classes are not the NIC map's include prefixes for this category")
            floor = entry.get("emit_if_count_at_least")
            if floor is not None and (count is None or count < floor):
                bad(f"a {category} row is only emitted with a count of at least {floor}")
        if row.get("scope") == "district" and total is None:
            bad("a district list row must carry the district total")
        if p is not None:
            if not _cites(p, "udyamList"):
                bad("a list row must cite the Udyam list resource")
            if p.get("nic_map_version") != mapping.get("version"):
                bad("provenance.nic_map_version must be the NIC map's version on a list row")

    elif source_code == "src.agmarknetMandi":
        bad("a count row cannot come from Agmarknet")

    if p is not None:
        if p.get("period_start") is not None:
            bad("provenance.period_start must be null on a count row")
        updated = p.get("resource_updated_date")
        after = updated.get("after") if isinstance(updated, dict) else None
        if ist_date(after) is not None and p.get("period_end") != ist_date(after):
            bad("provenance.period_end must be the IST date of resource_updated_date.after")

    return problems


def _identity(row):
    what = row.get("commodity_id") if row.get("metric") == METRIC_PRICE else row.get("business_category")
    return (row.get("state"), row.get("district"), row.get("metric"), what)


def _sort_key(row):
    # The fetch's own order: state; the state row before district rows;
    # district; price rows before count rows; count rows by category. Price rows
    # keep their emission order, which the stable sort preserves.
    is_price = row.get("metric") == METRIC_PRICE
    return (
        str(row.get("state") or ""),
        0 if row.get("scope") == "state" else 1,
        str(row.get("district") or ""),
        0 if is_price else 1,
        "" if is_price else str(row.get("business_category") or ""),
    )


def check_rows(rows):
    """Every problem with a whole market_data.json, as a list of sentences."""
    if not isinstance(rows, list):
        return ["market_data.json is not a top-level JSON array"]

    problems = []
    for index, row in enumerate(rows):
        problems.extend(f"row {index}: {problem}" for problem in check_row(row))

    rows = [row for row in rows if isinstance(row, dict)]

    seen = set()
    for row in rows:
        identity = _identity(row)
        if identity in seen:
            problems.append(f"duplicate row for {' / '.join(map(str, identity))}")
        seen.add(identity)

    sources_by_place = {}
    price_rows_by_place = {}
    for row in rows:
        place = (row.get("state"), row.get("district"))
        sources_by_place.setdefault(place, set()).add(row.get("source_code"))
        if row.get("metric") == METRIC_PRICE:
            price_rows_by_place[place] = price_rows_by_place.get(place, 0) + 1

    for place, sources in sources_by_place.items():
        if {"src.udyamList", "src.udyamAggregate"} <= sources:
            problems.append(f"{' / '.join(place)} mixes Ministry aggregate and unit-list counts")
    for place, number in price_rows_by_place.items():
        if number > MAX_PRICE_ROWS_PER_PLACE:
            problems.append(
                f"{' / '.join(place)} has {number} price rows; at most {MAX_PRICE_ROWS_PER_PLACE} are shown"
            )

    if rows != sorted(rows, key=_sort_key):
        problems.append("rows are not in the fetch's sort order")

    return problems


# ---------------------------------------------------------------- the data passes


def _real_rows():
    return json.loads(MARKET_FILE.read_text(encoding="utf-8"))


@pytest.mark.parametrize(
    "load_rows",
    [_real_rows, synthetic_rows],
    ids=["real-market-data-file", "synthetic-rows"],
)
def test_market_rows_pass_every_guard(load_rows):
    assert check_rows(load_rows()) == []


def test_the_real_market_data_file_is_a_json_array():
    assert isinstance(_real_rows(), list)


def test_the_synthetic_rows_cover_every_shape_the_guard_distinguishes():
    """If the fixture lost a shape, the mutation table below would stop proving anything for it."""
    rows = synthetic_rows()
    sources = {row["source_code"] for row in rows}

    assert sources == set(SOURCE_EN)
    assert any(row["scope"] == "state" for row in rows)
    assert any(row.get("stale") is True for row in rows)
    assert any(row["metric"] == METRIC_PRICE and "stale" not in row for row in rows)
    assert any(row.get("count_suppressed") is True for row in rows)
    assert any(row["metric"] == METRIC_COUNT and row["count"] is not None and row["share_percent"] is not None for row in rows)
    assert len({row["district"] for row in rows if row["scope"] == "district"}) >= 2


def test_the_dictionary_and_the_fetch_carry_the_same_english():
    """
    A row's source, note and commodity are compared with the dictionary's
    English, so the fetch has to write exactly that English. This catches the
    three sides drifting apart before any fetch has been run.
    """
    english = dictionary_en()

    for code, text in {**SOURCE_EN, **NOTE_EN}.items():
        assert english.get(code) == text, code

    assert _lib_english("SOURCE_EN") == SOURCE_EN
    assert _lib_english("NOTE_EN") == NOTE_EN

    for entry in commodities().values():
        assert english.get(entry["cmd"]) == entry["en"], entry["cmd"]


def test_the_location_names_parse():
    places = locations()

    assert len(places) == 36
    assert sum(len(districts) for districts in places.values()) == 768
    assert "Lucknow" in places["Uttar Pradesh"]


# ---------------------------------------------------------------- the guard fires

WHEAT, POTATO, SUPPRESSED, TAILORING, AGGREGATE, STATE_ROW = 1, 2, 3, 4, 5, 0


def _set(index, path, value):
    def mutate(rows):
        target = rows[index]
        for key in path[:-1]:
            target = target[key]
        target[path[-1]] = value
    return mutate


def _delete(index, path):
    def mutate(rows):
        target = rows[index]
        for key in path[:-1]:
            target = target[key]
        del target[path[-1]]
    return mutate


def _append(index, path, suffix):
    def mutate(rows):
        target = rows[index]
        for key in path[:-1]:
            target = target[key]
        target[path[-1]] += suffix
    return mutate


def _both(*mutations):
    def mutate(rows):
        for mutation in mutations:
            mutation(rows)
    return mutate


ROW_MUTATIONS = [
    # Prices.
    ("price_low above the indicative price", _set(WHEAT, ("price_low",), 27.0), "price_low <= indicative_price"),
    ("price_high below the indicative price", _set(WHEAT, ("price_high",), 26.0), "price_low <= indicative_price"),
    ("a price with three decimals", _set(WHEAT, ("indicative_price",), 26.905), "at most 2 decimals"),
    ("a price that is a bool", _set(WHEAT, ("price_low",), True), "at most 2 decimals"),
    ("a negative price", _set(WHEAT, ("price_low",), -1.0), "at most 2 decimals"),
    ("a price outside the commodity band", _set(WHEAT, ("price_high",), 85.0), "kg_band"),
    ("n_days below the floor", _set(WHEAT, ("n_days",), 7), "n_days"),
    ("n_days above the last-30-dates cut", _set(WHEAT, ("n_days",), 31), "n_days"),
    ("no market", _set(WHEAT, ("n_markets",), 0), "n_markets"),
    ("an unknown commodity", _set(WHEAT, ("commodity_id",), "rice"), "market-commodities.json"),
    ("the wrong commodity English", _set(WHEAT, ("commodity",), "Wheat flour"), "English of its commodity_id"),
    ("a missing commodity_id", _delete(WHEAT, ("commodity_id",)), 'missing key "commodity_id"'),
    ("a commodity_code field", _set(WHEAT, ("commodity_code",), "wheat"), "ends in _code"),
    ("a price per quintal", _set(WHEAT, ("unit",), "quintal"), 'unit must be "kg"'),
    ("a price row that is not agriculture", _set(WHEAT, ("business_category",), "dairy"), "must be agriculture"),
    ("stale written as false", _set(POTATO, ("stale",), False), "stale may only be present as true"),
    ("a stale price not marked stale", _delete(POTATO, ("stale",)), "stale must be true exactly when"),
    ("a fresh price marked stale", _set(WHEAT, ("stale",), True), "stale must be true exactly when"),
    (
        "a price too old to show",
        _both(_set(POTATO, ("last_reported",), "2026-08-20"), _set(POTATO, ("provenance", "period_end"), "2026-08-20")),
        "must not be shown",
    ),
    (
        "a price reported after the fetch",
        _both(_set(WHEAT, ("last_reported",), "2026-09-24"), _set(WHEAT, ("provenance", "period_end"), "2026-09-24")),
        "after the fetch date",
    ),
    ("a price period that ends early", _set(WHEAT, ("provenance", "period_end"), "2026-09-21"), "the last date used"),
    ("a price period that starts late", _set(WHEAT, ("provenance", "period_start"), "2026-09-23"), "period_start is after"),
    ("a price row with a NIC map version", _set(WHEAT, ("provenance", "nic_map_version"), 1), "nic_map_version must be null"),
    ("a price row citing the Udyam list", _set(WHEAT, ("provenance", "resource_id"), UDYAM_LIST_ID), "Agmarknet history"),
    # Counts.
    ("count_suppressed disagreeing with count", _set(TAILORING, ("count_suppressed",), True), "count_suppressed must be true"),
    ("a count under the floor", _set(TAILORING, ("count",), 9), "at least 10"),
    ("a count that is a float", _set(TAILORING, ("count",), 1843.0), "at least 10"),
    ("a share that does not match", _set(TAILORING, ("share_percent",), 0.9), "count / district_total"),
    ("a share with two decimals", _set(TAILORING, ("share_percent",), 0.74), "1 decimal"),
    ("a suppressed count with a share", _set(SUPPRESSED, ("share_percent",), 0.1), "suppressed count must have a null share"),
    ("a district list row with no total", _both(_set(TAILORING, ("district_total",), None), _set(TAILORING, ("share_percent",), None)), "district total"),
    ("list nic_classes that are not the map's", _set(TAILORING, ("nic_classes",), ["1410", "1411"]), "include prefixes"),
    (
        "a note the NIC map does not give",
        _both(_set(TAILORING, ("note_code",), "mknote.ourGrouping"), _set(TAILORING, ("note",), NOTE_OUR_GROUPING)),
        "does not match the NIC map",
    ),
    ("an agriculture count", _set(TAILORING, ("business_category",), "agriculture"), "prices only"),
    (
        "a dairy count below its own floor",
        _both(
            _set(SUPPRESSED, ("business_category",), "dairy"),
            _set(SUPPRESSED, ("nic_classes",), ["1050"]),
            _set(SUPPRESSED, ("note_code",), "mknote.dairyProducts"),
            _set(SUPPRESSED, ("note",), NOTE_EN["mknote.dairyProducts"]),
        ),
        "only emitted with a count of at least",
    ),
    ("a list row with no NIC map version", _set(TAILORING, ("provenance", "nic_map_version"), None), "NIC map's version"),
    ("a list row citing Agmarknet", _set(TAILORING, ("provenance", "resource_id"), AGMARKNET_ID), "Udyam list resource"),
    ("a count period on the UTC date", _set(TAILORING, ("provenance", "period_end"), "2026-09-22"), "IST date"),
    ("a count period with a start", _set(TAILORING, ("provenance", "period_start"), "2026-08-01"), "period_start must be null"),
    ("a count row from Agmarknet", _both(_set(TAILORING, ("source_code",), "src.agmarknetMandi"), _set(TAILORING, ("source",), SOURCE_EN["src.agmarknetMandi"])), "cannot come from Agmarknet"),
    # Aggregates.
    ("an aggregate with a share", _both(_set(AGGREGATE, ("share_percent",), 1.2), _set(AGGREGATE, ("district_total",), 3000000)), "null share and a null district_total"),
    ("an aggregate with NIC classes", _set(AGGREGATE, ("nic_classes",), ["49-96"]), "nic_classes []"),
    (
        "an aggregate with our grouping note",
        _both(_set(AGGREGATE, ("note_code",), "mknote.ourGrouping"), _set(AGGREGATE, ("note",), NOTE_OUR_GROUPING)),
        "must carry mknote.ministryServices",
    ),
    ("an aggregate citing the unit list", _set(AGGREGATE, ("provenance", "resource_id"), UDYAM_LIST_ID), "wrong resource"),
    ("an aggregate for tailoring", _set(AGGREGATE, ("business_category",), "tailoring"), "services or manufacturing"),
    ("an aggregate with a NIC map version", _set(AGGREGATE, ("provenance", "nic_map_version"), 1), "no NIC map was used"),
    # Notes and sources.
    ("a note without its code", _delete(AGGREGATE, ("note_code",)), "both present or both absent"),
    ("a code without its note", _delete(AGGREGATE, ("note",)), "both present or both absent"),
    ("a null note", _set(AGGREGATE, ("note",), None), "never null"),
    ("a note in other words", _set(AGGREGATE, ("note",), NOTE_MINISTRY_SERVICES + " Roughly."), "English of note_code"),
    ("an unknown note", _set(AGGREGATE, ("note_code",), "mknote.madeUp"), "not a known note"),
    ("a source in other words", _set(TAILORING, ("source",), "Udyam registrations"), "English of source_code"),
    ("the old illustrative source", _set(TAILORING, ("source_code",), "src.prototypeEstimate"), "is not one of"),
    # Place and shape.
    ("an unknown scope", _set(TAILORING, ("scope",), "block"), "is not district or state"),
    ("an unknown metric", _set(TAILORING, ("metric",), "price"), "is not wholesale_price_per_kg"),
    ("a state row naming a district", _set(STATE_ROW, ("district",), "Lucknow"), 'must have district ""'),
    ("a district row with no district", _set(TAILORING, ("district",), ""), "must name its district"),
    ("a district that is not in the dropdown", _set(TAILORING, ("district",), "Kanpur"), "is not a district of"),
    ("a misspelt state", _set(TAILORING, ("state",), "Utter Pradesh"), "is not a state"),
    ("the Other category", _set(TAILORING, ("business_category",), "other"), "not a category value"),
    ("a bad last_verified", _set(TAILORING, ("last_verified",), "23/09/2026"), "last_verified is not"),
    ("the old demand field", _set(TAILORING, ("demand_indicator",), "medium"), 'unexpected key "demand_indicator"'),
    ("the old seasonality field", _set(TAILORING, ("seasonality",), "Festive"), 'unexpected key "seasonality"'),
    ("the old seasonality code", _set(TAILORING, ("seasonality_code",), "seas.festive"), "ends in _code"),
    # Provenance.
    ("provenance that is not an object", _set(TAILORING, ("provenance",), "data.gov.in"), "provenance must be an object"),
    ("provenance missing its method", _delete(TAILORING, ("provenance", "method")), 'missing "method"'),
    ("the wrong licence", _set(TAILORING, ("provenance", "licence"), "CC BY 4.0"), "licence is not GODL-India"),
    ("the licence URL over http", _set(TAILORING, ("provenance", "licence_url"), "http://www.data.gov.in/Godl"), "licence_url"),
    ("an attribution missing the page", _set(TAILORING, ("provenance", "attribution"), "data.gov.in. " + LICENCE_URL), "contain the page URL"),
    (
        "an attribution dated in UTC",
        lambda rows: rows[TAILORING]["provenance"].update(
            attribution=rows[TAILORING]["provenance"]["attribution"].replace("23/09", "22/09")
        ),
        "GODL-India sentence",
    ),
    ("the wrong publisher", _set(TAILORING, ("provenance", "publisher"), "Someone else"), "GODL-India sentence"),
    ("a missing update date", _delete(TAILORING, ("provenance", "resource_updated_date", "after")), "resource_updated_date"),
    ("fetched_at in UTC", _set(TAILORING, ("provenance", "fetched_at"), "2026-09-23T04:45:00Z"), "+05:30"),
    ("a script hash that is not one", _set(TAILORING, ("provenance", "script_sha256"), "abc"), "not a sha256"),
    ("a query that is not a string", _set(TAILORING, ("provenance", "query"), None), "query must be a string"),
    ("a negative row count", _set(TAILORING, ("provenance", "rows_used"), -1), "rows_used must be"),
    ("a row count that is a bool", _set(TAILORING, ("provenance", "total_reported"), True), "total_reported must be"),
    ("price drops missing a reason", _delete(WHEAT, ("provenance", "rows_dropped", "dupes")), "rows_dropped must be"),
    ("count drops with a price reason", _set(TAILORING, ("provenance", "rows_dropped", "zero"), 0), "rows_dropped must be"),
    ("no crosswalk version", _set(TAILORING, ("provenance", "crosswalk_version"), None), "crosswalk_version"),
    ("a debugging field in provenance", _set(TAILORING, ("provenance", "debug"), "page 3 of 40"), 'unexpected key "provenance.debug"'),
    (
        "a raw API record riding in provenance",
        _set(TAILORING, ("provenance", "records"), [{"LG_DT_Code": "162", "Activities": "[]"}]),
        'unexpected key "provenance.records"',
    ),
    ("a third update date", _set(TAILORING, ("provenance", "resource_updated_date", "during"), "2026-09-23"), "resource_updated_date"),
    # Personal data and secrets.
    ("a unit name in provenance", _set(TAILORING, ("provenance", "EnterpriseName"), "Sharma Tailors"), "personal data or a secret"),
    ("a pincode key", _set(TAILORING, ("provenance", "unit_pincode"), "226001"), "personal data or a secret"),
    ("an api_key key", _set(TAILORING, ("provenance", "api_key"), "x"), "personal data or a secret"),
    ("an address key at the top", _set(TAILORING, ("CommunicationAddress",), "x"), "personal data or a secret"),
    ("a key-shaped hex run in the query", _append(TAILORING, ("provenance", "query"), "&x=" + "a" * 56), "56-character hex run"),
    ("a key inside a longer hex run", _append(TAILORING, ("provenance", "method"), " " + "0" * 60), "56-character hex run"),
    ("a key in the script hash slot", _set(TAILORING, ("provenance", "script_sha256"), "b" * 56), "56-character hex run"),
    ("api-key in the query", _append(TAILORING, ("provenance", "query"), "&api-key=x"), 'contains "api-key"'),
    ("a full API URL", _set(TAILORING, ("provenance", "query"), "https://api.data.gov.in/resource/x?limit=1"), 'contains "api.data.gov.in"'),
    ("a Udyam field name as a value", _append(TAILORING, ("provenance", "method"), " EnterpriseName"), 'contains "enterprisename"'),
]


@pytest.mark.parametrize(
    "mutate, expected",
    [(mutate, expected) for _, mutate, expected in ROW_MUTATIONS],
    ids=[name for name, _, _ in ROW_MUTATIONS],
)
def test_the_guard_reports_a_broken_row(mutate, expected):
    rows = synthetic_rows()
    mutate(rows)

    problems = check_rows(rows)

    assert problems, "the guard passed a row it should have refused"
    assert any(expected in problem for problem in problems), problems


def _extra_price_row(commodity_id, english, band_price):
    row = synthetic_rows()[WHEAT]
    row.update(
        commodity=english,
        commodity_id=commodity_id,
        indicative_price=band_price,
        price_low=band_price,
        price_high=band_price,
    )
    return row


def _lucknow_aggregate(rows):
    row = rows[AGGREGATE]
    return {**row, "district": "Lucknow", "provenance": dict(row["provenance"])}


FILE_MUTATIONS = [
    ("a duplicate row", lambda rows: rows + [rows[TAILORING]], "duplicate row"),
    ("two count rows out of order", lambda rows: [rows[0], rows[1], rows[2], rows[4], rows[3], rows[5]], "sort order"),
    ("the state row after a district row", lambda rows: rows[1:2] + rows[0:1] + rows[2:], "sort order"),
    (
        "aggregate and list counts in one district",
        lambda rows: rows[:4] + [_lucknow_aggregate(rows)] + rows[4:],
        "mixes Ministry aggregate and unit-list counts",
    ),
    (
        "four price rows in one district",
        lambda rows: rows[:3]
        + [_extra_price_row("onion", "Onion", 30.0), _extra_price_row("tomato", "Tomato", 20.0)]
        + rows[3:],
        "at most 3 are shown",
    ),
    ("a top-level object", lambda rows: {"rows": rows}, "top-level JSON array"),
    ("an element that is not a row", lambda rows: rows + ["Lucknow"], "row is not an object"),
]


@pytest.mark.parametrize(
    "mutate, expected",
    [(mutate, expected) for _, mutate, expected in FILE_MUTATIONS],
    ids=[name for name, _, _ in FILE_MUTATIONS],
)
def test_the_guard_reports_a_broken_file(mutate, expected):
    problems = check_rows(mutate(synthetic_rows()))

    assert problems, "the guard passed a file it should have refused"
    assert any(expected in problem for problem in problems), problems


def test_swapping_two_price_rows_is_not_an_order_problem():
    """Price rows are shown in the order the fetch chose, so their order is data, not a sort mistake."""
    rows = synthetic_rows()
    rows[WHEAT], rows[POTATO] = rows[POTATO], rows[WHEAT]

    assert check_rows(rows) == []


def test_the_guard_does_not_change_the_rows_it_reads():
    rows = synthetic_rows()
    check_rows(rows)

    assert rows == SYNTHETIC_ROWS


# ---------------------------------------------------------------- the run file

RUN_FILE = BACKEND_DIR / "app" / "data" / "market_data.provenance.json"

RUN_KEYS = (
    "fetched_at",
    "script_sha256",
    "crosswalk_version",
    "nic_map_version",
    "commodities_version",
    "window_days",
    "districts_attempted",
    "districts_succeeded",
    "districts_failed",
    "rows_by_metric",
)
RUN_SOURCES = ("agmarknet", "udyam", "udyam-aggregate")

# The fixed classes fetch-market-data.mjs writes in place of the server's own
# words. A free-text reason can quote the server, so it never reaches this file.
REASON_CLASSES = (
    "timeout",
    "network",
    "http_429",
    "http_5xx",
    "http_401",
    "http_403",
    "http_404",
    "http_4xx",
    "not_json",
    "api_error",
    "no_total",
    "data_check",
    "unexpected",
)


def check_run(run):
    """Problems with market_data.provenance.json, the record of one --write run. It ships beside the rows."""
    problems = []
    bad = problems.append
    if not isinstance(run, dict):
        return ["the run file is not a JSON object"]

    for key in RUN_KEYS:
        if key not in run:
            bad(f'missing key "{key}"')
    for key in run:
        if key not in RUN_KEYS:
            bad(f'unexpected key "{key}"')

    if not (isinstance(run.get("fetched_at"), str) and FETCHED_AT.fullmatch(run["fetched_at"])):
        bad("fetched_at is not an IST timestamp")
    if not (isinstance(run.get("script_sha256"), str) and SHA256.fullmatch(run["script_sha256"])):
        bad("script_sha256 is not a sha256")
    if not (_is_int(run.get("window_days")) and run["window_days"] > 0):
        bad("window_days is not a positive whole number")

    places = {"state", "district"}
    for field, keys in (
        ("districts_attempted", places),
        ("districts_succeeded", places | {"source"}),
        ("districts_failed", places | {"source", "reason_class"}),
    ):
        entries = run.get(field)
        if not isinstance(entries, list):
            bad(f"{field} is not a list")
            continue
        for index, entry in enumerate(entries):
            if not isinstance(entry, dict) or set(entry) != keys:
                bad(f"{field}[{index}] does not carry exactly {sorted(keys)}")
                continue
            if "source" in keys and entry["source"] not in RUN_SOURCES:
                bad(f'{field}[{index}] names an unknown source "{entry["source"]}"')
            if "reason_class" in keys and entry["reason_class"] not in REASON_CLASSES:
                bad(f'{field}[{index}] has reason_class "{entry["reason_class"]}", which is not one of the fixed classes')

    by_metric = run.get("rows_by_metric")
    if not (isinstance(by_metric, dict) and set(by_metric) == {METRIC_PRICE, METRIC_COUNT} and all(_is_int(v) and v >= 0 for v in by_metric.values())):
        bad("rows_by_metric does not count exactly the two metrics")

    for kind, path, text in _walk(run):
        where = ".".join(path)
        if kind == "key":
            if PII_KEY.search(path[-1]):
                bad(f'key "{where}" looks like personal data or a secret')
            continue
        is_sha = path == ("script_sha256",) and SHA256.fullmatch(text)
        if not is_sha and KEY_RUN.search(text):
            bad(f'string at "{where}" carries a 56-character hex run, the shape of an API key')
        lowered = text.lower()
        for forbidden in FORBIDDEN_TEXT:
            if forbidden in lowered:
                bad(f'string at "{where}" contains "{forbidden}"')
    return problems


GOOD_RUN = {
    "fetched_at": "2026-09-24T10:15:00+05:30",
    "script_sha256": "a" * 64,
    "crosswalk_version": 1,
    "nic_map_version": 1,
    "commodities_version": 1,
    "window_days": 60,
    "districts_attempted": [{"state": "Uttar Pradesh", "district": "Lucknow"}],
    "districts_succeeded": [{"state": "Uttar Pradesh", "district": "Lucknow", "source": "agmarknet"}],
    "districts_failed": [{"state": "Uttar Pradesh", "district": "Lucknow", "source": "udyam", "reason_class": "timeout"}],
    "rows_by_metric": {METRIC_PRICE: 2, METRIC_COUNT: 1},
}


def _run_with(path, value):
    run = json.loads(json.dumps(GOOD_RUN))
    target = run
    for step in path[:-1]:
        target = target[step]
    target[path[-1]] = value
    return run


RUN_MUTATIONS = [
    ("the server's words in a failure", _run_with(("districts_failed", 0, "reason"), "HTTP 403 (Invalid key)"), "does not carry exactly"),
    ("an invented failure class", _run_with(("districts_failed", 0, "reason_class"), "HTTP 403 (Invalid key)"), "not one of the fixed classes"),
    ("an API URL", _run_with(("districts_failed", 0, "district"), "https://api.data.gov.in/resource/x"), "api.data.gov.in"),
    ("a key", _run_with(("districts_attempted", 0, "district"), "0" * 56), "56-character hex run"),
    ("a unit's name", _run_with(("districts_succeeded", 0, "EnterpriseName"), "Shree Tailors"), "looks like personal data"),
    ("a raw record list", _run_with(("records",), []), 'unexpected key "records"'),
    ("an unknown source", _run_with(("districts_succeeded", 0, "source"), "necc"), "unknown source"),
    ("no sha", _run_with(("script_sha256",), "abc"), "script_sha256"),
]


@pytest.mark.parametrize("run, expected", [(r, e) for _, r, e in RUN_MUTATIONS], ids=[n for n, _, _ in RUN_MUTATIONS])
def test_the_run_guard_reports_a_broken_run_file(run, expected):
    problems = check_run(run)

    assert any(expected in problem for problem in problems), problems


def test_the_run_guard_passes_a_good_run_file():
    assert check_run(GOOD_RUN) == []


def test_the_real_run_file_passes_the_run_guard():
    """Written only by a --write run, so absent until the owner has fetched."""
    if not RUN_FILE.is_file():
        pytest.skip("market_data.provenance.json is written by the first --write run")
    assert check_run(json.loads(RUN_FILE.read_text(encoding="utf-8"))) == []


def test_the_provenance_model_declares_every_provenance_key():
    """The API model drops undeclared keys, so it has to carry exactly the keys the guard allows."""
    from app.schemas.market import Provenance

    assert set(Provenance.model_fields) == set(PROVENANCE_KEYS)


def test_every_synthetic_row_survives_the_market_response_model():
    """Declaring the fields also types them; a row the guard passes must not fail response validation."""
    from app.schemas.market import MarketContext

    for row in synthetic_rows():
        body = {**row, "match_level": "district", "local_context": {}}
        dumped = MarketContext.model_validate(body).model_dump(exclude_unset=True)
        assert dumped["provenance"] == row["provenance"]
