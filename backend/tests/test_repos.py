"""Connect existing code (DDS-SRS-030), with the code editor's bridge mocked.
The real bridge is exercised end to end by frontend/e2e/repos.spec.ts."""

import base64
import json
import os
from collections.abc import Iterator
from typing import Any

import httpx
import pytest
import respx

from app.services.repos import default_name
from tests.conftest import ADMIN, AUTHOR, OTHER, Api, make_api, test_settings

KEY = base64.b64encode(os.urandom(32)).decode()
BRIDGE = "http://bridge.test:8081"
URL = "https://github.com/acme/bmc-fw.git"


def live(name: str = "bmc-fw", commit: str = "abc1234") -> dict[str, Any]:
    return {"name": name, "path": f"repos/{name}", "branch": "main", "commit": commit, "subject": "Init", "remote": URL}


@pytest.fixture
def api_bridge() -> Iterator[Api]:
    yield from make_api(test_settings(secrets_key=KEY, bridge_url=BRIDGE, bridge_token="bt"))


@pytest.fixture
def bridge() -> Iterator[respx.MockRouter]:
    with respx.mock(assert_all_called=False) as router:
        yield router


def test_default_name() -> None:
    assert default_name("https://github.com/acme/bmc-fw.git") == "bmc-fw"
    assert default_name("git@bitbucket.org:acme/Tools Repo.git/") == "Tools-Repo"


def test_connect_clones_with_the_token_as_a_header_and_never_returns_it(
    api_bridge: Api, bridge: respx.MockRouter
) -> None:
    clone = bridge.post(f"{BRIDGE}/git/clone").mock(return_value=httpx.Response(200, json=live()))
    bridge.get(f"{BRIDGE}/git/repos").mock(return_value=httpx.Response(200, json={"repos": [live()]}))
    dev = api_bridge.sign_in(OTHER)
    res = dev.post("/api/repos", json={"url": URL, "branch": "main", "token": "ghp_secret"})
    assert res.status_code == 200, res.text
    repo = res.json()["repo"]
    assert repo["name"] == "bmc-fw" and repo["tokenSet"] is True and repo["workspace"]["commit"] == "abc1234"
    sent = json.loads(clone.calls.last.request.content)
    assert clone.calls.last.request.headers["Authorization"] == "Bearer bt"
    assert sent["url"] == URL and sent["branch"] == "main"
    assert sent["authHeader"] == "Authorization: Basic " + base64.b64encode(b"x-access-token:ghp_secret").decode()

    listed = dev.get("/api/repos").json()
    assert listed["available"] is True and listed["workspaceError"] is None
    assert "ghp_secret" not in json.dumps(listed) and "token" not in listed["repos"][0]
    assert "ghp_secret" not in api_bridge.sign_in(ADMIN).get("/api/admin/backup").text


def test_pull_and_remove_are_for_the_connector_or_an_admin(api_bridge: Api, bridge: respx.MockRouter) -> None:
    bridge.post(f"{BRIDGE}/git/clone").mock(return_value=httpx.Response(200, json=live()))
    pull = bridge.post(f"{BRIDGE}/git/pull").mock(return_value=httpx.Response(200, json=live(commit="def5678")))
    remove = bridge.post(f"{BRIDGE}/git/remove").mock(return_value=httpx.Response(200, json={"removed": "bmc-fw"}))
    owner = api_bridge.sign_in(AUTHOR)
    assert owner.post("/api/repos", json={"url": URL}).status_code == 200
    other = api_bridge.sign_in(OTHER)
    assert other.post("/api/repos/bmc-fw/pull").status_code == 403
    assert other.delete("/api/repos/bmc-fw").status_code == 403
    res = owner.post("/api/repos/bmc-fw/pull")
    assert res.json()["repo"]["workspace"]["commit"] == "def5678" and res.json()["repo"]["pulledAt"]
    assert json.loads(pull.calls.last.request.content) == {"name": "bmc-fw", "authHeader": None}
    assert api_bridge.sign_in(ADMIN).delete("/api/repos/bmc-fw").status_code == 204
    assert json.loads(remove.calls.last.request.content) == {"name": "bmc-fw"}
    assert owner.post("/api/repos/bmc-fw/pull").status_code == 404


@pytest.mark.parametrize(
    ("body", "message"),
    [
        ({}, "url is required"),
        ({"url": "ext::sh -c id"}, "https://, ssh://"),
        ({"url": "https://user:pw@github.com/a/b.git"}, "not in the URL"),
        ({"url": URL, "name": "../etc"}, "name may contain"),
        ({"url": URL, "branch": "-x"}, "not a valid branch name"),
        ({"url": "git@github.com:acme/fw.git", "token": "t"}, "ssh needs a key"),
    ],
)
def test_validation(api_bridge: Api, body: dict[str, Any], message: str) -> None:
    res = api_bridge.sign_in(ADMIN).post("/api/repos", json=body)
    assert res.status_code == 400 and message in res.json()["error"], res.text


def test_bridge_errors_are_passed_on_and_nothing_is_saved(api_bridge: Api, bridge: respx.MockRouter) -> None:
    clone = bridge.post(f"{BRIDGE}/git/clone")
    admin = api_bridge.sign_in(ADMIN)
    clone.mock(return_value=httpx.Response(502, json={"error": "git failed: Authentication failed"}))
    res = admin.post("/api/repos", json={"url": URL})
    assert res.status_code == 502 and "Authentication failed" in res.json()["error"]
    clone.mock(return_value=httpx.Response(401, json={"error": "bad token"}))
    assert "BRIDGE_TOKEN" in admin.post("/api/repos", json={"url": URL}).json()["error"]
    clone.mock(side_effect=httpx.ConnectError("refused"))
    assert "Could not reach" in admin.post("/api/repos", json={"url": URL}).json()["error"]
    assert admin.get("/api/repos").json()["repos"] == []


def test_a_duplicate_name_is_refused(api_bridge: Api, bridge: respx.MockRouter) -> None:
    bridge.post(f"{BRIDGE}/git/clone").mock(return_value=httpx.Response(200, json=live()))
    admin = api_bridge.sign_in(ADMIN)
    assert admin.post("/api/repos", json={"url": URL}).status_code == 200
    assert admin.post("/api/repos", json={"url": URL}).status_code == 409


def test_without_a_bridge(api: Api) -> None:
    admin = api.sign_in(ADMIN)
    assert admin.get("/api/repos").json() == {"repos": [], "workspaceError": None, "available": False}
    res = admin.post("/api/repos", json={"url": URL})
    assert res.status_code == 503 and "BRIDGE_URL" in res.json()["error"]
