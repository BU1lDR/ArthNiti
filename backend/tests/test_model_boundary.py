"""Where the model sits in the code (CLAUDE.md, "The model's job").

The analysis has no model. These tests read the source, then run one request:

- the modules that make a figure, a band, a scheme match or a sentence of advice
  import neither the Meta client, nor the helper's two services, nor anything
  that opens a connection, so a model's reply has no import path into a number;
- the helper's two services import no rules module, so nothing a model said is
  handed to one;
- only core/meta_client.py opens a connection, and only main.py (and the owner's
  smoke test) builds the client;
- a real POST /api/analysis/run, with the helper on and a model that records
  every call, makes none and answers what the helper-off app answers.

Reading imports cannot prove that a value never depends on a model. It makes the
way in a new import, and a new import fails here. A change that has a reason to
cross this wall edits the lists below on purpose.
"""

import ast
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.settings import load_settings
from app.main import create_app
from deployment_fixtures import ANALYSIS_BODY, CONSENT
from intake_fixtures import AI_ON, FakeModel


APP = Path(__file__).resolve().parent.parent / "app"

# The helper's two services: they build the model's prompt and check its reply.
MODEL_SIDE = {"intake_service", "plan_service"}

# What a rules module may not import: the client, its ledger, the helper's
# services, a web framework, and whatever can open a connection or load a module
# by name.
CONNECTIONS = ("http.client", "http.server", "urllib", "socket", "ssl", "requests", "httpx", "aiohttp", "websockets")
NOT_IN_RULES = (
    "app.core.meta_client",
    "app.core.spend",
    "app.services.intake_service",
    "app.services.plan_service",
    "fastapi",
    "starlette",
    "importlib",
    "subprocess",
    "asyncio",
) + CONNECTIONS

# The helper's services may import the schemas and each other, and nothing else of ours.
MODEL_SIDE_MAY_IMPORT = ("app.schemas", "app.services.intake_service", "app.services.plan_service")

# Who imports core/meta_client, and which names. MetaError is only the exception.
CLIENT_USERS = {
    "api/routes/advisor.py": {"MetaError"},
    "api/routes/intake.py": {"MetaError"},
    "core/spend.py": {"MetaError"},
    "main.py": {"MetaClient"},
    "smoke_meta.py": {"MetaClient", "MetaError"},
}


def imported(path):
    """Every module a file imports, and each `from module import name` as module.name too."""
    names = set()

    for node in ast.walk(ast.parse(Path(path).read_text(encoding="utf-8"))):
        if isinstance(node, ast.Import):
            names.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            names.add(node.module or "")
            names.update(f"{node.module}.{alias.name}" for alias in node.names)

    return names


def under(name, prefix):
    return name == prefix or name.startswith(prefix + ".")


def reaching(path, prefixes):
    """The imports of `path` that are, or sit under, one of `prefixes`."""
    return sorted(name for name in imported(path) if any(under(name, prefix) for prefix in prefixes))


def app_files():
    return sorted(path for path in APP.rglob("*.py"))


def relative(path):
    return path.relative_to(APP).as_posix()


RULES = sorted(path for path in (APP / "services").glob("*.py") if path.stem not in MODEL_SIDE and path.stem != "__init__")
HELPER = sorted(path for path in (APP / "services").glob("*.py") if path.stem in MODEL_SIDE)


def test_the_lists_are_not_empty():
    # A directory that moved would leave every parametrised test below with nothing to run.
    assert len(RULES) >= 10
    assert [path.stem for path in HELPER] == sorted(MODEL_SIDE)


def test_the_app_imports_by_absolute_name_only():
    # reaching() cannot resolve `from . import x`, so none may exist.
    for path in app_files():
        relatives = [node for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))) if isinstance(node, ast.ImportFrom) and node.level]

        assert relatives == [], relative(path)


@pytest.mark.parametrize("path", RULES, ids=lambda path: path.stem)
def test_a_rules_module_cannot_reach_the_model_or_a_connection(path):
    assert reaching(path, NOT_IN_RULES) == []


@pytest.mark.parametrize("path", HELPER, ids=lambda path: path.stem)
def test_a_helper_service_imports_no_rules_module(path):
    ours = [name for name in imported(path) if under(name, "app") and not any(under(name, prefix) for prefix in MODEL_SIDE_MAY_IMPORT)]

    assert ours == []
    assert reaching(path, CONNECTIONS + ("importlib", "subprocess")) == []


def test_only_the_meta_client_opens_a_connection():
    offenders = {relative(path): reaching(path, CONNECTIONS) for path in app_files() if relative(path) != "core/meta_client.py"}

    assert {name: found for name, found in offenders.items() if found} == {}


def test_the_meta_client_is_the_one_that_opens_it():
    # Not vacuous: the check above finds the connection where it is.
    assert reaching(APP / "core" / "meta_client.py", CONNECTIONS)


def test_only_the_known_files_import_the_meta_client():
    used = {}

    for path in app_files():
        names = {name for name in imported(path) if under(name, "app.core.meta_client")}
        names.discard("app.core.meta_client")
        names = {name.rsplit(".", 1)[1] for name in names}

        if names or "app.core.meta_client" in imported(path):
            used[relative(path)] = names

    assert set(used) <= set(CLIENT_USERS), sorted(set(used) - set(CLIENT_USERS))
    for name, found in used.items():
        assert found <= CLIENT_USERS[name], (name, sorted(found - CLIENT_USERS[name]))


def test_the_check_sees_a_planted_import(tmp_path):
    planted = tmp_path / "rules.py"
    planted.write_text(
        "import urllib.request\n"
        "from app.core.meta_client import MetaClient\n"
        "from app.services import plan_service as plan\n"
        "import importlib\n",
        encoding="utf-8",
    )

    assert reaching(planted, NOT_IN_RULES) == [
        "app.core.meta_client",
        "app.core.meta_client.MetaClient",
        "app.services.plan_service",
        "importlib",
        "urllib.request",
    ]


def test_the_check_leaves_an_ordinary_import_alone(tmp_path):
    ordinary = tmp_path / "rules.py"
    ordinary.write_text("import math\nfrom app.core.data_loader import load_json\n", encoding="utf-8")

    assert reaching(ordinary, NOT_IN_RULES) == []


def test_the_analysis_route_makes_no_model_call_and_answers_what_it_answers_without_the_helper():
    model = FakeModel()
    helper_on = TestClient(create_app(load_settings(AI_ON), model_client=model))
    helper_off = TestClient(create_app(load_settings({})))
    body = {**ANALYSIS_BODY, "consent": CONSENT}

    on = helper_on.post("/api/analysis/run", json=body)
    off = helper_off.post("/api/analysis/run", json=body)

    assert on.status_code == off.status_code == 200
    assert on.json() == off.json()
    assert model.calls == []


def test_the_fake_does_record_a_call_when_a_route_asks_the_model():
    # Not vacuous: the plan route, on the same kind of app, is a request that does reach the model.
    model = FakeModel()
    client = TestClient(create_app(load_settings(AI_ON), model_client=model))

    client.post("/api/advisor/plan", json={"answers": ANALYSIS_BODY, "language": "en", "send_to_meta": True})

    assert model.calls
