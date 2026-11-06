"""Runs on registered remote test servers (DDS-SRS-020, 021).

- `start()` sends the suite's Robot script and the server's payload
  parameters to POST {endpoint}/runs (docs/test-pc-api.md) and records the
  job as QUEUED.
- A background worker (`RemoteRunPoller`, started with the app) calls
  `poll_due()` every second. Each active job is polled on its server's
  interval (5, 10 or 30 s) with GET {endpoint}/runs/{id}, at most
  POLL_CONCURRENCY at a time. Each poll stores the job's status (QUEUED,
  RUNNING, COMPLETED, FAILED) and progress: total, completed, passed,
  failed and execution % = completed / total * 100.
- `status()` only reads what the worker stored, so the browser can check
  often without ever touching the Test PC.
- `events()` pushes it instead (DDS-SRS-022): a server-sent event stream
  that sends the current state, then every change the worker stores
  (announced over Redis pub/sub, so it works across API instances), until
  the run finishes. A comment line every HEARTBEAT_S keeps proxies from
  closing an idle stream.
- When a job finishes, the worker also writes the outcome into the linked
  test run, so results land even if nobody has the page open.
- A per-job lock in Redis keeps two API instances from polling the same
  job at once. A server that stops answering is retried; after
  MAX_POLL_FAILURES failures in a row the job is marked FAILED.
"""

import asyncio
import contextlib
import json
import logging
import math
import time
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from typing import Any
from urllib.parse import quote

from redis.asyncio import Redis

from app.core.errors import ApiError
from app.core.jscompat import js_iso_date
from app.models.test_exec import PushedScript
from app.repositories.test_exec import RemoteJobStore
from app.repositories.test_management import TestManagementStore
from app.services.test_servers import TestServerService

logger = logging.getLogger("devdoc.remote_runs")

POLL_CONCURRENCY = 25
MAX_POLL_FAILURES = 20
TICK_S = 1.0
HEARTBEAT_S = 15.0
ACTIVE = ("QUEUED", "RUNNING")
TERMINAL = ("COMPLETED", "FAILED")
MAX_RESULTS = 20_000
_STATUS_MAP = {"PASS": "PASS", "PASSED": "PASS", "FAIL": "FAIL", "FAILED": "FAIL", "SKIP": "SKIP", "SKIPPED": "SKIP"}


def _now_iso() -> str:
    return js_iso_date(datetime.now(UTC))


def _json(res: Any) -> dict[str, Any]:
    try:
        body = res.json()
    except ValueError:
        return {}
    return body if isinstance(body, dict) else {}


def _http_error(server_name: str, status: int, what: str) -> str:
    if status in (401, 403):
        return f'Test server "{server_name}" rejected the credentials (HTTP {status}).'
    return f'Test server "{server_name}" {what} (HTTP {status}).'


def progress(total: int, completed: int, passed: int, failed: int) -> dict[str, Any]:
    """DDS-SRS-021 metrics; execution % = completed / total * 100, one decimal."""
    completed = min(completed, total) if total else completed
    percent = math.floor(completed / total * 1000) / 10 if total else 0.0
    return {"total": total, "completed": completed, "passed": passed, "failed": failed, "percent": percent}


def _count(body: dict[str, Any], key: str) -> int | None:
    value = body.get(key)
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value < 0:
        return None
    return int(value)


def _running_progress(body: dict[str, Any], previous: dict[str, Any] | None) -> dict[str, Any] | None:
    """Progress from a QUEUED/RUNNING reply; the server may leave it out."""
    total = _count(body, "total")
    if total is None:
        return previous
    completed = _count(body, "completed")
    passed = _count(body, "passed") or 0
    failed = _count(body, "failed") or 0
    return progress(total, completed if completed is not None else passed + failed, passed, failed)


def normalise_results(body: dict[str, Any], suite_title: str, server_name: str) -> dict[str, Any]:
    """The server's results in the frontend's devdoc-robot-results-v1 shape;
    a reply it cannot read is rejected whole, never half-applied."""
    raw = body.get("results")
    if isinstance(raw, dict):  # a whole devdoc-robot-results-v1 document
        raw = raw.get("results")
    if not isinstance(raw, list):
        raise ApiError(502, f'Test server "{server_name}" completed the run without a results list.')
    if len(raw) > MAX_RESULTS:
        raise ApiError(502, f'Test server "{server_name}" returned more than {MAX_RESULTS} results.')
    results: list[dict[str, Any]] = []
    for i, entry in enumerate(raw):
        status = _STATUS_MAP.get(str(entry.get("status", "")).upper()) if isinstance(entry, dict) else None
        title = entry.get("title") if isinstance(entry, dict) else None
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
        if status == "FAIL":
            message = entry.get("failureMessage")
            result["failureMessage"] = message[:2000] if isinstance(message, str) and message else "Failed."
        results.append(result)
    return {
        "_schema": "devdoc-robot-results-v1",
        "suiteTitle": suite_title,
        "executedAt": _now_iso(),
        "environment": server_name,
        "summary": {
            "total": len(results),
            "passed": sum(r["status"] == "PASS" for r in results),
            "failed": sum(r["status"] == "FAIL" for r in results),
            "skipped": sum(r["status"] == "SKIP" for r in results),
        },
        "results": results,
    }


