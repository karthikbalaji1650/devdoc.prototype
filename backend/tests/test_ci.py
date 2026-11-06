"""CI/CD integration (DDS-SRS-026, 027)."""

import base64
import gzip
import json
import os
import time
from collections.abc import Iterator
from typing import Any

import httpx
import pytest
import respx

from app.services.robot_output import parse_robot_output
from tests.conftest import ADMIN, AUTHOR, Agent, Api, make_api, test_settings

KEY = base64.b64encode(os.urandom(32)).decode()
BASE = "https://testpc.example.com/api/v1"

OUTPUT_RF7 = """<?xml version="1.0" encoding="UTF-8"?>
<robot generator="Robot 7.1" generated="2026-11-06T10:00:00.000000" rpa="false" schemaversion="5">
<suite id="s1" name="RTC Timing" source="/work/rtc.robot">
<test id="s1-t1" name="TC_RTC_001 Drift check" line="5">
<kw name="Log"><status status="FAIL" start="2026-11-06T10:00:00" elapsed="0.001"/></kw>
<status status="PASS" start="2026-11-06T10:00:00.000000" elapsed="1.250"/>
</test>
<test id="s1-t2" name="Alarm fires" line="9">
<kw name="Should Be Equal"><status status="FAIL" elapsed="0.002">1 != 2</status></kw>
<status status="FAIL" start="2026-11-06T10:00:01.250000" elapsed="0.300">Alarm did not fire: 1 != 2</status>
</test>
<test id="s1-t3" name="TC-RTC-003 Leap year" line="12">
<status status="SKIP" elapsed="0"/>
</test>
<status status="FAIL" elapsed="1.550"/>
</suite>
</robot>"""

OUTPUT_RF6 = """<?xml version="1.0" encoding="UTF-8"?>
<robot generator="Robot 6.1" generated="20261106 10:00:00.000" rpa="false" schemaversion="4">
<suite id="s1" name="Old Suite"><test id="s1-t1" name="TC_A_1 One">
<status status="PASS" starttime="20261106 10:00:00.000" endtime="20261106 10:00:02.500"/>
</test></suite></robot>"""


@pytest.fixture
def keyed_api() -> Iterator[Api]:
    yield from make_api(test_settings(secrets_key=KEY))


@pytest.fixture
def testpc() -> Iterator[respx.MockRouter]:
    with respx.mock(assert_all_called=False) as router:
        yield router


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def setup(api: Api) -> tuple[Agent, str, str]:
    """(admin, CI token, server id) with suite s1 stored."""
    admin = api.sign_in(ADMIN)
    server = admin.post("/api/test-servers", json={"name": "Lab PC", "endpointUrl": BASE, "authType": "none"})
    assert server.status_code == 200, server.text
    assert admin.put("/api/test-management/suites/s1", json={"title": "RTC Suite"}).status_code == 200
    case = {"customId": "TC-001", "title": "Drift check", "type": "Automated", "priority": "High"}
    assert admin.put("/api/test-management/suites/s1/cases/c1", json=case).status_code == 200
    res = admin.post("/api/ci/tokens", json={"name": "Jenkins - firmware"})
    assert res.status_code == 200, res.text
    return admin, res.json()["token"], server.json()["server"]["id"]


def runs(agent: Agent) -> list[dict[str, Any]]:
    return agent.get("/api/test-management").json()["runs"]


# ── output.xml ───────────────────────────────────────────────────────


def test_reads_robot_7_output_using_each_tests_own_status() -> None:
    parsed = parse_robot_output(OUTPUT_RF7)
    assert parsed["suiteTitle"] == "RTC Timing"
    assert parsed["results"] == [
        {"customId": "TC-RTC-001", "title": "TC_RTC_001 Drift check", "status": "PASS", "elapsedTimeMs": 1250},
        {
            "customId": "TC-2",
            "title": "Alarm fires",
            "status": "FAIL",
            "elapsedTimeMs": 300,
            "failureMessage": "Alarm did not fire: 1 != 2",
        },
        {"customId": "TC-RTC-003", "title": "TC-RTC-003 Leap year", "status": "SKIP", "elapsedTimeMs": 0},
    ]


