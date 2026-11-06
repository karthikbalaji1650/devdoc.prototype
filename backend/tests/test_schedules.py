"""Scheduled test runs (DDS-SRS-028)."""

import base64
import json
import os
import time
from collections.abc import Iterator
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import httpx
import pytest
import respx

from app.services.robot_suite import build_robot_suite_text
from app.services.schedules import next_occurrence
from tests.conftest import ADMIN, AUTHOR, OTHER, Agent, Api, make_api, test_settings

KEY = base64.b64encode(os.urandom(32)).decode()
BASE = "https://testpc.example.com/api/v1"
FIXTURES = Path(__file__).parent / "fixtures"
TZ = "Asia/Kolkata"


def ts(text: str, tz: str = TZ) -> float:
    return datetime.fromisoformat(text).replace(tzinfo=ZoneInfo(tz)).timestamp()


# ── the Robot script (same as the frontend's) ────────────────────────


def test_robot_script_matches_the_frontend_builder() -> None:
    fixture = json.loads((FIXTURES / "robot_suite.json").read_text())
    expected = (FIXTURES / "robot_suite.expected.robot").read_text()
    assert build_robot_suite_text(fixture["suite"], fixture["cases"]) == expected


# ── when a schedule fires ────────────────────────────────────────────


def sched(**overrides: Any) -> dict[str, Any]:
    return {"frequency": "daily", "time": "09:30", "timezone": TZ, "date": None, "weekdays": [], **overrides}


def test_daily() -> None:
    assert next_occurrence(sched(), ts("2026-11-06T08:00")) == ts("2026-11-06T09:30")
    assert next_occurrence(sched(), ts("2026-11-06T09:30")) == ts("2026-11-07T09:30")  # strictly after


def test_weekly() -> None:
    s = sched(frequency="weekly", weekdays=["Mon", "Thu"])
    # 2026-11-06 is a Friday.
    assert next_occurrence(s, ts("2026-11-06T12:00")) == ts("2026-11-09T09:30")  # Monday
    assert next_occurrence(s, ts("2026-11-09T10:00")) == ts("2026-11-12T09:30")  # Thursday


def test_once() -> None:
    s = sched(frequency="once", date="2026-12-01")
    assert next_occurrence(s, ts("2026-11-06T12:00")) == ts("2026-12-01T09:30")
    assert next_occurrence(s, ts("2026-12-01T09:30")) is None


def test_time_zone_is_respected() -> None:
    assert next_occurrence(sched(timezone="UTC"), ts("2026-11-06T00:00", "UTC")) == ts("2026-11-06T09:30", "UTC")
    assert ts("2026-11-06T09:30", "UTC") - ts("2026-11-06T09:30") == 5.5 * 3600


# ── the API and the worker ───────────────────────────────────────────


@pytest.fixture
def keyed_api() -> Iterator[Api]:
    yield from make_api(test_settings(secrets_key=KEY))


@pytest.fixture
def testpc() -> Iterator[respx.MockRouter]:
    with respx.mock(assert_all_called=False) as router:
        yield router


def setup(api: Api) -> tuple[Agent, str]:
    admin = api.sign_in(ADMIN)
    server = admin.post(
        "/api/test-servers",
        json={"name": "Lab PC", "endpointUrl": BASE, "authType": "apiKey", "auth": {"apiKey": "k"}},
    )
    assert server.status_code == 200, server.text
    suite = {"title": "RTC Suite", "description": "", "module": "Firmware"}
    assert admin.put("/api/test-management/suites/s1", json=suite).status_code == 200
    case = {"customId": "TC-001", "title": "Drift check", "type": "Automated", "priority": "High"}
    assert admin.put("/api/test-management/suites/s1/cases/c1", json=case).status_code == 200
    return admin, server.json()["server"]["id"]


def body(server_id: str, **overrides: Any) -> dict[str, Any]:
    return {"suiteId": "s1", "serverId": server_id, "frequency": "daily", "time": "09:30", "timezone": TZ, **overrides}


