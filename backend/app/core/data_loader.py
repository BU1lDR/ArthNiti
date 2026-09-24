import json
from functools import lru_cache
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"


# schemes.json and market_data.json are static reference data: they ship with the
# app, nothing writes them at runtime, and every /api/analysis/run needs all of
# both. Uncached, this re-read and re-parsed 55KB from disk on EVERY request,
# which measured at 0.18ms of a 0.40ms pipeline -- 45% of the whole thing, and
# more than every arithmetic service in the app put together.
#
# The cache never expires. The file cannot change while the process is alive
# unless someone edits it, and editing one during development restarts uvicorn
# (`--reload` does it for them), which drops the cache with the process.
#
# THE RETURNED OBJECT IS SHARED, which is the one thing to know before using
# this. Every caller gets the same list, so a caller that mutates it corrupts the
# data for every later request in the process -- and it would corrupt it
# *silently*, since the file on disk is still correct and a restart makes the
# symptom vanish. No service does: market_service deep-copies every row it
# returns through _detached() (a sourced row carries nested provenance, so the
# old top-level {**row} copy was no longer enough), and scheme_service copies
# the lists it puts into a response.
# test_a_response_cannot_poison_the_cached_scheme_dataset and
# test_a_response_cannot_poison_the_cached_market_rows pin that, one per file.
# Treat what comes back as read-only.
@lru_cache(maxsize=None)
def load_json(filename: str):
    file_path = DATA_DIR / filename

    with file_path.open("r", encoding="utf-8") as file:
        return json.load(file)


def clear_data_cache():
    """
    Drop the parsed-file cache.

    For a test or a script that rewrites a data file inside a running process.
    The app itself never needs this -- see the note above on why the cache has no
    expiry. Clears the derived indexes in the services too, since those are built
    from what this returns and would otherwise still describe the old file.
    """
    load_json.cache_clear()

    # Imported here rather than at module scope: the services import this module,
    # so a top-level import would be circular.
    from app.services.market_service import _market_index
    from app.services.scheme_service import _scheme_index

    _market_index.cache_clear()
    _scheme_index.cache_clear()
