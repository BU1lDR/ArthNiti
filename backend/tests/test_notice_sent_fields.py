"""The /privacy list of what is sent is the list of what is sent.

/privacy tells the reader, field by field, what leaves the device, from
SENT_FIELDS in frontend/src/config/notice.js. Three other places decide what
actually leaves it: the payload FinancePage builds, the request fields the
backend reads (everything in UnifiedAnalysisRequest but IGNORED_FIELDS and the
consent record) and the field labels the 422 banner uses (FIELD_LABELS in
api.js). A field added to one of them and not to the list would be sent while
the notice says nothing about it; a field in the list and not in the payload
would be a promise about data that never moves. Either way the notice is wrong,
and nothing on screen shows it.

The JavaScript is read as text, the way test_input_bounds reads limits.js.
"""

import re
from pathlib import Path

from app.schemas.analysis import IGNORED_FIELDS, UnifiedAnalysisRequest


REPO_ROOT = Path(__file__).resolve().parents[2]
FRONTEND = REPO_ROOT / "frontend" / "src"
NOTICE = FRONTEND / "config" / "notice.js"
FINANCE_PAGE = FRONTEND / "pages" / "FinancePage.jsx"
API = FRONTEND / "services" / "api.js"


def _block(text, opening, closing):
    start = text.index(opening) + len(opening)
    return text[start:text.index(closing, start)]


def _sent_fields():
    block = _block(NOTICE.read_text(encoding="utf-8"), "export const SENT_FIELDS = [", "\n]")
    return re.findall(r"\[\s*'(\w+)',\s*'([\w.]+)'\s*\]", block)


def _payload_fields():
    # The object literal FinancePage sends, `{ ...payload, consent }`. Its
    # closing brace is the first one back at the literal's own indentation.
    block = _block(FINANCE_PAGE.read_text(encoding="utf-8"), "  const payload = {\n", "\n  }\n")
    return re.findall(r"^    (\w+):", block, flags=re.MULTILINE)


def _field_labels():
    block = _block(API.read_text(encoding="utf-8"), "const FIELD_LABELS = {", "\n}")
    return dict(re.findall(r"(\w+): \{\s*key: '([\w.]+)'", block))


def test_the_parsers_found_what_they_read():
    # A reformatted file must fail here, not pass below on two empty lists.
    assert len(_sent_fields()) >= 10
    assert len(_payload_fields()) >= 10
    assert len(_field_labels()) >= 10


def test_the_list_names_each_field_once():
    fields = [field for field, _ in _sent_fields()]
    keys = [key for _, key in _sent_fields()]

    assert len(fields) == len(set(fields))
    assert len(keys) == len(set(keys))


def test_the_list_is_exactly_what_finance_page_sends():
    listed = [field for field, _ in _sent_fields()]
    sent = _payload_fields()

    assert sorted(listed) == sorted(sent)


def test_the_list_is_exactly_what_the_backend_reads():
    read = set(UnifiedAnalysisRequest.model_fields) - IGNORED_FIELDS - {"consent"}

    assert {field for field, _ in _sent_fields()} == read


def test_each_label_is_the_one_the_error_banner_uses():
    labels = _field_labels()

    for field, key in _sent_fields():
        assert labels.get(field) == key, field
