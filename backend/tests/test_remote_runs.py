"""Runs on registered remote test servers: triggering (DDS-SRS-020) and the
background polling service (DDS-SRS-021). The worker's loop is off in
tests (remote_poll_enabled=False); each test drives `poll_due()` itself."""

import base64
import json
import os
import time
from collections.abc import Iterator
from typing import Any

import httpx
import pytest
import respx

from app.services.remote_runs import MAX_POLL_FAILURES, progress
from tests.conftest import ADMIN, OTHER, Agent, Api, make_api, test_settings

KEY = base64.b64encode(os.urandom(32)).decode()
BASE = "https://testpc.example.com/api/v1"
ROBOT = "*** Test Cases ***\nTC-001 Drift check\n    Log    ok\n"


@pytest.fixture
def keyed_api() -> Iterator[Api]:
    yield from make_api(test_settings(secrets_key=KEY))


@pytest.fixture
def testpc() -> Iterator[respx.MockRouter]:
    with respx.mock(assert_all_called=False) as router:
        yield router


def register(api: Api, interval: int | None = None) -> str:
    body: dict[str, Any] = {
        "name": "Lab PC",
        "endpointUrl": BASE + "/",
        "authType": "apiKey",
        "auth": {"apiKey": "k-123"},
        "payload": {"bmcIp": "10.0.0.5"},
    }
    if interval is not None:
        body["pollIntervalSeconds"] = interval
    res = api.sign_in(ADMIN).post("/api/test-servers", json=body)
    assert res.status_code == 200, res.text
    return res.json()["server"]["id"]


def start(agent: Agent, server_id: str | None, run_id: str | None = None) -> httpx.Response:
    push = agent.post("/api/test-exec/scripts", json={"suiteId": "s1", "suiteTitle": "RTC", "robotCode": ROBOT})
    assert push.status_code == 200
    body: dict[str, Any] = {"suiteId": "s1"}
    if server_id is not None:
        body["serverId"] = server_id
    if run_id is not None:
        body["runId"] = run_id
    return agent.post("/api/test-exec/runs", json=body)


def poll(api: Api, now: float | None = None) -> int:
    """One tick of the background worker."""
    remote_runs = api.client.app.state.services.remote_runs  # type: ignore[attr-defined]
    return api.client.portal.call(remote_runs.poll_due, now)  # type: ignore[union-attr]


def started(api: Api, testpc: respx.MockRouter, interval: int | None = None) -> tuple[Agent, str]:
    server_id = register(api, interval)
    testpc.post(f"{BASE}/runs").mock(return_value=httpx.Response(202, json={"jobId": "r 1"}))
    agent = api.sign_in(ADMIN)
    res = start(agent, server_id)
    assert res.status_code == 200, res.text
    return agent, res.json()["jobId"]


STATUS_URL = f"{BASE}/runs/r%201"


# ── triggering (020) ─────────────────────────────────────────────────


def test_starts_the_run_on_the_server_with_credentials_and_payload(keyed_api: Api, testpc: respx.MockRouter) -> None:
    server_id = register(keyed_api)
    route = testpc.post(f"{BASE}/runs").mock(return_value=httpx.Response(202, json={"jobId": "remote-42"}))
    agent = keyed_api.sign_in(OTHER)  # any signed-in user can run
    res = start(agent, server_id)
    assert res.status_code == 200, res.text
    request = route.calls.last.request
    assert request.headers["X-API-Key"] == "k-123"
    assert json.loads(request.content) == {
        "suiteId": "s1",
        "suiteTitle": "RTC",
        "robotCode": ROBOT,
        "parameters": {"bmcIp": "10.0.0.5"},
    }
    # Queued until the worker's first poll; reading it never calls the server.
    status = agent.get(f"/api/test-exec/runs/{res.json()['jobId']}").json()
    assert status == {"status": "running", "phase": "QUEUED", "server": "Lab PC"}


def test_start_failures(keyed_api: Api, testpc: respx.MockRouter) -> None:
    server_id = register(keyed_api)
    agent = keyed_api.sign_in(ADMIN)
    route = testpc.post(f"{BASE}/runs")

    route.mock(return_value=httpx.Response(401))
    res = start(agent, server_id)
    assert res.status_code == 502 and "rejected the credentials" in res.json()["error"]

    route.mock(return_value=httpx.Response(200, json={"id": "no-job-id-key"}))
    res = start(agent, server_id)
    assert res.status_code == 502 and "did not return a jobId" in res.json()["error"]

    route.mock(side_effect=httpx.ConnectError("refused"))
    res = start(agent, server_id)
    assert res.status_code == 502 and 'Could not reach test server "Lab PC"' in res.json()["error"]


