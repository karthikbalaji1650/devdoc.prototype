"""Scheduled test runs (DDS-SRS-028).

- A schedule runs one suite on one registered test server: once (a date
  and time), daily (a time) or weekly (a time on chosen weekdays), in the
  creator's time zone.
- The background worker (services/remote_runs.py) calls `fire_due()` every
  tick. A due schedule builds the suite's Robot script from the stored
  test cases (services/robot_suite.py), adds an "In Progress" test run
  owned by the schedule's creator, and starts it like Run Test does; the
  worker then polls it and fills in the run (DDS-SRS-021).
- Occurrences missed while the server was down are not made up: the next
  one is worked out from now. Each occurrence is claimed in Redis, so two
  API instances never fire it twice.
- Anyone signed in can schedule; the creator and admins can change or
  remove a schedule.
"""

import logging
import random
import re
import string
import time
import uuid
from datetime import UTC, date, datetime, timedelta
from datetime import time as dtime
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.core.errors import ApiError
from app.core.jscompat import js_iso_date
from app.models.test_exec import PushedScript
from app.models.user import User
from app.repositories.schedules import ScheduleStore
from app.repositories.test_management import TestManagementStore
from app.services.permissions import is_admin
from app.services.remote_runs import RemoteRunService
from app.services.robot_suite import build_robot_suite_text
from app.services.test_servers import TestServerService

logger = logging.getLogger("devdoc.schedules")

FREQUENCIES = ("once", "daily", "weekly")
WEEKDAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
_TIME = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")
_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_BASE36 = string.digits + string.ascii_lowercase


def _now_iso() -> str:
    return js_iso_date(datetime.now(UTC))


def _iso(ts: float | None) -> str | None:
    return js_iso_date(datetime.fromtimestamp(ts, UTC)) if ts is not None else None


def next_occurrence(schedule: dict[str, Any], after: float) -> float | None:
    """The first time strictly after `after` (epoch seconds) the schedule
    should fire, or None if it never will again."""
    tz = ZoneInfo(schedule["timezone"])
    hour, minute = (int(x) for x in schedule["time"].split(":"))
    at = dtime(hour, minute)
    if schedule["frequency"] == "once":
        when = datetime.combine(date.fromisoformat(schedule["date"]), at, tz).timestamp()
        return when if when > after else None
    start = datetime.fromtimestamp(after, tz).date()
    for offset in range(8):  # the next week covers every weekday
        day = start + timedelta(days=offset)
        if schedule["frequency"] == "weekly" and WEEKDAYS[day.weekday()] not in schedule["weekdays"]:
            continue
        when = datetime.combine(day, at, tz).timestamp()
        if when > after:
            return when
    return None


def _run_id() -> str:
    return f"run-sched-{int(time.time() * 1000)}-{''.join(random.choices(_BASE36, k=6))}"