def test_reads_robot_6_timestamps() -> None:
    assert parse_robot_output(OUTPUT_RF6)["results"][0]["elapsedTimeMs"] == 2500


@pytest.mark.parametrize(
    ("xml", "message"),
    [
        ("not xml", "not a readable"),
        ("<html/>", "no <robot> root"),
        ("<robot><suite name='x'/></robot>", "no test results"),
        (
            '<?xml version="1.0"?><!DOCTYPE r [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;">]><robot>&b;</robot>',
            "not a readable",
        ),
    ],
)
def test_rejects_unreadable_or_unsafe_xml(xml: str, message: str) -> None:
    from app.core.errors import ApiError

    with pytest.raises(ApiError, match=message):
        parse_robot_output(xml)


# ── tokens ───────────────────────────────────────────────────────────


def test_tokens_are_shown_once_and_stored_hashed(keyed_api: Api) -> None:
    admin, token, _ = setup(keyed_api)
    assert token.startswith("ddsci_") and len(token) > 40
    [record] = admin.get("/api/ci/tokens").json()["tokens"]
    assert record["name"] == "Jenkins - firmware" and record["hint"].startswith("ddsci_")
    assert "hash" not in record and token not in json.dumps(record)
    backup = admin.get("/api/admin/backup").text
    assert token not in backup


def test_only_admins_manage_tokens(keyed_api: Api) -> None:
    manager = keyed_api.sign_in(AUTHOR)
    assert manager.get("/api/ci/tokens").status_code == 403
    assert manager.post("/api/ci/tokens", json={"name": "x"}).status_code == 403
    assert keyed_api.anonymous().get("/api/ci/tokens").status_code == 401


def test_pipeline_calls_need_a_valid_token(keyed_api: Api) -> None:
    admin, token, server_id = setup(keyed_api)
    body = {"suiteId": "s1", "serverId": server_id}
    client = keyed_api.client
    assert client.post("/api/ci/runs", json=body).status_code == 401
    res = client.post("/api/ci/runs", json=body, headers=bearer("ddsci_wrong"))
    assert res.status_code == 401 and res.headers["www-authenticate"] == "Bearer"
    # A session cookie is not a CI token.
    assert admin.post("/api/ci/runs", json=body).status_code == 401

    token_id = admin.get("/api/ci/tokens").json()["tokens"][0]["id"]
    assert admin.delete(f"/api/ci/tokens/{token_id}").status_code == 204
    res = client.post(
        "/api/ci/results?suiteId=s1", content=OUTPUT_RF7, headers={**bearer(token), "Content-Type": "application/xml"}
    )
    assert res.status_code == 401 and "revoked" in res.json()["error"]


# ── runs triggered by a pipeline (027) ───────────────────────────────


def test_a_pipeline_triggers_a_run_and_waits_for_its_outcome(keyed_api: Api, testpc: respx.MockRouter) -> None:
    admin, token, server_id = setup(keyed_api)
    start = testpc.post(f"{BASE}/runs").mock(return_value=httpx.Response(202, json={"jobId": "r1"}))
    build = {
        "pipeline": "Jenkins",
        "buildUrl": "https://jenkins.example.com/job/fw/482/",
        "buildNumber": 482,
        "repository": "bmc-firmware",
        "branch": "release/2.4",
        "commit": "abc1234",
    }
    res = keyed_api.client.post(
        "/api/ci/runs", json={"suiteId": "s1", "serverId": server_id, "build": build}, headers=bearer(token)
    )
    assert res.status_code == 200, res.text
    job_id, run_id = res.json()["jobId"], res.json()["runId"]
    assert "TC-001_Drift_check" in json.loads(start.calls.last.request.content)["robotCode"]

    status = keyed_api.client.get(f"/api/ci/runs/{job_id}", headers=bearer(token)).json()
    assert status["outcome"] == "pending" and status["phase"] == "QUEUED"
    [run] = [r for r in runs(admin) if r["id"] == run_id]
    assert run["name"] == "RTC Suite CI Run" and run["createdBy"] == ADMIN.name
    assert run["ci"] == {**build, "buildNumber": "482", "token": "Jenkins - firmware"}

    testpc.get(f"{BASE}/runs/r1").mock(
        return_value=httpx.Response(
            200, json={"status": "COMPLETED", "results": [{"title": "TC-001", "status": "FAIL"}]}
        )
    )
    services = keyed_api.client.app.state.services  # type: ignore[attr-defined]
    keyed_api.client.portal.call(services.remote_runs.poll_due, time.time())  # type: ignore[union-attr]
    status = keyed_api.client.get(f"/api/ci/runs/{job_id}", headers=bearer(token)).json()
    assert status["outcome"] == "failed" and status["status"] == "completed"
    assert keyed_api.sign_in(ADMIN).get("/api/ci/tokens").json()["tokens"][0]["lastUsedAt"]


