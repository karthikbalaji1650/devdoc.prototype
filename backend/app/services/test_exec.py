"""Remote test execution: the frontend pushes a suite's Robot Framework
script, starts a run, and polls for results.

- With a `serverId` (DDS-SRS-020), the run goes to that registered remote
  test server, authenticated with its stored credentials (see
  services/test_servers.py), using the Test PC API in docs/test-pc-api.md:
  POST {endpoint}/runs starts it, GET {endpoint}/runs/{id} reports it.
- Without one, a mock Test PC answers with random results - the demo
  setup, where there is no real hardware."""

import asyncio
import math
import random
import re
import string
import time
from datetime import UTC, datetime
from typing import Any
from urllib.parse import quote

from app.core.errors import ApiError
from app.core.jscompat import JS_WS_CLASS, is_nonblank_string, js_iso_date, js_opt, js_trim
from app.models.test_exec import Job, PushedScript
from app.repositories.test_exec import RemoteJobStore, TestExecRepository
from app.services.test_servers import TestServerService

# How long the mock pretends a run takes. Real hardware takes far longer
# (hence the frontend's 30-minute poll); this only has to let a poll see
# "running" at least once while keeping tests fast.
MOCK_RUN_DELAY_S = 0.3

_TEST_CASES_HEADER = re.compile(rf"^\*\*\*{JS_WS_CLASS}*Test Cases{JS_WS_CLASS}*\*\*\*", re.IGNORECASE | re.ASCII)
_TEST_ID = re.compile(rf"^([Tt][Cc][_\-A-Za-z0-9]+)(?:{JS_WS_CLASS}|[_-])")
_BASE36 = string.digits + string.ascii_lowercase


def extract_test_names(robot_code: str) -> list[tuple[str, str]]:
    """(customId, title) per test case, the same way the frontend's own
    .robot parser reads them, so mock results line up with real ids. The
    id pattern is greedy about underscores: "TC-001_Drift_Check" yields
    "TC-001-Drift" - kept as-is to match the client's matching."""
    names: list[tuple[str, str]] = []
    in_test_cases = False
    for raw_line in robot_code.split("\n"):
        if _TEST_CASES_HEADER.match(raw_line):
            in_test_cases = True
            continue
        if raw_line.startswith("***"):
            in_test_cases = False
            continue
        if in_test_cases and raw_line and raw_line[0] not in " \t":
            title = js_trim(raw_line)
            match = _TEST_ID.match(title)
            custom_id = match.group(1).replace("_", "-") if match else f"TC-{len(names) + 1}"
            names.append((custom_id, title))
    return names


def _random_result(custom_id: str, title: str) -> dict[str, Any]:
    passed = random.random() < 0.85
    result: dict[str, Any] = {
        "customId": custom_id,
        "title": title,
        "status": "PASS" if passed else "FAIL",
        "elapsedTimeMs": math.floor(random.random() * 800) + 120,
    }
    if not passed:
        result["failureMessage"] = "Mock remote execution reported a failure."
    return result


def _job_id() -> str:
    return f"job-{int(time.time() * 1000)}-{''.join(random.choices(_BASE36, k=6))}"