def test_unknown_server(keyed_api: Api) -> None:
    assert start(keyed_api.sign_in(ADMIN), "missing").status_code == 404


def test_without_server_id_the_mock_still_runs(keyed_api: Api) -> None:
    res = start(keyed_api.sign_in(ADMIN), None)
    assert res.status_code == 200 and res.json()["jobId"].startswith("job-")


# ── the polling service (021) ────────────────────────────────────────


def test_progress_formula() -> None:
    assert progress(40, 12, 10, 2) == {"total": 40, "completed": 12, "passed": 10, "failed": 2, "percent": 30.0}
    assert progress(3, 1, 1, 0)["percent"] == 33.3
    assert progress(0, 0, 0, 0)["percent"] == 0.0
    assert progress(5, 9, 5, 0)["completed"] == 5  # never more than the total


def test_running_progress_is_stored_and_read_without_calling_the_server(
    keyed_api: Api, testpc: respx.MockRouter
) -> None:
    agent, job_id = started(keyed_api, testpc)
    route = testpc.get(STATUS_URL).mock(
        return_value=httpx.Response(
            200, json={"status": "RUNNING", "total": 40, "completed": 12, "passed": 10, "failed": 2}
        )
    )
    assert poll(keyed_api) == 1
    assert route.calls.last.request.headers["X-API-Key"] == "k-123"
    for _ in range(3):
        status = agent.get(f"/api/test-exec/runs/{job_id}").json()
    assert route.call_count == 1
    assert status["status"] == "running" and status["phase"] == "RUNNING"
    assert status["progress"] == {"total": 40, "completed": 12, "passed": 10, "failed": 2, "percent": 30.0}
    assert "lastPolledAt" in status


@pytest.mark.parametrize("interval", [5, 10, 30])
def test_polls_on_the_servers_interval(keyed_api: Api, testpc: respx.MockRouter, interval: int) -> None:
    _, _ = started(keyed_api, testpc, interval)
    route = testpc.get(STATUS_URL).mock(return_value=httpx.Response(200, json={"status": "QUEUED"}))
    t0 = time.time()
    assert poll(keyed_api, t0) == 1
    # Not due again before the interval has passed (the lock is released by time, so clear it).
    _clear_locks(keyed_api)
    assert poll(keyed_api, t0 + interval - 0.5) == 0
    assert poll(keyed_api, t0 + interval) == 1
    assert route.call_count == 2


def _clear_locks(api: Api) -> None:
    redis = api.client.app.state.services.remote_runs._redis  # type: ignore[attr-defined]

    async def clear() -> None:
        async for key in redis.scan_iter(match="dds:texec:lock:*"):
            await redis.delete(key)

    api.client.portal.call(clear)  # type: ignore[union-attr]


def test_interval_must_be_5_10_or_30(keyed_api: Api) -> None:
    res = keyed_api.sign_in(ADMIN).post(
        "/api/test-servers",
        json={"name": "x", "endpointUrl": BASE, "authType": "none", "pollIntervalSeconds": 7},
    )
    assert res.status_code == 400 and "5, 10 or 30" in res.json()["error"]


def test_completed_results_are_normalised(keyed_api: Api, testpc: respx.MockRouter) -> None:
    agent, job_id = started(keyed_api, testpc)
    testpc.get(STATUS_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "status": "COMPLETED",
                "results": [
                    {"customId": "TC-001", "title": "Drift check", "status": "PASSED", "elapsedTimeMs": 1200},
                    {"title": "Alarm", "status": "fail", "failureMessage": "Timeout"},
                    {"customId": "TC-003", "title": "Leap year", "status": "SKIP"},
                ],
            },
        )
    )
    poll(keyed_api)
    body = agent.get(f"/api/test-exec/runs/{job_id}").json()
    assert body["status"] == "completed" and body["phase"] == "COMPLETED"
    assert body["progress"] == {"total": 3, "completed": 3, "passed": 1, "failed": 1, "percent": 100.0}
    results = body["results"]
    assert results["_schema"] == "devdoc-robot-results-v1"
    assert results["environment"] == "Lab PC" and results["suiteTitle"] == "RTC"
    assert results["summary"] == {"total": 3, "passed": 1, "failed": 1, "skipped": 1}
    assert results["results"][1] == {
        "customId": "TC-2",
        "title": "Alarm",
        "status": "FAIL",
        "elapsedTimeMs": 0,
        "failureMessage": "Timeout",
    }
    _clear_locks(keyed_api)
    assert poll(keyed_api, time.time() + 3600) == 0  # finished jobs are no longer polled


