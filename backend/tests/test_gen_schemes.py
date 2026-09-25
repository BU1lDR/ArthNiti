"""
Guards that backend/gen_schemes.py still reproduces the shipped dataset.

The generator's header tells people to change the dataset by editing SPEC and
running it. That instruction is only safe if running it today writes back the
file that ships. Until 24 Sept 2026 it did not: build() emitted no
location_types (added to schemes.json by hand on 8 Sept) and still listed
Stand-Up India under agriculture (removed from schemes.json by hand the same
day), so a regeneration silently undid both fixes and two tests failed.

So the two sides are compared here: parsed, scheme by scheme and field by
field, so a failure names the first scheme and field that differ; and as text,
modulo line endings, so a hand edit that only reformats is caught too. The key
inventory gen_schemes_keys.json is held to the generator the same way.

The shipped files are read straight from disk rather than through
app.core.data_loader.load_json, whose cached object is shared by every request
in the process.
"""

import json
import os
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import gen_schemes  # noqa: E402

SCHEMES_PATH = BACKEND_DIR / "app" / "data" / "schemes.json"
KEYS_PATH = BACKEND_DIR / "gen_schemes_keys.json"

HOW_TO_FIX = (
    " Change the dataset by editing SPEC or LOCATION_TYPES in gen_schemes.py"
    " and running it, not by editing schemes.json alone."
)

_MISSING = object()


def read_text(path):
    """A shipped file's text with CRLF folded to LF (the checkout may be CRLF)."""
    return path.read_bytes().decode("utf-8").replace("\r\n", "\n")


def first_difference(generated, shipped):
    """
    A sentence naming the first scheme and field where the two lists differ,
    or None when they are equal. Key ORDER counts: it decides the bytes the
    generator writes.
    """
    for index, (made, real) in enumerate(zip(generated, shipped)):
        made_id, real_id = made.get("id"), real.get("id")

        if made_id != real_id:
            return "position %d: gen_schemes.py builds %r, schemes.json has %r." % (
                index,
                made_id,
                real_id,
            )

        for field in list(real) + [key for key in made if key not in real]:
            made_value = made.get(field, _MISSING)
            real_value = real.get(field, _MISSING)

            if made_value is _MISSING:
                return "%s.%s: in schemes.json but gen_schemes.py does not emit it." % (
                    real_id,
                    field,
                )
            if real_value is _MISSING:
                return "%s.%s: gen_schemes.py emits it but schemes.json does not carry it." % (
                    real_id,
                    field,
                )
            if made_value != real_value:
                return "%s.%s: gen_schemes.py builds %r, schemes.json has %r." % (
                    real_id,
                    field,
                    made_value,
                    real_value,
                )

        if list(made) != list(real):
            return "%s: same fields in a different order. gen_schemes.py %r, schemes.json %r." % (
                real_id,
                list(made),
                list(real),
            )

    if len(generated) != len(shipped):
        return "gen_schemes.py builds %d schemes, schemes.json has %d." % (
            len(generated),
            len(shipped),
        )

    return None


def test_first_difference_names_the_scheme_and_the_field():
    # The helper is what makes the main test's failure readable, so prove it
    # reports each kind of drift rather than trusting it.
    base = [{"id": "a", "x": 1, "y": 2}, {"id": "b", "x": 1}]

    assert first_difference(base, [dict(row) for row in base]) is None
    assert "b.x" in first_difference(base, [base[0], {"id": "b", "x": 9}])
    assert "a.z" in first_difference(base, [{"id": "a", "x": 1, "y": 2, "z": 0}, base[1]])
    assert "a.y" in first_difference(base, [{"id": "a", "x": 1}, base[1]])
    assert "different order" in first_difference(base, [{"id": "a", "y": 2, "x": 1}, base[1]])
    assert "position 1" in first_difference(base, [base[0], {"id": "c", "x": 1}])
    assert "builds 2 schemes" in first_difference(base, base[:1])


def test_the_generator_reproduces_schemes_json_scheme_for_scheme():
    generated, _, _ = gen_schemes.build()
    shipped = json.loads(read_text(SCHEMES_PATH))

    problem = first_difference(generated, shipped)

    assert problem is None, problem + HOW_TO_FIX