class TestExecService:
    __test__ = False

    def __init__(
        self,
        repo: TestExecRepository,
        run_delay_s: float = MOCK_RUN_DELAY_S,
        remote_jobs: RemoteJobStore | None = None,
        servers: TestServerService | None = None,
    ) -> None:
        self._repo = repo
        self._run_delay_s = run_delay_s
        self._remote_jobs = remote_jobs
        self._servers = servers

    def push_script(self, body: Any) -> dict[str, bool]:
        suite_id, suite_title, robot_code = (js_opt(body, k) for k in ("suiteId", "suiteTitle", "robotCode"))
        if not is_nonblank_string(suite_id):
            raise ApiError(400, "suiteId is required.")
        if not is_nonblank_string(suite_title):
            raise ApiError(400, "suiteTitle is required.")
        if not is_nonblank_string(robot_code):
            raise ApiError(400, "robotCode is required.")
        self._repo.save_script(PushedScript(suite_id, suite_title, robot_code))
        return {"ok": True}

    async def start_run(self, body: Any, user_name: str = "") -> dict[str, str]:
        suite_id = js_opt(body, "suiteId")
        if not is_nonblank_string(suite_id):
            raise ApiError(400, "suiteId is required.")
        script = self._repo.get_script(suite_id)
        if script is None:
            raise ApiError(400, "No script has been pushed for this suite yet.")

        server_id = js_opt(body, "serverId")
        if server_id is not None:
            if not is_nonblank_string(server_id):
                raise ApiError(400, "serverId must be a test server id.")
            return await self._start_remote(server_id, script, user_name)

        job_id = _job_id()
        self._repo.save_job(job_id, Job(suite_id=suite_id, status="running"))
        asyncio.get_running_loop().call_later(self._run_delay_s, self._complete, job_id, script)
        return {"jobId": job_id}

    def _complete(self, job_id: str, script: PushedScript) -> None:
        names = extract_test_names(script.robot_code)
        results = [_random_result(cid, title) for cid, title in names] or [_random_result("TC-1", "Automated test")]
        passed = sum(1 for r in results if r["status"] == "PASS")
        failed = sum(1 for r in results if r["status"] == "FAIL")
        self._repo.save_job(
            job_id,
            Job(
                suite_id=script.suite_id,
                status="completed",
                results={
                    "_schema": "devdoc-robot-results-v1",
                    "suiteTitle": script.suite_title,
                    "executedAt": js_iso_date(datetime.now(UTC)),
                    "environment": "Mock Remote Test PC",
                    "summary": {"total": len(results), "passed": passed, "failed": failed, "skipped": 0},
                    "results": results,
                },
            ),
        )

    async def run_status(self, job_id: str) -> dict[str, Any]:
        if self._remote_jobs is not None:
            remote = await self._remote_jobs.get(job_id)
            if remote is not None:
                return await self._remote_status(remote)
        job = self._repo.get_job(job_id)
        if job is None:
            raise ApiError(404, "No run found with that id.")
        if job.status == "running":
            return {"status": "running"}
        return {"status": "completed", "results": job.results}

    # Remote test servers (DDS-SRS-020)

    def _require_remote(self) -> tuple[RemoteJobStore, TestServerService]:
        if self._remote_jobs is None or self._servers is None:
            raise ApiError(501, "Remote test servers are not available on this server.")
        return self._remote_jobs, self._servers

    async def _start_remote(self, server_id: str, script: PushedScript, user_name: str) -> dict[str, str]:
        jobs, servers = self._require_remote()
        server = await servers.get_server(server_id)
        res = await servers.call(
            server,
            "POST",
            "/runs",
            {
                "suiteId": script.suite_id,
                "suiteTitle": script.suite_title,
                "robotCode": script.robot_code,
                "parameters": server.get("payload", {}),
            },
        )
        if res.status_code >= 400:
            raise ApiError(502, _remote_error(server, res, "did not start the run"))
        remote_job_id = _json(res).get("jobId")
        if not isinstance(remote_job_id, (str, int)) or str(remote_job_id) == "":
            raise ApiError(502, f'Test server "{server["name"]}" did not return a jobId.')
        job_id = _job_id()
        await jobs.put(
            job_id,
            {
                "serverId": server_id,
                "serverName": server["name"],
                "remoteJobId": str(remote_job_id),
                "suiteId": script.suite_id,
                "suiteTitle": script.suite_title,
                "startedBy": user_name,
                "startedAt": js_iso_date(datetime.now(UTC)),
            },
        )
        return {"jobId": job_id}

    async def _remote_status(self, job: dict[str, Any]) -> dict[str, Any]:
        _, servers = self._require_remote()
        server = await servers.get_server(job["serverId"])
        res = await servers.call(server, "GET", f"/runs/{quote(job['remoteJobId'], safe='')}")
        if res.status_code >= 400:
            raise ApiError(502, _remote_error(server, res, "could not report the run"))
        body = _json(res)
        status = str(body.get("status", "")).upper()
        if status in ("QUEUED", "RUNNING"):
            return {"status": "running"}
        if status == "FAILED":
            error = body.get("error")
            message = error if isinstance(error, str) and error.strip() else "The test server reported the run failed."
            return {"status": "failed", "error": message[:1000]}
        if status == "COMPLETED":
            return {"status": "completed", "results": _normalise_results(body, job, server["name"])}
        raise ApiError(502, f'Test server "{server["name"]}" returned an unknown run status: {status or "none"}.')


def _json(res: Any) -> dict[str, Any]:
    try:
        body = res.json()
    except ValueError:
        return {}
    return body if isinstance(body, dict) else {}


def _remote_error(server: dict[str, Any], res: Any, what: str) -> str:
    if res.status_code in (401, 403):
        return f'Test server "{server["name"]}" rejected the credentials (HTTP {res.status_code}).'
    return f'Test server "{server["name"]}" {what} (HTTP {res.status_code}).'


_STATUS_MAP = {"PASS": "PASS", "PASSED": "PASS", "FAIL": "FAIL", "FAILED": "FAIL", "SKIP": "SKIP", "SKIPPED": "SKIP"}
MAX_RESULTS = 20_000


def _normalise_results(body: dict[str, Any], job: dict[str, Any], server_name: str) -> dict[str, Any]:
    """The server's results in the shape the frontend reads
    (devdoc-robot-results-v1); entries it cannot read are rejected, so a
    malformed reply never reaches the UI half-parsed."""
    raw = body.get("results")
    if isinstance(raw, dict):  # a full devdoc-robot-results-v1 document
        raw = raw.get("results")
    if not isinstance(raw, list):
        raise ApiError(502, f'Test server "{server_name}" completed the run without a results list.')
    if len(raw) > MAX_RESULTS:
        raise ApiError(502, f'Test server "{server_name}" returned more than {MAX_RESULTS} results.')
    results: list[dict[str, Any]] = []
    for i, entry in enumerate(raw):
        if not isinstance(entry, dict):
            raise ApiError(502, f'Test server "{server_name}" returned an unreadable result (#{i + 1}).')
        status = _STATUS_MAP.get(str(entry.get("status", "")).upper())
        title = entry.get("title")
        if status is None or not isinstance(title, str) or not title.strip():
            raise ApiError(502, f'Test server "{server_name}" returned an unreadable result (#{i + 1}).')
        custom_id = entry.get("customId")
        elapsed = entry.get("elapsedTimeMs")
        result: dict[str, Any] = {
            "customId": custom_id.strip() if isinstance(custom_id, str) and custom_id.strip() else f"TC-{i + 1}",
            "title": title.strip(),
            "status": status,
            "elapsedTimeMs": int(elapsed) if isinstance(elapsed, (int, float)) and elapsed >= 0 else 0,
        }
        message = entry.get("failureMessage")
        if status == "FAIL":
            result["failureMessage"] = message[:2000] if isinstance(message, str) and message else "Failed."
        results.append(result)
    return {
        "_schema": "devdoc-robot-results-v1",
        "suiteTitle": job["suiteTitle"],
        "executedAt": js_iso_date(datetime.now(UTC)),
        "environment": server_name,
        "summary": {
            "total": len(results),
            "passed": sum(r["status"] == "PASS" for r in results),
            "failed": sum(r["status"] == "FAIL" for r in results),
            "skipped": sum(r["status"] == "SKIP" for r in results),
        },
        "results": results,
    }
