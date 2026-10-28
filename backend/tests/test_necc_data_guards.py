"""
Guards on backend/app/data/necc_egg_prices.json.

The file is written by tools/fetch-necc-prices.mjs from the Daily Rate Sheet the
National Egg Co-ordination Committee (NECC) publishes, and real people will act
on what it says, so every row is checked here against the shape the fetch
promises, the words NECC asked to travel with its prices, and the reference
files the fetch itself reads: tools/necc-crosswalk.json, the English in
frontend/src/i18n/backendStrings.js and the state and district names in
frontend/src/data/indiaLocations.js.

The guard is two plain functions, check_row and check_rows, each returning a
list of problems, so the tests can prove each check FIRES as well as that the
data passes. Every guard test runs on the real file AND on
necc_fixtures.NECC_ROWS, and the mutation table at the bottom breaks one thing
at a time and asserts the matching problem is reported.

This mirrors validateRow in tools/necc-lib.mjs, which runs before the fetch will
write. Where the two differ, this side is the stricter one: the words that must
reach the reader are compared to copies written out in necc_fixtures.py, the
rows are compared to the crosswalk, and the file is checked for one run, for
duplicates and for its sort order.
"""

import hashlib
import json
import math
import re
from datetime import date
from functools import lru_cache
from pathlib import Path

import pytest

from app.schemas import market as market_schema
from market_fixtures import SCRIPT_SHA256
from necc_fixtures import (
    CLARIFICATION,
    CROSSWALK_VERSION,
    METHOD,
    NECC_ROWS,
    PAGE_URL,
    PERMISSION,
    PUBLISHER,
    SHEET,
    SOURCE_NECC,
    UNIT_READING,
    attribution,
    necc_rows,
)
from test_market_data_guards import dictionary_en, locations


BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_DIR.parent

NECC_FILE = BACKEND_DIR / "app" / "data" / "necc_egg_prices.json"
CROSSWALK_FILE = REPO_ROOT / "tools" / "necc-crosswalk.json"
LIB_FILE = REPO_ROOT / "tools" / "necc-lib.mjs"
FETCH_FILE = REPO_ROOT / "tools" / "fetch-necc-prices.mjs"

ROW_KEYS = (
    "state",
    "district",
    "business_category",
    "scope",
    "metric",
    "price_kind",
    "centre",
    "unit",
    "indicative_price",
    "last_reported",
    "stale",
    "source",
    "source_code",
    "last_verified",
    "provenance",
)

PROVENANCE_KEYS = (
    "publisher",
    "page_url",
    "sheet",
    "month",
    "centre_label",
    "published_value",
    "unit_reading",
    "permission",
    "fetched_at",
    "method",
    "crosswalk_version",
    "script_sha256",
    "clarification",
    "attribution",
)

PRICE_KINDS = ("suggested", "prevailing")

# NECC prints whole numbers with no unit; read as paise per egg, 100 to 2000 is
# one to twenty rupees an egg.
PRICE_MIN_PAISE = 100
PRICE_MAX_PAISE = 2000

STALE_AFTER_DAYS = 8
DROP_AFTER_DAYS = 30

SHA256 = re.compile(r"[0-9a-f]{64}")
FETCHED_AT = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+05:30")
MONTH = re.compile(r"(\d{4})-(0[1-9]|1[0-2])")

# Contact details of the people behind the data must never reach a row. A
# phone number is a run of ten or more digits with at most one space or hyphen
# between them; the one 64-character hex value a row carries, script_sha256, is
# exempted by position and only when it is exactly a sha256.
EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")
PHONE = re.compile(r"\d(?:[ -]?\d){9,}")


# ---------------------------------------------------------------- reference data


def _read(path):
    if not path.is_file():
        raise AssertionError(f"{path.relative_to(REPO_ROOT)} is missing; the NECC guards read it.")
    return path.read_text(encoding="utf-8")


@lru_cache(maxsize=None)
def crosswalk():
    return json.loads(_read(CROSSWALK_FILE))


def crosswalk_by_label():
    return {entry["necc"]: entry for entry in crosswalk()["entries"]}