class ScheduleService:
    def __init__(
        self,
        store: ScheduleStore,
        test_store: TestManagementStore,
        servers: TestServerService,
        remote_runs: RemoteRunService,
    ) -> None:
        self._store = store
        self._test_store = test_store
        self._servers = servers
        self._remote_runs = remote_runs

    # ── CRUD ───────────────────────────────────────────────────────────
    async def list(self, suite_id: str | None = None) -> dict[str, Any]:
        items = await self._store.list()
        if suite_id:
            items = [s for s in items if s["suiteId"] == suite_id]
        return {"schedules": [self._view(s) for s in items]}

    @staticmethod
    def _view(schedule: dict[str, Any]) -> dict[str, Any]:
        return {**schedule, "nextRunAt": _iso(schedule.get("nextRunAt"))}

    async def _get(self, schedule_id: str) -> dict[str, Any]:
        schedule = await self._store.get(schedule_id)
        if schedule is None:
            raise ApiError(404, "No schedule found with that id.")
        return schedule

    @staticmethod
    def _require_owner(user: User, schedule: dict[str, Any]) -> None:
        if not (is_admin(user) or schedule.get("createdBy") == user.name):
            raise ApiError(403, "You can only change schedules you created.")

    async def create(self, user: User, body: Any) -> dict[str, Any]:
        schedule = await self._apply({"id": str(uuid.uuid4()), "createdBy": user.name, "createdAt": _now_iso()}, body)
        await self._store.put(schedule)
        return self._view(schedule)

    async def update(self, user: User, schedule_id: str, body: Any) -> dict[str, Any]:
        existing = await self._get(schedule_id)
        self._require_owner(user, existing)
        schedule = await self._apply(existing, body)
        await self._store.put(schedule)
        return self._view(schedule)

    async def delete(self, user: User, schedule_id: str) -> None:
        self._require_owner(user, await self._get(schedule_id))
        await self._store.delete(schedule_id)

    async def _apply(self, schedule: dict[str, Any], body: Any) -> dict[str, Any]:
        if not isinstance(body, dict):
            raise ApiError(400, "Request body must be a JSON object.")
        suite_id, server_id = body.get("suiteId"), body.get("serverId")
        if not isinstance(suite_id, str) or await self._test_store.get_suite(suite_id) is None:
            raise ApiError(400, "suiteId must be an existing test suite.")
        if not isinstance(server_id, str):
            raise ApiError(400, "serverId must be a registered test server.")
        try:
            await self._servers.get_server(server_id)
        except ApiError as exc:
            raise ApiError(400, "serverId must be a registered test server.") from exc

        frequency = body.get("frequency")
        if frequency not in FREQUENCIES:
            raise ApiError(400, f"frequency must be one of {', '.join(FREQUENCIES)}.")
        at = body.get("time")
        if not isinstance(at, str) or not _TIME.match(at):
            raise ApiError(400, "time must be HH:MM (24-hour).")
        tz_name = body.get("timezone") or "UTC"
        try:
            ZoneInfo(tz_name)
        except (ZoneInfoNotFoundError, ValueError, TypeError) as exc:
            raise ApiError(400, "timezone must be an IANA time zone, e.g. Asia/Kolkata.") from exc

        on_date: str | None = None
        weekdays: list[str] = []
        if frequency == "once":
            on_date = body.get("date")
            try:
                if not isinstance(on_date, str) or not _DATE.match(on_date):
                    raise ValueError
                date.fromisoformat(on_date)
            except ValueError as exc:
                raise ApiError(400, "date must be YYYY-MM-DD.") from exc
        elif frequency == "weekly":
            raw = body.get("weekdays")
            if not isinstance(raw, list) or not raw or any(d not in WEEKDAYS for d in raw):
                raise ApiError(400, f"weekdays must list at least one of {', '.join(WEEKDAYS)}.")
            weekdays = [d for d in WEEKDAYS if d in raw]

        enabled = body.get("enabled", True)
        if not isinstance(enabled, bool):
            raise ApiError(400, "enabled must be true or false.")
        updated = {
            **schedule,
            "suiteId": suite_id,
            "serverId": server_id,
            "frequency": frequency,
            "time": at,
            "timezone": tz_name,
            "date": on_date,
            "weekdays": weekdays,
            "enabled": enabled,
            "updatedAt": _now_iso(),
        }
        updated["nextRunAt"] = next_occurrence(updated, time.time()) if enabled else None
        if enabled and updated["nextRunAt"] is None:
            raise ApiError(400, "That date and time has already passed.")
        return updated

    # ── firing (called by the background worker) ───────────────────────
    async def fire_due(self, now: float | None = None) -> int:
        now = time.time() if now is None else now
        fired = 0
        for schedule in await self._store.list():
            due = schedule.get("nextRunAt")
            if not schedule.get("enabled") or due is None or due > now:
                continue
            if not await self._store.claim(schedule["id"], due):
                continue
            try:
                schedule["lastRunId"] = await self._fire(schedule)
                schedule.pop("lastError", None)
                fired += 1
            except ApiError as exc:
                schedule["lastError"] = exc.message
            except Exception:  # one broken schedule must not stop the others
                logger.exception("Scheduled run %s failed to start.", schedule["id"])
                schedule["lastError"] = "The run could not be started."
            schedule["lastRunAt"] = _iso(now)
            schedule["nextRunAt"] = next_occurrence(schedule, now)
            if schedule["nextRunAt"] is None:
                schedule["enabled"] = False
            await self._store.put(schedule)
        return fired

    async def _fire(self, schedule: dict[str, Any]) -> str:
        suite = await self._test_store.get_suite(schedule["suiteId"])
        if suite is None:
            raise ApiError(400, "The suite was deleted.")
        cases = [c for c in await self._test_store.list_cases(schedule["suiteId"]) if not c.get("isDeleted")]
        script = PushedScript(suite["id"], suite.get("title", ""), build_robot_suite_text(suite, cases))
        server = await self._servers.get_server(schedule["serverId"])
        run_id = _run_id()
        await self._test_store.put_item(
            "runs",
            {
                "id": run_id,
                "name": f"{script.suite_title} Scheduled Run",
                "suiteId": suite["id"],
                "environment": server["name"],
                "status": "In Progress",
                "passedCount": 0,
                "failedCount": 0,
                "blockedCount": 0,
                "executedAt": _now_iso(),
                "remote": {"server": server["name"], "phase": "QUEUED"},
                "scheduleId": schedule["id"],
                "createdBy": schedule["createdBy"],
                "updatedAt": _now_iso(),
            },
        )
        job_id = f"job-sched-{run_id.removeprefix('run-sched-')}"
        try:
            await self._remote_runs.start(server["id"], script, job_id, schedule["createdBy"], run_id)
        except ApiError as exc:
            run = await self._test_store.get_item("runs", run_id)
            if run is not None:
                run.update(status="Failed", remote={"server": server["name"], "phase": "FAILED", "error": exc.message})
                await self._test_store.put_item("runs", run)
            raise
        return run_id