class RemoteRunService:
    def __init__(
        self,
        jobs: RemoteJobStore,
        servers: TestServerService,
        redis: Redis,
        test_store: TestManagementStore | None = None,
    ) -> None:
        self._jobs = jobs
        self._servers = servers
        self._redis = redis
        self._test_store = test_store

    # ── start and read ─────────────────────────────────────────────────
    async def start(self, server_id: str, script: PushedScript, job_id: str, user_name: str, run_id: Any) -> None:
        server = await self._servers.get_server(server_id)
        res = await self._servers.call(
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
            raise ApiError(502, _http_error(server["name"], res.status_code, "did not start the run"))
        remote_job_id = _json(res).get("jobId")
        if isinstance(remote_job_id, bool) or not isinstance(remote_job_id, (str, int)) or str(remote_job_id) == "":
            raise ApiError(502, f'Test server "{server["name"]}" did not return a jobId.')
        await self._jobs.put(
            job_id,
            {
                "serverId": server_id,
                "serverName": server["name"],
                "remoteJobId": str(remote_job_id),
                "suiteId": script.suite_id,
                "suiteTitle": script.suite_title,
                "runId": run_id if isinstance(run_id, str) and run_id else None,
                "startedBy": user_name,
                "startedAt": _now_iso(),
                "status": "QUEUED",
                "progress": None,
                "pollIntervalSeconds": server.get("pollIntervalSeconds", 10),
                "nextPollAt": 0,  # first poll on the next tick
                "failures": 0,
            },
        )
        await self._jobs.activate(job_id)

    async def status(self, job_id: str) -> dict[str, Any] | None:
        """The stored state, in the wire shape of GET /api/test-exec/runs/:id."""
        job = await self._jobs.get(job_id)
        if job is None:
            return None
        out: dict[str, Any] = {
            "status": {"COMPLETED": "completed", "FAILED": "failed"}.get(job["status"], "running"),
            "phase": job["status"],
            "server": job["serverName"],
        }
        if job.get("progress"):
            out["progress"] = job["progress"]
        if job.get("lastPolledAt"):
            out["lastPolledAt"] = job["lastPolledAt"]
        if job["status"] in ACTIVE and job.get("lastError"):
            out["pollError"] = job["lastError"]
        if job["status"] == "COMPLETED":
            out["results"] = job["results"]
        if job["status"] == "FAILED":
            out["error"] = job.get("error") or "The run failed."
        return out

    # ── live updates (022) ─────────────────────────────────────────────
    @staticmethod
    def _channel(job_id: str) -> str:
        return f"dds:texec:events:{job_id}"

    async def _publish(self, job_id: str) -> None:
        await self._redis.publish(self._channel(job_id), "changed")

    async def events(self, job_id: str, heartbeat_s: float = HEARTBEAT_S) -> AsyncIterator[str] | None:
        """A server-sent event stream of the job's status, or None if there
        is no such remote job. Subscribes before the first read, so no change
        can slip between the two."""
        pubsub = self._redis.pubsub()
        await pubsub.subscribe(self._channel(job_id))
        first = await self.status(job_id)
        if first is None:
            await pubsub.aclose()
            return None

        def event(status: dict[str, Any]) -> str:
            return f"event: status\ndata: {json.dumps(status, separators=(',', ':'))}\n\n"

        def key(status: dict[str, Any]) -> str:  # what counts as a change
            return json.dumps({k: v for k, v in status.items() if k != "lastPolledAt"}, sort_keys=True)

        async def stream() -> AsyncIterator[str]:
            try:
                yield "retry: 3000\n\n"  # how long a browser waits before reconnecting
                yield event(first)
                sent = key(first)
                if first["status"] != "running":
                    return
                while True:
                    message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=heartbeat_s)
                    status = await self.status(job_id)  # re-read on a message, and on each heartbeat
                    if status is None:
                        return
                    if key(status) != sent:
                        yield event(status)
                        sent = key(status)
                    elif message is None:
                        yield ": keep-alive\n\n"
                    if status["status"] != "running":
                        return
            finally:
                await pubsub.aclose()

        return stream()

    # ── the polling worker ─────────────────────────────────────────────
    async def poll_due(self, now: float | None = None) -> int:
        """Polls every active job whose next poll is due; returns how many."""
        now = time.time() if now is None else now
        ids = await self._jobs.active_ids()
        if not ids:
            return 0
        jobs = await self._jobs.get_many(ids)
        due = [(i, j) for i, j in jobs.items() if j is not None and j["status"] in ACTIVE and j["nextPollAt"] <= now]
        for job_id, job in jobs.items():  # finished or vanished: stop tracking
            if job is None or job["status"] not in ACTIVE:
                await self._jobs.deactivate(job_id)
        semaphore = asyncio.Semaphore(POLL_CONCURRENCY)

        async def one(job_id: str, job: dict[str, Any]) -> bool:
            async with semaphore:
                return await self._poll_one(job_id, job, now)

        polled = await asyncio.gather(*(one(i, j) for i, j in due))
        return sum(polled)

    async def _poll_one(self, job_id: str, job: dict[str, Any], now: float) -> bool:
        interval = job.get("pollIntervalSeconds", 10)
        if not await self._jobs.lock(job_id, max(1, interval - 1)):
            return False  # another API instance has it
        try:
            server = await self._servers.get_server(job["serverId"])
        except ApiError:
            await self._finish(job_id, job, "FAILED", error="The test server was removed before the run finished.")
            return True
        try:
            res = await self._servers.call(server, "GET", f"/runs/{quote(job['remoteJobId'], safe='')}")
            if res.status_code >= 400:
                raise ApiError(502, _http_error(server["name"], res.status_code, "could not report the run"))
            body = _json(res)
            status = str(body.get("status", "")).upper()
            if status in ACTIVE:
                job.update(status=status, progress=_running_progress(body, job.get("progress")), failures=0)
                job.pop("lastError", None)
            elif status == "FAILED":
                error = body.get("error")
                message = error.strip()[:1000] if isinstance(error, str) and error.strip() else None
                await self._finish(job_id, job, "FAILED", error=message or "The test server reported the run failed.")
                return True
            elif status == "COMPLETED":
                try:
                    results = normalise_results(body, job["suiteTitle"], server["name"])
                except ApiError as exc:
                    await self._finish(job_id, job, "FAILED", error=exc.message)
                    return True
                await self._finish(job_id, job, "COMPLETED", results=results)
                return True
            else:
                raise ApiError(
                    502, f'Test server "{server["name"]}" returned an unknown run status: {status or "none"}.'
                )
        except ApiError as exc:
            job["failures"] = job.get("failures", 0) + 1
            job["lastError"] = exc.message
            if job["failures"] >= MAX_POLL_FAILURES:
                error = f"Lost contact with the test server after {job['failures']} failed checks: {exc.message}"
                await self._finish(job_id, job, "FAILED", error=error)
                return True
        job["lastPolledAt"] = _now_iso()
        job["nextPollAt"] = now + interval
        await self._jobs.put(job_id, job)
        await self._publish(job_id)
        await self._update_run(job)
        return True

    async def _finish(
        self, job_id: str, job: dict[str, Any], status: str, *, error: str | None = None, results: Any = None
    ) -> None:
        job.update(status=status, lastPolledAt=_now_iso(), finishedAt=_now_iso())
        job.pop("lastError", None)
        if error:
            job["error"] = error
        if results is not None:
            job["results"] = results
            s = results["summary"]
            job["progress"] = progress(s["total"], s["total"], s["passed"], s["failed"])
        await self._jobs.put(job_id, job)
        await self._jobs.deactivate(job_id)
        await self._publish(job_id)
        await self._update_run(job)

    async def _update_run(self, job: dict[str, Any]) -> None:
        """Writes progress and, once finished, the outcome into the linked
        test run - the same fields the page fills in itself."""
        if self._test_store is None or not job.get("runId"):
            return
        run = await self._test_store.get_item("runs", job["runId"])
        if run is None:
            return
        remote = {"server": job["serverName"], "phase": job["status"], "progress": job.get("progress")}
        if job.get("error"):
            remote["error"] = job["error"]
        updated = {**run, "remote": remote}
        if job["status"] == "FAILED":
            updated["status"] = "Failed"
        elif job["status"] == "COMPLETED":
            s = job["results"]["summary"]
            status_names = {"PASS": "Passed", "SKIP": "Skipped", "FAIL": "Failed"}
            updated.update(
                status="Completed" if s["failed"] == 0 else "Failed",
                passedCount=s["passed"],
                failedCount=s["failed"],
                blockedCount=s["skipped"],
                caseResults=[
                    {
                        "caseId": f"tc-{i}",
                        "customId": r["customId"],
                        "title": r["title"],
                        "status": status_names[r["status"]],
                    }
                    for i, r in enumerate(job["results"]["results"])
                ],
            )
        if updated != run:
            await self._test_store.put_item("runs", updated)


class RemoteRunPoller:
    """The background worker: one loop per API process, started and
    stopped with the app."""

    def __init__(self, service: RemoteRunService, tick_s: float = TICK_S) -> None:
        self._service = service
        self._tick_s = tick_s
        self._task: asyncio.Task[None] | None = None

    def start(self) -> None:
        self._task = asyncio.create_task(self._loop(), name="remote-run-poller")

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task

    async def _loop(self) -> None:
        while True:
            try:
                await self._service.poll_due()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Remote run polling failed; retrying on the next tick.")
            await asyncio.sleep(self._tick_s)
