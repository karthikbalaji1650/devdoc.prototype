"""Release blockers read from Jira and GitHub (DDS-SRS-044)."""

import base64
import json
import os
import time
from collections.abc import Iterator
from typing import Any

import httpx
import pytest
import respx

from app.services.trackers import github_severity, jira_severity
from tests.conftest import ADMIN, AUTHOR, OTHER, Agent, Api, make_api, test_settings

KEY = base64.b64encode(os.urandom(32)).decode()
JIRA = "https://acme.atlassian.net"
GH = "https://api.github.com"


@pytest.fixture
def keyed_api() -> Iterator[Api]:
    yield from make_api(test_settings(secrets_key=KEY))


@pytest.fixture
def http() -> Iterator[respx.MockRouter]:
    with respx.mock(assert_all_called=False) as router:
        yield router


def jira_issue(key: str, summary: str, priority: str = "High", done: bool = False) -> dict[str, Any]:
    return {
        "key": key,
        "fields": {
            "summary": summary,
            "priority": {"name": priority},
            "status": {
                "name": "Done" if done else "In Progress",
                "statusCategory": {"key": "done" if done else "indeterminate"},
            },
        },
    }


def gh_issue(number: int, title: str, labels: list[str], state: str = "open") -> dict[str, Any]:
    return {
        "number": number,
        "title": title,
        "state": state,
        "labels": [{"name": n} for n in labels],
        "html_url": f"https://github.com/acme/fw/issues/{number}",
    }


def connect(admin: Agent, jira: bool = True, github: bool = True) -> None:
    if jira:
        res = admin.put(
            "/api/trackers/jira",
            json={"baseUrl": JIRA, "deployment": "cloud", "email": "qa@acme.com", "token": "jira-tok"},
        )
        assert res.status_code == 200, res.text
    if github:
        res = admin.put("/api/trackers/github", json={"token": "gh-tok"})
        assert res.status_code == 200, res.text


def make_release(agent: Agent, query: dict[str, Any] | None = None) -> str:
    body: dict[str, Any] = {"version": "v2.4.0", "type": "Minor", "targetDate": "2026-12-01", "status": "In Progress"}
    if query is not None:
        body["blockerQuery"] = query
    assert agent.put("/api/releases/rel-1", json=body).status_code == 200
    return "rel-1"


def blockers(agent: Agent) -> dict[str, dict[str, Any]]:
    [release] = [r for r in agent.get("/api/releases").json()["releases"] if r["id"] == "rel-1"]
    return {b["key"]: b for b in release["blockers"]}


def test_severity_mapping() -> None:
    assert [jira_severity(p) for p in ("Highest", "Blocker", "High", "Medium", "Low", None)] == [
        "Blocker", "Blocker", "Critical", "Major", "Minor", "Major",
    ]  # fmt: skip
    assert github_severity(["release-blocker"]) == "Blocker"
    assert github_severity(["release-blocker", "severity: critical"]) == "Critical"


def test_connections_are_admin_only_and_tokens_never_returned(keyed_api: Api) -> None:
    admin = keyed_api.sign_in(ADMIN)
    connect(admin)
    config = admin.get("/api/trackers").json()
    assert config["jira"]["baseUrl"] == JIRA and config["jira"]["tokenSet"] is True
    assert config["github"]["apiUrl"] == GH
    assert "jira-tok" not in json.dumps(config) and "token" not in config["jira"]
    assert "jira-tok" not in admin.get("/api/admin/backup").text
    other = keyed_api.sign_in(OTHER)
    assert other.get("/api/trackers").json() == {
        "jira": None,
        "github": None,
        "jiraConfigured": True,
        "githubConfigured": True,
    }
    assert other.put("/api/trackers/jira", json={}).status_code == 403


def test_connection_validation(keyed_api: Api) -> None:
    admin = keyed_api.sign_in(ADMIN)
    assert "email" in admin.put("/api/trackers/jira", json={"baseUrl": JIRA, "token": "t"}).json()["error"]
    assert (
        "URL"
        in admin.put("/api/trackers/jira", json={"baseUrl": "ftp://x", "deployment": "server", "token": "t"}).json()[
            "error"
        ]
    )
    assert "token is required" in admin.put("/api/trackers/github", json={}).json()["error"]
    assert admin.put("/api/trackers/gitlab", json={}).status_code == 404