def services(api: Api) -> Any:
    return api.client.app.state.services  # type: ignore[attr-defined]


def tick(api: Api, now: float) -> int:
    """The worker's schedule step at a given time."""
    return api.client.portal.call(services(api).schedules.fire_due, now)  # type: ignore[union-attr]


def runs(agent: Agent) -> list[dict[str, Any]]:
    return agent.get("/api/test-management").json()["runs"]


def test_create_list_and_next_run(keyed_api: Api) -> None:
    admin, server_id = setup(keyed_api)
    res = admin.post("/api/test-schedules", json=body(server_id, frequency="weekly", weekdays=["Fri", "Mon"]))
    assert res.status_code == 200, res.text
    created = res.json()["schedule"]
    assert created["weekdays"] == ["Mon", "Fri"] and created["enabled"] is True
    assert created["createdBy"] == ADMIN.name and created["nextRunAt"].endswith("Z")
    assert [s["id"] for s in admin.get("/api/test-schedules?suiteId=s1").json()["schedules"]] == [created["id"]]
    assert admin.get("/api/test-schedules?suiteId=other").json()["schedules"] == []


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"suiteId": "nope"}, "existing test suite"),
        ({"serverId": "nope"}, "registered test server"),
        ({"frequency": "hourly"}, "frequency must be one of"),
        ({"time": "25:00"}, "HH:MM"),
        ({"timezone": "Mars/Base"}, "IANA time zone"),
        ({"frequency": "once", "date": "2026-02-30"}, "YYYY-MM-DD"),
        ({"frequency": "once", "date": "2020-01-01"}, "already passed"),
        ({"frequency": "weekly", "weekdays": []}, "weekdays must list"),
        ({"frequency": "weekly", "weekdays": ["Funday"]}, "weekdays must list"),
    ],
)
def test_validation(keyed_api: Api, overrides: dict[str, Any], message: str) -> None:
    admin, server_id = setup(keyed_api)
    res = admin.post("/api/test-schedules", json=body(server_id, **overrides))
    assert res.status_code == 400 and message in res.json()["error"]


def test_only_the_creator_or_an_admin_can_change_it(keyed_api: Api) -> None:
    _, server_id = setup(keyed_api)
    owner, other = keyed_api.sign_in(AUTHOR), keyed_api.sign_in(OTHER)
    created = owner.post("/api/test-schedules", json=body(server_id)).json()["schedule"]
    url = f"/api/test-schedules/{created['id']}"
    assert other.put(url, json=body(server_id, enabled=False)).status_code == 403
    assert other.delete(url).status_code == 403
    assert owner.put(url, json=body(server_id, enabled=False)).json()["schedule"]["nextRunAt"] is None
    assert keyed_api.sign_in(ADMIN).delete(url).status_code == 204


def test_a_due_schedule_starts_a_run_that_the_worker_completes(keyed_api: Api, testpc: respx.MockRouter) -> None:
    admin, server_id = setup(keyed_api)
    start = testpc.post(f"{BASE}/runs").mock(return_value=httpx.Response(202, json={"jobId": "r1"}))
    created = admin.post("/api/test-schedules", json=body(server_id)).json()["schedule"]
    due = datetime.fromisoformat(created["nextRunAt"].replace("Z", "+00:00")).timestamp()

    assert tick(keyed_api, due - 1) == 0  # not yet
    assert tick(keyed_api, due) == 1
    assert tick(keyed_api, due) == 0  # each occurrence fires once

    sent = json.loads(start.calls.last.request.content)
    assert sent["suiteTitle"] == "RTC Suite"
    assert "TC-001_Drift_check" in sent["robotCode"]
    [run] = [r for r in runs(admin) if r.get("scheduleId") == created["id"]]
    assert run["name"] == "RTC Suite Scheduled Run" and run["status"] == "In Progress"
    assert run["environment"] == "Lab PC" and run["createdBy"] == ADMIN.name

    schedule = admin.get("/api/test-schedules").json()["schedules"][0]
    assert schedule["lastRunId"] == run["id"] and schedule["enabled"] is True
    next_due = datetime.fromisoformat(schedule["nextRunAt"].replace("Z", "+00:00")).timestamp()
    assert next_due == due + 24 * 3600

    # The polling worker then fills in the run, as for Run Test.
    testpc.get(f"{BASE}/runs/r1").mock(
        return_value=httpx.Response(
            200, json={"status": "COMPLETED", "results": [{"title": "TC-001", "status": "PASS"}]}
        )
    )
    keyed_api.client.portal.call(services(keyed_api).remote_runs.poll_due, time.time())  # type: ignore[union-attr]
    [run] = [r for r in runs(admin) if r["id"] == run["id"]]
    assert run["status"] == "Completed" and run["passedCount"] == 1


