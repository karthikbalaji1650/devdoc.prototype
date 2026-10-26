"""Mock remote Test PC: the frontend pushes a suite's Robot Framework
script, starts a run, and polls for results. Nothing here touches real
hardware - a future real Test PC integration replaces this service behind
the same routes, with no client-side changes."""

import asyncio
import math
import random
import re
import string
import time
from datetime import UTC, datetime
from typing import Any

from app.core.errors import ApiError
from app.core.jscompat import JS_WS_CLASS, is_nonblank_string, js_iso_date, js_opt, js_trim
from app.models.test_exec import Job, PushedScript
from app.repositories.test_exec import TestExecRepository

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

    def __init__(self, repo: TestExecRepository, run_delay_s: float = MOCK_RUN_DELAY_S) -> None:
        self._repo = repo
        self._run_delay_s = run_delay_s

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

    def start_run(self, body: Any) -> dict[str, str]:
        suite_id = js_opt(body, "suiteId")
        if not is_nonblank_string(suite_id):
            raise ApiError(400, "suiteId is required.")
        script = self._repo.get_script(suite_id)
        if script is None:
            raise ApiError(400, "No script has been pushed for this suite yet.")

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

    def run_status(self, job_id: str) -> dict[str, Any]:
        job = self._repo.get_job(job_id)
        if job is None:
            raise ApiError(404, "No run found with that id.")
        if job.status == "running":
            return {"status": "running"}
        return {"status": "completed", "results": job.results}