def test_failed_run(keyed_api: Api, testpc: respx.MockRouter) -> None:
    agent, job_id = started(keyed_api, testpc)
    testpc.get(STATUS_URL).mock(return_value=httpx.Response(200, json={"status": "FAILED", "error": "BMC unreachable"}))
    poll(keyed_api)
    body = agent.get(f"/api/test-exec/runs/{job_id}").json()
    assert body["status"] == "failed" and body["phase"] == "FAILED" and body["error"] == "BMC unreachable"


@pytest.mark.parametrize(
    ("reply", "message"),
    [
        ({"status": "COMPLETED"}, "without a results list"),
        ({"status": "COMPLETED", "results": [{"title": "x", "status": "MAYBE"}]}, "unreadable result (#1)"),
    ],
)
def test_unreadable_results_fail_the_run(
    keyed_api: Api, testpc: respx.MockRouter, reply: dict[str, Any], message: str
) -> None:
    agent, job_id = started(keyed_api, testpc)
    testpc.get(STATUS_URL).mock(return_value=httpx.Response(200, json=reply))
    poll(keyed_api)
    body = agent.get(f"/api/test-exec/runs/{job_id}").json()
    assert body["status"] == "failed" and message in body["error"]


def test_server_errors_are_retried_then_the_run_fails(keyed_api: Api, testpc: respx.MockRouter) -> None:
    agent, job_id = started(keyed_api, testpc, interval=5)
    testpc.get(STATUS_URL).mock(return_value=httpx.Response(503))
    t = time.time()
    poll(keyed_api, t)
    body = agent.get(f"/api/test-exec/runs/{job_id}").json()
    assert body["status"] == "running" and "HTTP 503" in body["pollError"]
    for i in range(1, MAX_POLL_FAILURES):
        _clear_locks(keyed_api)
        poll(keyed_api, t + 5 * i)
    body = agent.get(f"/api/test-exec/runs/{job_id}").json()
    assert body["status"] == "failed" and "Lost contact" in body["error"]


def test_a_removed_server_fails_its_runs(keyed_api: Api, testpc: respx.MockRouter) -> None:
    agent, job_id = started(keyed_api, testpc)
    server_id = agent.get("/api/test-servers").json()["servers"][0]["id"]
    assert agent.delete(f"/api/test-servers/{server_id}").status_code == 204
    poll(keyed_api)
    body = agent.get(f"/api/test-exec/runs/{job_id}").json()
    assert body["status"] == "failed" and "removed" in body["error"]


def test_the_linked_test_run_is_updated_without_the_browser(keyed_api: Api, testpc: respx.MockRouter) -> None:
    server_id = register(keyed_api)
    testpc.post(f"{BASE}/runs").mock(return_value=httpx.Response(202, json={"jobId": "r 1"}))
    agent = keyed_api.sign_in(ADMIN)
    run = {
        "name": "RTC Remote Execution Run",
        "suiteId": "s1",
        "environment": "Lab PC",
        "status": "In Progress",
        "passedCount": 0,
        "failedCount": 0,
        "blockedCount": 0,
        "executedAt": "2026-11-06T10:00:00Z",
    }
    assert agent.put("/api/test-management/runs/run-1", json=run).status_code == 200
    assert start(agent, server_id, run_id="run-1").status_code == 200

    route = testpc.get(STATUS_URL)
    route.mock(return_value=httpx.Response(200, json={"status": "RUNNING", "total": 2, "completed": 1, "passed": 1}))
    t = time.time()
    poll(keyed_api, t)
    stored = _run(agent, "run-1")
    assert stored["status"] == "In Progress"
    assert stored["remote"]["progress"]["percent"] == 50.0 and stored["remote"]["phase"] == "RUNNING"

    route.mock(
        return_value=httpx.Response(
            200,
            json={
                "status": "COMPLETED",
                "results": [
                    {"customId": "TC-001", "title": "TC-001 Drift", "status": "PASS"},
                    {"customId": "TC-002", "title": "TC-002 Alarm", "status": "FAIL"},
                    {"customId": "TC-003", "title": "TC-003 Leap year", "status": "SKIP"},
                ],
            },
        )
    )
    _clear_locks(keyed_api)
    poll(keyed_api, t + 10)
    stored = _run(agent, "run-1")
    assert stored["status"] == "Failed" and stored["passedCount"] == 1 and stored["failedCount"] == 1
    assert stored["skippedCount"] == 1 and stored["blockedCount"] == 0  # skipped is not blocked
    assert [c["status"] for c in stored["caseResults"]] == ["Passed", "Failed", "Skipped"]
    assert stored["remote"]["phase"] == "COMPLETED"