def test_check_signs_in(keyed_api: Api, http: respx.MockRouter) -> None:
    admin = keyed_api.sign_in(ADMIN)
    connect(admin)
    me = http.get(f"{JIRA}/rest/api/3/myself").mock(return_value=httpx.Response(200, json={"displayName": "QA Bot"}))
    http.get(f"{GH}/user").mock(return_value=httpx.Response(401))
    assert admin.post("/api/trackers/jira/check").json() == {"ok": True, "account": "QA Bot"}
    assert (
        me.calls.last.request.headers["Authorization"] == "Basic " + base64.b64encode(b"qa@acme.com:jira-tok").decode()
    )
    gh = admin.post("/api/trackers/github/check").json()
    assert gh["ok"] is False and "rejected the credentials" in gh["error"]


def test_lookup_by_key_reads_the_issue(keyed_api: Api, http: respx.MockRouter) -> None:
    admin = keyed_api.sign_in(ADMIN)
    connect(admin)
    manager = keyed_api.sign_in(AUTHOR)
    make_release(manager)
    http.get(f"{JIRA}/rest/api/3/issue/WH3-1310").mock(
        return_value=httpx.Response(200, json=jira_issue("WH3-1310", "Telemetry timeout", "Highest"))
    )
    gh = http.get(f"{GH}/repos/acme/fw/issues/42").mock(
        return_value=httpx.Response(200, json=gh_issue(42, "Flash corrupts", ["release-blocker"], "closed"))
    )
    res = manager.post("/api/releases/rel-1/blockers/lookup", json={"tracker": "Jira", "key": "WH3-1310"})
    assert res.status_code == 200, res.text
    b = res.json()["blocker"]
    assert (b["title"], b["severity"], b["status"], b["source"]) == ("Telemetry timeout", "Blocker", "Open", "linked")
    assert b["url"] == f"{JIRA}/browse/WH3-1310"
    b = manager.post("/api/releases/rel-1/blockers/lookup", json={"tracker": "GitHub", "key": "acme/fw#42"}).json()[
        "blocker"
    ]
    assert b["status"] == "Closed" and b["url"].endswith("/issues/42")
    assert gh.calls.last.request.headers["Authorization"] == "Bearer gh-tok"
    # Bad keys and unknown issues.
    assert (
        "PROJ-123"
        in manager.post("/api/releases/rel-1/blockers/lookup", json={"tracker": "Jira", "key": "nope"}).json()["error"]
    )
    http.get(f"{JIRA}/rest/api/3/issue/WH3-9").mock(return_value=httpx.Response(404))
    assert (
        manager.post("/api/releases/rel-1/blockers/lookup", json={"tracker": "Jira", "key": "WH3-9"}).status_code == 404
    )
    assert (
        keyed_api.sign_in(OTHER).post("/api/releases/rel-1/blockers/lookup", json={"key": "WH3-1"}).status_code == 403
    )


def test_sync_imports_matching_issues_and_feeds_the_gate(keyed_api: Api, http: respx.MockRouter) -> None:
    admin = keyed_api.sign_in(ADMIN)
    connect(admin)
    manager = keyed_api.sign_in(AUTHOR)
    jql = 'fixVersion = "v2.4.0" AND labels = release-blocker'
    make_release(manager, {"jira": {"jql": jql}, "github": {"repo": "acme/fw"}})
    search = http.post(f"{JIRA}/rest/api/3/search/jql").mock(
        return_value=httpx.Response(
            200,
            json={
                "issues": [jira_issue("WH3-1", "Crash on boot", "High"), jira_issue("WH3-2", "Typo", "Low", done=True)],
                "isLast": True,
            },
        )
    )
    gh = http.get(f"{GH}/repos/acme/fw/issues").mock(
        return_value=httpx.Response(
            200, json=[gh_issue(7, "Leak", ["release-blocker"]), {**gh_issue(8, "PR", []), "pull_request": {}}]
        )
    )
    res = manager.post("/api/releases/rel-1/blockers/sync")
    assert res.status_code == 200, res.text
    assert sorted(res.json()["added"]) == ["WH3-1", "WH3-2", "acme/fw#7"] and res.json()["error"] is None
    assert json.loads(search.calls.last.request.content)["jql"] == jql
    assert dict(gh.calls.last.request.url.params) == {
        "labels": "release-blocker",
        "state": "open",
        "per_page": "100",
        "page": "1",
    }

    b = blockers(manager)
    assert (b["WH3-1"]["severity"], b["WH3-1"]["status"], b["WH3-1"]["source"]) == ("Critical", "Open", "synced")
    assert b["WH3-2"]["status"] == "Closed" and b["acme/fw#7"]["severity"] == "Blocker"
    [release] = [r for r in manager.get("/api/releases").json()["releases"] if r["id"] == "rel-1"]
    assert release["metrics"]["openBlockers"] == 2 and release["blockerSync"]["error"] is None
    audit = manager.get("/api/releases/rel-1/audit").json()["entries"]
    assert audit[-1]["action"] == "blockers-synced"

    # Next sync: WH3-1 is now done; #7 lost its label (still open) -> no longer a blocker.
    search.mock(
        return_value=httpx.Response(
            200, json={"issues": [jira_issue("WH3-1", "Crash on boot", done=True)], "isLast": True}
        )
    )
    gh.mock(return_value=httpx.Response(200, json=[]))
    http.get(f"{JIRA}/rest/api/3/issue/WH3-2").mock(
        return_value=httpx.Response(200, json=jira_issue("WH3-2", "Typo", done=True))
    )
    http.get(f"{GH}/repos/acme/fw/issues/7").mock(return_value=httpx.Response(200, json=gh_issue(7, "Leak", [])))
    res = manager.post("/api/releases/rel-1/blockers/sync").json()
    assert sorted(res["closed"]) == ["WH3-1", "acme/fw#7"]
    b = blockers(manager)
    assert b["acme/fw#7"]["status"] == "Closed" and b["acme/fw#7"]["syncNote"] == "No longer matches the blocker query."