def script_hash():
    """sha256 over necc-lib.mjs then fetch-necc-prices.mjs, as the fetch computes it."""
    digest = hashlib.sha256()
    for path in (LIB_FILE, FETCH_FILE):
        digest.update(path.read_bytes())
    return digest.hexdigest()


# ---------------------------------------------------------------- small checks


def _is_int(value):
    return isinstance(value, int) and not isinstance(value, bool)


def _is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _ymd(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def _walk_strings(value, path=()):
    if isinstance(value, dict):
        for key, item in value.items():
            yield from _walk_strings(item, path + (str(key),))
    elif isinstance(value, list):
        for index, item in enumerate(value):
            yield from _walk_strings(item, path + (str(index),))
    elif isinstance(value, str):
        yield path, value


# ---------------------------------------------------------------- the guard


def check_row(row):
    """Every problem with one egg-price row, as a list of sentences. [] is a pass."""
    if not isinstance(row, dict):
        return ["row is not an object"]

    problems = []
    bad = problems.append

    if set(row) != set(ROW_KEYS):
        extra = sorted(set(row) - set(ROW_KEYS))
        missing = sorted(set(ROW_KEYS) - set(row))
        bad(f"row keys differ: extra {extra}, missing {missing}")
        return problems

    provenance = row["provenance"]
    if not isinstance(provenance, dict):
        bad("provenance is not an object")
        return problems
    if set(provenance) != set(PROVENANCE_KEYS):
        extra = sorted(set(provenance) - set(PROVENANCE_KEYS))
        missing = sorted(set(PROVENANCE_KEYS) - set(provenance))
        bad(f"provenance keys differ: extra {extra}, missing {missing}")
        return problems

    # What the row is about.
    if row["business_category"] != "poultry":
        bad('business_category is not "poultry"')
    if row["metric"] != "egg_price":
        bad('metric is not "egg_price"')
    if row["unit"] != "egg":
        bad('unit is not "egg"')
    if row["price_kind"] not in PRICE_KINDS:
        bad(f"price_kind {row['price_kind']!r} is not one of {PRICE_KINDS}")
    if not isinstance(row["centre"], str) or not row["centre"] or row["centre"] != row["centre"].strip():
        bad("centre is not a trimmed non-empty string")

    # Where it is.
    state, district, scope = row["state"], row["district"], row["scope"]
    if state not in locations():
        bad(f"state {state!r} is not in indiaLocations.js")
    if scope == "district":
        if not district:
            bad("a district row has no district")
        elif state in locations() and district not in locations()[state]:
            bad(f"district {district!r} is not a district of {state}")
    elif scope == "state":
        if district != "":
            bad("a state row names a district")
    else:
        bad(f"scope {scope!r} is neither district nor state")

    # The price.
    price = row["indicative_price"]
    published = provenance["published_value"]
    if not _is_number(price) or not (PRICE_MIN_PAISE / 100 <= price <= PRICE_MAX_PAISE / 100):
        bad(f"indicative_price {price!r} is not a number from 1 to 20 rupees")
    elif round(price, 2) != price:
        bad(f"indicative_price {price!r} has more than two decimals")
    if not _is_int(published) or not (PRICE_MIN_PAISE <= published <= PRICE_MAX_PAISE):
        bad(f"provenance.published_value {published!r} is not a whole number from 100 to 2000")
    elif _is_number(price) and round(published / 100, 2) != price:
        bad(f"indicative_price {price!r} is not provenance.published_value {published!r} over 100")

    # The dates, and what they say about freshness.
    reported, verified = _ymd(row["last_reported"]), _ymd(row["last_verified"])
    month = provenance["month"]
    if reported is None:
        bad("last_reported is not a date")
    if verified is None:
        bad("last_verified is not a date")
    if not isinstance(month, str) or not MONTH.fullmatch(month):
        bad("provenance.month is not yyyy-mm")
    elif reported is not None and row["last_reported"][:7] != month:
        bad("last_reported is not in provenance.month")
    if reported is not None and verified is not None:
        age = (verified - reported).days
        if age < 0:
            bad("last_reported is after last_verified")
        if age > DROP_AFTER_DAYS:
            bad(f"last_reported is {age} days old, past the {DROP_AFTER_DAYS} a row may show")
        if not isinstance(row["stale"], bool):
            bad("stale is not a boolean")
        elif row["stale"] != (age >= STALE_AFTER_DAYS):
            bad(f"stale is {row['stale']} but the price is {age} days old")
    elif not isinstance(row["stale"], bool):
        bad("stale is not a boolean")

    # The words.
    if row["source_code"] != "src.necc":
        bad('source_code is not "src.necc"')
    if row["source"] != SOURCE_NECC or row["source"] != dictionary_en().get("src.necc"):
        bad("source is not the English of src.necc in backendStrings.js")
    if provenance["clarification"] != CLARIFICATION:
        bad("provenance.clarification is not NECC's own wording")
    if provenance["unit_reading"] != UNIT_READING:
        bad("provenance.unit_reading is not the agreed reading of the unit")
    for key, wanted in (
        ("publisher", PUBLISHER),
        ("page_url", PAGE_URL),
        ("sheet", SHEET),
        ("permission", PERMISSION),
        ("method", METHOD),
    ):
        if provenance[key] != wanted:
            bad(f"provenance.{key} is not {wanted!r}")
    if verified is not None and isinstance(month, str) and provenance["attribution"] != attribution(month, row["last_verified"]):
        bad("provenance.attribution is not the NECC attribution sentence")

    # The run.
    if not isinstance(provenance["fetched_at"], str) or not FETCHED_AT.fullmatch(provenance["fetched_at"]):
        bad("provenance.fetched_at is not an India-time timestamp")
    elif provenance["fetched_at"][:10] != row["last_verified"]:
        bad("last_verified is not the date of provenance.fetched_at")
    if not isinstance(provenance["script_sha256"], str) or not SHA256.fullmatch(provenance["script_sha256"]):
        bad("provenance.script_sha256 is not a sha256")
    if not _is_int(provenance["crosswalk_version"]) or provenance["crosswalk_version"] < 1:
        bad("provenance.crosswalk_version is not a positive whole number")
    if not isinstance(provenance["centre_label"], str) or not provenance["centre_label"]:
        bad("provenance.centre_label is empty")

    # Nobody's contact details, anywhere.
    for path, text in _walk_strings(row):
        is_sha = path == ("provenance", "script_sha256") and SHA256.fullmatch(text)
        if EMAIL.search(text) or (not is_sha and PHONE.search(text)):
            bad(f'string at "{".".join(path)}" looks like contact details')

    return problems


def check_rows(rows, by_label=None):
    """Every problem with a whole file's rows. An empty list is a problem, not a pass."""
    if not isinstance(rows, list):
        return ["file is not a list"]
    if not rows:
        return ["file has no rows"]

    problems = []
    bad = problems.append
    by_label = crosswalk_by_label() if by_label is None else by_label

    seen = set()
    for index, row in enumerate(rows):
        for problem in check_row(row):
            bad(f"row {index}: {problem}")
        if not isinstance(row, dict) or not isinstance(row.get("provenance"), dict):
            continue

        # One egg price for a place, whatever its kind: a reader in Lucknow must
        # never be handed two. NECC lists each centre in one section only.
        place = (row.get("state"), row.get("district"))
        if place in seen:
            bad(f"row {index}: {place} appears twice")
        seen.add(place)

        entry = by_label.get(row["provenance"].get("centre_label"))
        if entry is None:
            bad(f"row {index}: centre_label {row['provenance'].get('centre_label')!r} is not in the crosswalk")
        elif (row.get("state"), row.get("district"), row.get("centre")) != (entry["state"], entry["district"], entry["centre"]):
            bad(f"row {index}: place differs from the crosswalk entry for {entry['necc']!r}")

    order = [(r.get("state"), r.get("district")) for r in rows if isinstance(r, dict)]
    if order != sorted(order):
        bad("rows are not in state, district order")

    for key in ("fetched_at", "script_sha256", "crosswalk_version", "month"):
        values = {r["provenance"].get(key) for r in rows if isinstance(r, dict) and isinstance(r.get("provenance"), dict)}
        if len(values) > 1:
            bad(f"provenance.{key} differs between rows, which come from one run")

    return problems


# ---------------------------------------------------------------- the real file


def _real_rows():
    return json.loads(_read(NECC_FILE))


def test_the_real_file_passes_the_guard():
    assert check_rows(_real_rows()) == []


def test_the_real_file_has_rows():
    # check_rows already refuses [], and this says why in one line.
    assert len(_real_rows()) >= 1


def test_the_real_rows_come_from_the_shipped_scripts():
    # The hash is of the two scripts that wrote the file, so editing either one
    # without fetching again fails here. .gitattributes pins both to LF.
    assert {r["provenance"]["script_sha256"] for r in _real_rows()} == {script_hash()}


def test_the_real_rows_carry_the_current_crosswalk_version():
    assert {r["provenance"]["crosswalk_version"] for r in _real_rows()} == {crosswalk()["version"]}


def test_the_synthetic_rows_pass_the_guard():
    assert check_rows(necc_rows()) == []


def test_the_synthetic_rows_cover_the_shapes_the_lookup_tells_apart():
    assert {r["scope"] for r in NECC_ROWS} == {"district", "state"}
    assert {r["price_kind"] for r in NECC_ROWS} == set(PRICE_KINDS)
    assert {r["stale"] for r in NECC_ROWS} == {True, False}


def test_the_script_hash_is_the_hash_of_both_scripts_and_not_of_one():
    # The fixture's stand-in is only a shape; the real hash has to cover both files.
    assert SHA256.fullmatch(SCRIPT_SHA256)
    assert len(script_hash()) == 64
    assert script_hash() != hashlib.sha256(LIB_FILE.read_bytes()).hexdigest()
    assert script_hash() != hashlib.sha256(FETCH_FILE.read_bytes()).hexdigest()


# ---------------------------------------------------------------- the response model


def test_the_neccprovenance_model_declares_every_provenance_key():
    # A response_model filters silently: a key it does not declare never reaches
    # the client and nothing warns. So the model and this guard share one list.
    assert tuple(market_schema.NeccProvenance.model_fields) == PROVENANCE_KEYS


@pytest.mark.parametrize("row", necc_rows(), ids=lambda r: r["provenance"]["centre_label"])
def test_every_synthetic_egg_row_survives_the_market_response_model(row):
    served = {**row, "match_level": "district"}
    model = market_schema.MarketContext.model_validate(served)

    assert model.model_dump(exclude_unset=True) == served


def test_every_real_egg_row_survives_the_market_response_model():
    for row in _real_rows():
        served = {**row, "match_level": "district"}
        assert market_schema.MarketContext.model_validate(served).model_dump(exclude_unset=True) == served


# ---------------------------------------------------------------- the crosswalk and the rows


def test_every_real_centre_is_a_crosswalk_entry_with_the_same_place():
    # check_rows does this too; this names it, so a failure says which half broke.
    by_label = crosswalk_by_label()
    for row in _real_rows():
        entry = by_label[row["provenance"]["centre_label"]]
        assert (row["state"], row["district"], row["centre"]) == (entry["state"], entry["district"], entry["centre"])


def test_no_row_is_made_for_a_centre_skipped_on_purpose():
    skipped = {entry["necc"] for entry in crosswalk()["skipped"]}
    assert not skipped & {r["provenance"]["centre_label"] for r in _real_rows()}


# ---------------------------------------------------------------- the guard fires


def _set(row, path, value):
    row = json.loads(json.dumps(row))
    target = row
    for key in path[:-1]:
        target = target[key]
    target[path[-1]] = value
    return row


def _drop(row, path):
    row = json.loads(json.dumps(row))
    target = row
    for key in path[:-1]:
        target = target[key]
    del target[path[-1]]
    return row


LUCKNOW = NECC_ROWS[2]
NAMAKKAL = NECC_ROWS[1]
DELHI = NECC_ROWS[0]

MUTATIONS = [
    ("not an object", None, "not an object"),
    ("an extra key", _set(LUCKNOW, ("note",), "x"), "row keys differ"),
    ("a missing key", _drop(LUCKNOW, ("centre",)), "row keys differ"),
    ("an extra provenance key", _set(LUCKNOW, ("provenance", "note"), "x"), "provenance keys differ"),
    ("a missing provenance key", _drop(LUCKNOW, ("provenance", "method")), "provenance keys differ"),
    ("the wrong category", _set(LUCKNOW, ("business_category",), "dairy"), "business_category"),
    ("the wrong metric", _set(LUCKNOW, ("metric",), "wholesale_price_per_kg"), "metric"),
    ("the wrong unit", _set(LUCKNOW, ("unit",), "kg"), "unit"),
    ("an unknown price kind", _set(LUCKNOW, ("price_kind",), "wholesale"), "price_kind"),
    ("an untrimmed centre", _set(LUCKNOW, ("centre",), "Lucknow "), "centre"),
    ("an unknown state", _set(LUCKNOW, ("state",), "Narnia"), "not in indiaLocations"),
    ("a district of another state", _set(LUCKNOW, ("district",), "Pune"), "not a district of"),
    ("a district row with no district", _set(LUCKNOW, ("district",), ""), "has no district"),
    ("a state row that names a district", _set(DELHI, ("district",), "New Delhi"), "names a district"),
    ("an unknown scope", _set(LUCKNOW, ("scope",), "block"), "neither district nor state"),
    ("a price of zero", _set(LUCKNOW, ("indicative_price",), 0), "indicative_price"),
    ("a price of 640 rupees", _set(LUCKNOW, ("indicative_price",), 640), "indicative_price"),
    ("a price with three decimals", _set(LUCKNOW, ("indicative_price",), 6.405), "more than two decimals"),
    ("a price that is not the published number over 100", _set(LUCKNOW, ("indicative_price",), 6.5), "over 100"),
    ("a published number outside the band", _set(LUCKNOW, ("provenance", "published_value"), 64), "published_value"),
    ("a published number with decimals", _set(LUCKNOW, ("provenance", "published_value"), 640.5), "published_value"),
    ("a date that is not a date", _set(LUCKNOW, ("last_reported",), "2026-13-01"), "last_reported is not a date"),
    ("a price from another month", _set(LUCKNOW, ("last_reported",), "2026-09-28"), "not in provenance.month"),
    ("a price dated after the run", _set(LUCKNOW, ("last_reported",), "2026-10-29"), "after last_verified"),
    ("a price older than a row may show", _set(NAMAKKAL, ("last_reported",), "2026-09-27"), "days old"),
    ("a stale flag the dates do not support", _set(LUCKNOW, ("stale",), True), "stale is True"),
    ("a fresh flag on a stale price", _set(NAMAKKAL, ("stale",), False), "stale is False"),
    ("a stale flag that is not a boolean", _set(LUCKNOW, ("stale",), "no"), "stale is not a boolean"),
    ("a changed source line", _set(LUCKNOW, ("source",), "NECC"), "source is not"),
    ("a changed source code", _set(LUCKNOW, ("source_code",), "src.agmarknetMandi"), "source_code"),
    ("a changed clarification", _set(LUCKNOW, ("provenance", "clarification"), CLARIFICATION.replace("merely", "not")), "clarification"),
    ("a clarification cut short", _set(LUCKNOW, ("provenance", "clarification"), CLARIFICATION.split(". ")[0] + "."), "clarification"),
    ("a changed unit reading", _set(LUCKNOW, ("provenance", "unit_reading"), "rupees"), "unit_reading"),
    ("a changed permission line", _set(LUCKNOW, ("provenance", "permission"), "Official partner of NECC."), "permission"),
    ("a changed method", _set(LUCKNOW, ("provenance", "method"), "Estimated."), "method"),
    ("a changed publisher", _set(LUCKNOW, ("provenance", "publisher"), "Someone Else"), "publisher"),
    ("a changed page address", _set(LUCKNOW, ("provenance", "page_url"), "https://example.in/"), "page_url"),
    ("a changed attribution", _set(LUCKNOW, ("provenance", "attribution"), "NECC"), "attribution"),
    ("a fetch time that is not India time", _set(LUCKNOW, ("provenance", "fetched_at"), "2026-10-28T18:30:00Z"), "fetched_at"),
    ("a verified date that is not the fetch date", _set(LUCKNOW, ("last_verified",), "2026-10-27"), "last_verified"),
    ("a script hash that is not one", _set(LUCKNOW, ("provenance", "script_sha256"), "abc"), "not a sha256"),
    ("a crosswalk version of zero", _set(LUCKNOW, ("provenance", "crosswalk_version"), 0), "crosswalk_version"),
    ("an empty centre label", _set(LUCKNOW, ("provenance", "centre_label"), ""), "centre_label"),
    ("an e-mail address in the permission line", _set(LUCKNOW, ("provenance", "permission"), PERMISSION + " Write to a@b.in"), "contact details"),
    ("a phone number in the method", _set(LUCKNOW, ("provenance", "method"), METHOD + " Call 98765 43210"), "contact details"),
    ("a spaced phone number in the attribution", _set(LUCKNOW, ("provenance", "attribution"), "x +91 9876-543210"), "contact details"),
]


@pytest.mark.parametrize("name, row, expected", MUTATIONS, ids=[m[0] for m in MUTATIONS])
def test_the_guard_reports(name, row, expected):
    problems = check_row(row)

    assert any(expected in problem for problem in problems), f"{expected!r} not in {problems}"


def test_the_guard_does_not_mistake_the_hash_for_a_phone_number():
    # A random sha256 holds a run of ten digits about four times in ten. The
    # one in provenance.script_sha256 is exempt, by position, and nothing else is.
    row = _set(LUCKNOW, ("provenance", "script_sha256"), "0123456789" + "a" * 54)

    assert check_row(row) == []
    assert any("contact details" in p for p in check_row(_set(row, ("provenance", "method"), "0123456789" + "a" * 54)))


def test_a_date_beside_a_price_is_not_a_phone_number():
    # 2026-10-28 and 28/10/2026 are eight digits each, with punctuation between.
    assert not PHONE.search("read on 28/10/2026, Sheet for 2026-10, fetched 2026-10-28T18:30:00+05:30")


# ---------------------------------------------------------------- the file guard fires


FILE_MUTATIONS = [
    ("an empty file", lambda rows: [], "no rows"),
    ("not a list", lambda rows: {"rows": rows}, "not a list"),
    ("a row twice", lambda rows: rows + [rows[-1]], "twice"),
    ("a second kind of price for one place", lambda rows: rows + [_set(rows[-1], ("price_kind",), "suggested")], "twice"),
    ("rows out of order", lambda rows: list(reversed(rows)), "order"),
    ("two runs in one file", lambda rows: [_set(r, ("provenance", "fetched_at"), "2026-10-28T09:00:00+05:30") if i == 0 else r for i, r in enumerate(rows)], "differs between rows"),
    ("a centre the crosswalk does not know", lambda rows: [_set(rows[0], ("provenance", "centre_label"), "Nowhere (CC)")] + rows[1:], "not in the crosswalk"),
    ("a place that differs from the crosswalk", lambda rows: [_set(rows[0], ("centre",), "New Delhi")] + rows[1:], "differs from the crosswalk"),
]


@pytest.mark.parametrize("name, mutate, expected", FILE_MUTATIONS, ids=[m[0] for m in FILE_MUTATIONS])
def test_the_file_guard_reports(name, mutate, expected):
    problems = check_rows(mutate(necc_rows()))

    assert any(expected in problem for problem in problems), f"{expected!r} not in {problems}"


def test_two_places_with_the_same_kind_of_price_are_fine():
    assert [p for p in check_rows(necc_rows()) if "twice" in p] == []
    assert len({r["price_kind"] for r in NECC_ROWS}) < len(NECC_ROWS)