def _run(agent: Agent, run_id: str) -> dict[str, Any]:
    runs = agent.get("/api/test-management").json()["runs"]
    return next(r for r in runs if r["id"] == run_id)


def test_tracks_100_concurrent_runs_within_one_tick(keyed_api: Api, testpc: respx.MockRouter) -> None:
    """DDS-SRS-072: 100 active runs on a Test PC that takes 50 ms per reply
    are all polled within one 1-second tick, and status reads stay fast."""
    import asyncio

    server_id = register(keyed_api, interval=5)
    counter = iter(range(1000))
    testpc.post(f"{BASE}/runs").mock(side_effect=lambda _: httpx.Response(202, json={"jobId": f"r{next(counter)}"}))

    async def slow_status(_: httpx.Request) -> httpx.Response:
        await asyncio.sleep(0.05)
        return httpx.Response(200, json={"status": "RUNNING", "total": 10, "completed": 5, "passed": 5})

    testpc.get(url__regex=rf"{BASE}/runs/r\d+").mock(side_effect=slow_status)
    agent = keyed_api.sign_in(ADMIN)
    job_ids = [start(agent, server_id).json()["jobId"] for _ in range(100)]

    t0 = time.perf_counter()
    assert poll(keyed_api) == 100
    tick = time.perf_counter() - t0
    assert tick < 1.0, f"one tick took {tick:.2f} s"

    t0 = time.perf_counter()
    for job_id in job_ids:
        assert agent.get(f"/api/test-exec/runs/{job_id}").json()["progress"]["percent"] == 50.0
    per_read_ms = (time.perf_counter() - t0) / len(job_ids) * 1000
    assert per_read_ms < 50, f"status read took {per_read_ms:.1f} ms"
    print(f"\n100 runs: one tick {tick * 1000:.0f} ms, status read {per_read_ms:.1f} ms each")


# ── live updates (022) ───────────────────────────────────────────────


def _events(chunks: list[str]) -> list[dict[str, Any]]:
    return [json.loads(c.split("data: ", 1)[1]) for c in chunks if c.startswith("event: status")]


def test_event_stream_pushes_each_change_until_the_run_finishes(keyed_api: Api, testpc: respx.MockRouter) -> None:
    _, job_id = started(keyed_api, testpc)
    route = testpc.get(STATUS_URL)
    remote_runs = keyed_api.client.app.state.services.remote_runs  # type: ignore[attr-defined]

    async def scenario() -> list[str]:
        stream = await remote_runs.events(job_id, heartbeat_s=0.05)
        chunks = [await anext(stream), await anext(stream)]  # retry hint, current state
        t = time.time()
        route.mock(return_value=httpx.Response(200, json={"status": "RUNNING", "total": 4, "completed": 1}))
        await remote_runs.poll_due(t)
        chunks.append(await anext(stream))
        chunks.append(await anext(stream))  # nothing changed: a keep-alive comment
        await keyed_api.client.app.state.services.remote_runs._redis.delete(  # type: ignore[attr-defined]
            f"dds:texec:lock:{job_id}"
        )
        route.mock(return_value=httpx.Response(200, json={"status": "FAILED", "error": "BMC unreachable"}))
        await remote_runs.poll_due(t + 10)
        chunks.extend([c async for c in stream])  # the last event, then the stream ends
        return chunks

    chunks = keyed_api.client.portal.call(scenario)  # type: ignore[union-attr]
    assert chunks[0] == "retry: 3000\n\n"
    assert chunks[3] == ": keep-alive\n\n"
    events = _events(chunks)
    assert [e["phase"] for e in events] == ["QUEUED", "RUNNING", "FAILED"]
    assert events[1]["progress"]["percent"] == 25.0
    assert events[2]["error"] == "BMC unreachable"


def test_event_stream_over_http(keyed_api: Api, testpc: respx.MockRouter) -> None:
    agent, job_id = started(keyed_api, testpc)
    testpc.get(STATUS_URL).mock(return_value=httpx.Response(200, json={"status": "COMPLETED", "results": []}))
    poll(keyed_api)
    res = agent.get(f"/api/test-exec/runs/{job_id}/events")  # finished: one event, then it closes
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/event-stream")
    assert res.headers["cache-control"] == "no-cache"
    [event] = _events(res.text.split("\n\n"))
    assert event["status"] == "completed" and event["phase"] == "COMPLETED"


def test_event_stream_needs_a_remote_run_and_sign_in(keyed_api: Api) -> None:
    assert keyed_api.sign_in(ADMIN).get("/api/test-exec/runs/nope/events").status_code == 404
    assert keyed_api.anonymous().get("/api/test-exec/runs/nope/events").status_code == 401
