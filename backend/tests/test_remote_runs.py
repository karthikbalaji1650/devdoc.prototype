"""Triggering runs on a registered remote test server (DDS-SRS-020)."""

import base64
import json
import os
from collections.abc import Iterator
from typing import Any

import httpx
import pytest
import respx

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


def register(api: Api) -> str:
    res = api.sign_in(ADMIN).post(
        "/api/test-servers",
        json={
            "name": "Lab PC",
            "endpointUrl": BASE + "/",
            "authType": "apiKey",
            "auth": {"apiKey": "k-123"},
            "payload": {"bmcIp": "10.0.0.5"},
        },
    )
    assert res.status_code == 200, res.text
    return res.json()["server"]["id"]


def start(agent: Agent, server_id: str | None) -> httpx.Response:
    push = agent.post("/api/test-exec/scripts", json={"suiteId": "s1", "suiteTitle": "RTC", "robotCode": ROBOT})
    assert push.status_code == 200
    body: dict[str, Any] = {"suiteId": "s1"}
    if server_id is not None:
        body["serverId"] = server_id
    return agent.post("/api/test-exec/runs", json=body)


def test_starts_the_run_on_the_server_with_credentials_and_payload(keyed_api: Api, testpc: respx.MockRouter) -> None:
    server_id = register(keyed_api)
    route = testpc.post(f"{BASE}/runs").mock(return_value=httpx.Response(202, json={"jobId": "remote-42"}))
    res = start(keyed_api.sign_in(OTHER), server_id)  # any signed-in user can run
    assert res.status_code == 200, res.text
    assert res.json()["jobId"].startswith("job-")
    request = route.calls.last.request
    assert request.headers["X-API-Key"] == "k-123"
    assert json.loads(request.content) == {
        "suiteId": "s1",
        "suiteTitle": "RTC",
        "robotCode": ROBOT,
        "parameters": {"bmcIp": "10.0.0.5"},
    }


@pytest.mark.parametrize("remote_status", ["QUEUED", "RUNNING", "running"])
def test_queued_and_running_report_running(keyed_api: Api, testpc: respx.MockRouter, remote_status: str) -> None:
    server_id = register(keyed_api)
    testpc.post(f"{BASE}/runs").mock(return_value=httpx.Response(200, json={"jobId": "r 1"}))
    status_route = testpc.get(f"{BASE}/runs/r%201").mock(
        return_value=httpx.Response(200, json={"status": remote_status})
    )
    agent = keyed_api.sign_in(ADMIN)
    job_id = start(agent, server_id).json()["jobId"]
    assert agent.get(f"/api/test-exec/runs/{job_id}").json() == {"status": "running"}
    assert status_route.calls.last.request.headers["X-API-Key"] == "k-123"


def test_completed_results_are_normalised(keyed_api: Api, testpc: respx.MockRouter) -> None:
    server_id = register(keyed_api)
    testpc.post(f"{BASE}/runs").mock(return_value=httpx.Response(200, json={"jobId": 7}))
    testpc.get(f"{BASE}/runs/7").mock(
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
    agent = keyed_api.sign_in(ADMIN)
    job_id = start(agent, server_id).json()["jobId"]
    body = agent.get(f"/api/test-exec/runs/{job_id}").json()
    assert body["status"] == "completed"
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


def test_failed_run(keyed_api: Api, testpc: respx.MockRouter) -> None:
    server_id = register(keyed_api)
    testpc.post(f"{BASE}/runs").mock(return_value=httpx.Response(200, json={"jobId": "r1"}))
    testpc.get(f"{BASE}/runs/r1").mock(
        return_value=httpx.Response(200, json={"status": "FAILED", "error": "BMC unreachable"})
    )
    agent = keyed_api.sign_in(ADMIN)
    job_id = start(agent, server_id).json()["jobId"]
    assert agent.get(f"/api/test-exec/runs/{job_id}").json() == {"status": "failed", "error": "BMC unreachable"}


@pytest.mark.parametrize(
    ("reply", "message"),
    [
        ({"status": "COMPLETED"}, "without a results list"),
        ({"status": "COMPLETED", "results": [{"title": "x", "status": "MAYBE"}]}, "unreadable result (#1)"),
        ({"status": "PAUSED"}, "unknown run status: PAUSED"),
    ],
)
def test_malformed_status_replies_are_rejected(
    keyed_api: Api, testpc: respx.MockRouter, reply: dict[str, Any], message: str
) -> None:
    server_id = register(keyed_api)
    testpc.post(f"{BASE}/runs").mock(return_value=httpx.Response(200, json={"jobId": "r1"}))
    testpc.get(f"{BASE}/runs/r1").mock(return_value=httpx.Response(200, json=reply))
    agent = keyed_api.sign_in(ADMIN)
    job_id = start(agent, server_id).json()["jobId"]
    res = agent.get(f"/api/test-exec/runs/{job_id}")
    assert res.status_code == 502 and message in res.json()["error"]


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
    res = start(keyed_api.sign_in(ADMIN), "missing")
    assert res.status_code == 404


def test_without_server_id_the_mock_still_runs(keyed_api: Api) -> None:
    res = start(keyed_api.sign_in(ADMIN), None)
    assert res.status_code == 200 and res.json()["jobId"].startswith("job-")