def test_the_generator_reproduces_schemes_json_byte_for_byte():
    # Catches a hand edit the parsed comparison cannot see: a reformatted file
    # with the same data would be rewritten by the next run, and that rewrite
    # would show in review as an unexplained change to the whole file.
    schemes_text, _ = gen_schemes.render(*gen_schemes.build())

    assert schemes_text == read_text(SCHEMES_PATH), (
        "schemes.json holds the same data as gen_schemes.py builds but is laid out"
        " differently, so the next run would rewrite it." + HOW_TO_FIX
    )


def test_the_key_inventory_matches_the_generator():
    generated, elig_seen, doc_seen = gen_schemes.build()
    _, keys_text = gen_schemes.render(generated, elig_seen, doc_seen)
    inventory = json.loads(read_text(KEYS_PATH))

    assert inventory == {
        "eligibility": elig_seen,
        "documents": doc_seen,
        "ids": [scheme["id"] for scheme in generated],
    }
    assert keys_text == read_text(KEYS_PATH)


def test_no_generated_scheme_carries_an_official_url():
    # The outbound links were removed on 10 Sept 2026. The url in each SPEC
    # tuple stays as our internal citation for where the rules came from, and
    # build() must never emit it, or a regeneration puts the links back.
    generated, _, _ = gen_schemes.build()

    assert len(gen_schemes.SPEC) == 30
    assert all(spec[-1].startswith("https://") for spec in gen_schemes.SPEC)

    for scheme in generated:
        assert "official_url" not in scheme, scheme["id"]
        assert "url" not in scheme, scheme["id"]
        assert not any(
            isinstance(value, str) and value.startswith("http") for value in scheme.values()
        ), scheme["id"]

    schemes_text, _ = gen_schemes.render(*gen_schemes.build())
    assert "official_url" not in schemes_text


def test_only_schemes_whose_own_rules_name_a_kind_of_place_are_restricted():
    # Pins the per-id table against the measured split in schemes.json: 25 open
    # everywhere, four rural-only, and PM SVANidhi for towns and cities.
    generated, _, _ = gen_schemes.build()
    by_id = {scheme["id"]: scheme["location_types"] for scheme in generated}

    assert sum(1 for places in by_id.values() if places == ["ALL"]) == 25
    assert {sid for sid, places in by_id.items() if places == ["rural"]} == {
        "vvp_border",
        "rseti",
        "bdo_nrlm",
        "gp_licence",
    }
    assert by_id["svanidhi"] == ["semi-urban", "urban"]


def test_stand_up_india_is_not_listed_for_crop_farming():
    # Its own rule says crop cultivation on its own is not covered.
    generated, _, _ = gen_schemes.build()
    standup = next(scheme for scheme in generated if scheme["id"] == "standupindia")

    assert "agriculture" not in standup["business_categories"]
    assert any("crop cultivation on its own is not" in rule for rule in standup["eligibility_rules"])


def test_a_location_entry_for_an_unknown_scheme_is_refused(monkeypatch):
    # Without this a typo'd id would fall through to ["ALL"] and show a
    # rural-only scheme to an urban reader, with nothing reporting it.
    monkeypatch.setitem(gen_schemes.LOCATION_TYPES, "no_such_scheme", ["rural"])

    with pytest.raises(SystemExit, match="unknown scheme id"):
        gen_schemes.build()


def test_an_unknown_kind_of_place_is_refused(monkeypatch):
    monkeypatch.setitem(gen_schemes.LOCATION_TYPES, "rseti", ["village"])

    with pytest.raises(SystemExit, match="unknown kind of place"):
        gen_schemes.build()


def test_main_with_an_output_directory_writes_there_and_leaves_the_dataset_alone(tmp_path, capsys):
    before = (SCHEMES_PATH.stat().st_mtime_ns, KEYS_PATH.stat().st_mtime_ns)

    gen_schemes.main(str(tmp_path))
    capsys.readouterr()

    assert (SCHEMES_PATH.stat().st_mtime_ns, KEYS_PATH.stat().st_mtime_ns) == before
    assert sorted(os.listdir(tmp_path)) == ["gen_schemes_keys.json", "schemes.json"]
    assert read_text(tmp_path / "schemes.json") == read_text(SCHEMES_PATH)
    assert read_text(tmp_path / "gen_schemes_keys.json") == read_text(KEYS_PATH)