def test_a_once_schedule_switches_itself_off(keyed_api: Api, testpc: respx.MockRouter) -> None:
    admin, server_id = setup(keyed_api)
    testpc.post(f"{BASE}/runs").mock(return_value=httpx.Response(202, json={"jobId": "r1"}))
    created = admin.post("/api/test-schedules", json=body(server_id, frequency="once", date="2099-01-01")).json()
    due = ts("2099-01-01T09:30")
    assert tick(keyed_api, due) == 1
    schedule = admin.get("/api/test-schedules?suiteId=s1").json()["schedules"][0]
    assert schedule["id"] == created["schedule"]["id"]
    assert schedule["enabled"] is False and schedule["nextRunAt"] is None


def test_missed_occurrences_are_not_made_up(keyed_api: Api, testpc: respx.MockRouter) -> None:
    admin, server_id = setup(keyed_api)
    start = testpc.post(f"{BASE}/runs").mock(return_value=httpx.Response(202, json={"jobId": "r1"}))
    created = admin.post("/api/test-schedules", json=body(server_id)).json()["schedule"]
    due = datetime.fromisoformat(created["nextRunAt"].replace("Z", "+00:00")).timestamp()
    assert tick(keyed_api, due + 3 * 24 * 3600 + 60) == 1  # down for three days: one run, not four
    assert start.call_count == 1
    schedule = admin.get("/api/test-schedules").json()["schedules"][0]
    next_due = datetime.fromisoformat(schedule["nextRunAt"].replace("Z", "+00:00")).timestamp()
    assert next_due == due + 4 * 24 * 3600


def test_a_failed_start_is_recorded_and_retried_next_time(keyed_api: Api, testpc: respx.MockRouter) -> None:
    admin, server_id = setup(keyed_api)
    testpc.post(f"{BASE}/runs").mock(return_value=httpx.Response(503))
    created = admin.post("/api/test-schedules", json=body(server_id)).json()["schedule"]
    due = datetime.fromisoformat(created["nextRunAt"].replace("Z", "+00:00")).timestamp()
    assert tick(keyed_api, due) == 0
    schedule = admin.get("/api/test-schedules").json()["schedules"][0]
    assert "HTTP 503" in schedule["lastError"] and schedule["enabled"] is True
    [run] = [r for r in runs(admin) if r.get("scheduleId") == created["id"]]
    assert run["status"] == "Failed" and "HTTP 503" in run["remote"]["error"]


def test_a_deleted_suite_is_reported(keyed_api: Api) -> None:
    admin, server_id = setup(keyed_api)
    created = admin.post("/api/test-schedules", json=body(server_id)).json()["schedule"]
    assert admin.delete("/api/test-management/suites/s1").status_code == 204
    due = datetime.fromisoformat(created["nextRunAt"].replace("Z", "+00:00")).timestamp()
    assert tick(keyed_api, due) == 0
    assert admin.get("/api/test-schedules").json()["schedules"][0]["lastError"] == "The suite was deleted."