def test_trigger_validation(keyed_api: Api) -> None:
    _, token, server_id = setup(keyed_api)
    post = lambda body: keyed_api.client.post("/api/ci/runs", json=body, headers=bearer(token))  # noqa: E731
    assert "suiteId is required" in post({"serverId": server_id}).json()["error"]
    assert "No suite" in post({"suiteId": "nope", "serverId": server_id}).json()["error"]
    assert post({"suiteId": "s1", "serverId": "nope"}).status_code == 404
    res = post({"suiteId": "s1", "serverId": server_id, "build": {"buildUrl": "javascript:alert(1)"}})
    assert res.status_code == 400 and "buildUrl" in res.json()["error"]
    assert keyed_api.client.get("/api/ci/runs/nope", headers=bearer(token)).status_code == 404


# ── results of tests the pipeline ran itself (026) ───────────────────


def test_uploading_output_xml_records_a_completed_run(keyed_api: Api) -> None:
    admin, token, _ = setup(keyed_api)
    res = keyed_api.client.post(
        "/api/ci/results?suiteId=s1&pipeline=Bitbucket%20Pipelines&branch=main&commit=deadbeef&buildNumber=17",
        content=OUTPUT_RF7,
        headers={**bearer(token), "Content-Type": "application/xml"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["outcome"] == "failed"
    assert body["summary"] == {"total": 3, "passed": 1, "failed": 1, "skipped": 1}
    [run] = [r for r in runs(admin) if r["id"] == body["runId"]]
    assert run["status"] == "Failed" and run["environment"] == "Bitbucket Pipelines"
    assert run["passedCount"] == 1 and run["failedCount"] == 1 and run["blockedCount"] == 1
    assert [c["status"] for c in run["caseResults"]] == ["Passed", "Failed", "Skipped"]
    assert run["ci"]["commit"] == "deadbeef" and run["ci"]["buildNumber"] == "17"


def test_uploading_gzip_and_json(keyed_api: Api) -> None:
    _, token, _ = setup(keyed_api)
    res = keyed_api.client.post(
        "/api/ci/results?suiteId=s1",
        content=gzip.compress(OUTPUT_RF6.encode()),
        headers={**bearer(token), "Content-Type": "application/xml", "Content-Encoding": "gzip"},
    )
    assert res.status_code == 200 and res.json()["outcome"] == "passed", res.text
    res = keyed_api.client.post(
        "/api/ci/results?suiteId=s1&name=Nightly%20local",
        json={"results": [{"customId": "TC-001", "title": "Drift", "status": "PASS"}]},
        headers=bearer(token),
    )
    assert res.status_code == 200 and res.json()["summary"]["total"] == 1, res.text


@pytest.mark.parametrize(
    ("query", "content", "content_type", "status", "message"),
    [
        ("", OUTPUT_RF7, "application/xml", 400, "suiteId is required"),
        ("?suiteId=nope", OUTPUT_RF7, "application/xml", 400, "No suite"),
        ("?suiteId=s1", OUTPUT_RF7, "text/plain", 415, "application/xml"),
        ("?suiteId=s1", "<robot/>", "application/xml", 400, "no test results"),
        (
            "?suiteId=s1",
            '{"results": [{"status": "PASS"}]}',
            "application/json",
            400,
            "The upload returned an unreadable",
        ),
    ],
)
def test_upload_validation(
    keyed_api: Api, query: str, content: str, content_type: str, status: int, message: str
) -> None:
    _, token, _ = setup(keyed_api)
    res = keyed_api.client.post(
        f"/api/ci/results{query}", content=content, headers={**bearer(token), "Content-Type": content_type}
    )
    assert res.status_code == status and message in res.json()["error"], res.text
