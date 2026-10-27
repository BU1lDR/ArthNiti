"""The helper's lists are the form's lists.

The helper turns what a person says into answers to the form's questions. If its
list of fields, categories, area types or languages drifts from the form's, it
offers an answer the form has no place for or never offers one the form has, and
nothing on screen shows it. The JavaScript is read as text, the way
test_notice_sent_fields reads notice.js.
"""

import re
from pathlib import Path

from app.services import intake_service as intake
from test_notice_sent_fields import FRONTEND, _block, _sent_fields


BUSINESS_PAGE = FRONTEND / "pages" / "BusinessPage.jsx"
LOCATION_PAGE = FRONTEND / "pages" / "LocationPage.jsx"
LANGUAGES_JS = FRONTEND / "i18n" / "languages.js"


def _tile_values(path: Path, opening):
    # The first string of each `['value', 'glyph', 'key']` row of a tile list.
    block = _block(path.read_text(encoding="utf-8"), opening, "\n]")
    return re.findall(r"^  \['([\w -]+)',", block, flags=re.MULTILINE)


def _languages():
    block = _block(LANGUAGES_JS.read_text(encoding="utf-8"), "export const LANGUAGES = [", "\n]")
    return dict(re.findall(r"code: '(\w+)', name: '(\w+)'", block))


def test_the_parsers_found_what_they_read():
    # A reformatted file must fail here, not pass below on two empty lists.
    assert len(_sent_fields()) >= 10
    assert len(_tile_values(BUSINESS_PAGE, "const categories = [")) >= 5
    assert len(_tile_values(LOCATION_PAGE, "const locationTypes = [")) >= 2
    assert len(_languages()) >= 5


def test_the_helper_fills_in_the_fields_the_form_sends_in_the_order_it_asks():
    assert tuple(field for field, _ in _sent_fields()) == intake.FORM_ORDER


def test_the_helper_offers_the_categories_the_form_has_but_not_other():
    # "other" is the form's way to type a category of one's own, which the
    # helper does not guess at. The order of the tiles is the page's own.
    tiles = _tile_values(BUSINESS_PAGE, "const categories = [")

    assert "other" in tiles
    assert sorted(tile for tile in tiles if tile != "other") == sorted(intake.CATEGORIES)


def test_the_helper_offers_the_area_types_the_form_has():
    assert sorted(_tile_values(LOCATION_PAGE, "const locationTypes = [")) == sorted(intake.LOCATION_TYPES)


def test_the_helper_names_the_languages_the_app_has():
    assert _languages() == intake.LANGUAGES