def test_jira_server_uses_api_v2_and_a_bearer_token(keyed_api: Api, http: respx.MockRouter) -> None:
    admin = keyed_api.sign_in(ADMIN)
    assert (
        admin.put(
            "/api/trackers/jira", json={"baseUrl": "https://jira.acme.local/", "deployment": "server", "token": "pat"}
        ).status_code
        == 200
    )
    make_release(admin, {"jira": {"jql": "labels = blocker"}})
    route = http.post("https://jira.acme.local/rest/api/2/search").mock(
        return_value=httpx.Response(200, json={"issues": [jira_issue("FW-1", "x")], "total": 1})
    )
    assert admin.post("/api/releases/rel-1/blockers/sync").json()["added"] == ["FW-1"]
    assert route.calls.last.request.headers["Authorization"] == "Bearer pat"


def test_a_failed_sync_is_recorded_and_changes_nothing(keyed_api: Api, http: respx.MockRouter) -> None:
    admin = keyed_api.sign_in(ADMIN)
    connect(admin, github=False)
    make_release(admin, {"jira": {"jql": "x"}})
    http.post(f"{JIRA}/rest/api/3/search/jql").mock(
        return_value=httpx.Response(400, json={"errorMessages": ["The JQL is invalid."]})
    )
    res = admin.post("/api/releases/rel-1/blockers/sync").json()
    assert "The JQL is invalid." in res["error"]
    assert blockers(admin) == {}


def test_blocker_query_validation_and_clearing(keyed_api: Api) -> None:
    admin = keyed_api.sign_in(ADMIN)
    body = {"version": "v2.4.0", "type": "Minor", "targetDate": "2026-12-01"}
    res = admin.put("/api/releases/rel-1", json={**body, "blockerQuery": {"github": {"repo": "not a repo"}}})
    assert res.status_code == 400 and "owner/repo" in res.json()["error"]
    saved = admin.put("/api/releases/rel-1", json={**body, "blockerQuery": {"github": {"repo": "acme/fw"}}}).json()[
        "release"
    ]
    assert saved["blockerQuery"] == {"github": {"repo": "acme/fw", "label": "release-blocker"}}
    assert admin.put("/api/releases/rel-1", json=body).json()["release"]["blockerQuery"] is not None  # left out: kept
    assert (
        admin.put("/api/releases/rel-1", json={**body, "blockerQuery": None}).json()["release"]["blockerQuery"] is None
    )


def test_the_worker_syncs_every_five_minutes(keyed_api: Api, http: respx.MockRouter) -> None:
    admin = keyed_api.sign_in(ADMIN)
    connect(admin, github=False)
    make_release(admin, {"jira": {"jql": "x"}})
    search = http.post(f"{JIRA}/rest/api/3/search/jql").mock(
        return_value=httpx.Response(200, json={"issues": [], "isLast": True})
    )
    releases = keyed_api.client.app.state.services.releases  # type: ignore[attr-defined]
    t = (time.time() // 300) * 300 + 1
    call = keyed_api.client.portal.call  # type: ignore[union-attr]
    assert call(releases.sync_all_due, t) == 1
    assert call(releases.sync_all_due, t + 60) == 0  # same 5-minute slot
    assert call(releases.sync_all_due, t + 300) == 1
    assert search.call_count == 2
