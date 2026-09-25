"""The footer's "scheme rules were checked between" dates must match the data.

frontend/src/data/reviewDates.js exports SCHEMES_CHECKED_FROM and
SCHEMES_CHECKED_TO, and the footer prints them on every page. They used to be a
literal 07/09/2026 typed into App.jsx, which nothing tied to schemes.json: three
schemes were last checked on 2026-09-01, so the single date overstated how
recent those three were, and a dataset update would have left it stale with
nothing failing.
"""

import json
import re
from datetime import date
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
REVIEW_DATES = REPO_ROOT / "frontend" / "src" / "data" / "reviewDates.js"
SCHEMES_FILE = REPO_ROOT / "backend" / "app" / "data" / "schemes.json"


def _frontend_date(source, name):
    match = re.search(
        rf"export\s+const\s+{name}\s*=\s*['\"](\d{{4}}-\d{{2}}-\d{{2}})['\"]",
        source,
    )

    assert match, f"{REVIEW_DATES} does not export {name} as a 'yyyy-mm-dd' string"

    return match.group(1)


def _scheme_dates():
    schemes = json.loads(SCHEMES_FILE.read_text(encoding="utf-8"))
    dates = [scheme.get("last_verified") for scheme in schemes]

    assert dates, "schemes.json holds no schemes"
    assert all(isinstance(value, str) and value for value in dates), (
        "every scheme must carry a last_verified date"
    )

    # Parsing proves each is a real calendar date, so the min and max below are
    # compared as dates rather than as whatever strings happen to sort first.
    return sorted(date.fromisoformat(value) for value in dates)


def test_the_footer_dates_are_the_range_of_the_scheme_dates():
    assert REVIEW_DATES.is_file(), f"{REVIEW_DATES} does not exist"

    source = REVIEW_DATES.read_text(encoding="utf-8")
    dates = _scheme_dates()

    assert _frontend_date(source, "SCHEMES_CHECKED_FROM") == dates[0].isoformat()
    assert _frontend_date(source, "SCHEMES_CHECKED_TO") == dates[-1].isoformat()


def test_the_footer_range_runs_forwards():
    source = REVIEW_DATES.read_text(encoding="utf-8")

    checked_from = date.fromisoformat(_frontend_date(source, "SCHEMES_CHECKED_FROM"))
    checked_to = date.fromisoformat(_frontend_date(source, "SCHEMES_CHECKED_TO"))

    assert checked_from <= checked_to
