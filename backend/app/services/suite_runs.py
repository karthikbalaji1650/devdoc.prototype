"""Starting a stored suite on a registered test server with no browser
involved - shared by scheduled runs (DDS-SRS-028) and CI/CD-triggered runs
(DDS-SRS-026/027).

Builds the suite's Robot script from the stored test cases, adds an
"In Progress" test run, and starts it through RemoteRunService, whose
worker then polls it and fills the run in (DDS-SRS-021)."""

import random
import string
import time
from datetime import UTC, datetime
from typing import Any

from app.core.errors import ApiError
from app.core.jscompat import js_iso_date
from app.models.test_exec import PushedScript
from app.repositories.test_management import TestManagementStore
from app.services.remote_runs import RemoteRunService
from app.services.robot_suite import build_robot_suite_text
from app.services.test_servers import TestServerService

_BASE36 = string.digits + string.ascii_lowercase


def _now_iso() -> str:
    return js_iso_date(datetime.now(UTC))


def _suffix() -> str:
    return f"{int(time.time() * 1000)}-{''.join(random.choices(_BASE36, k=6))}"


class SuiteRunStarter:
    def __init__(
        self, test_store: TestManagementStore, servers: TestServerService, remote_runs: RemoteRunService
    ) -> None:
        self._test_store = test_store
        self._servers = servers
        self._remote_runs = remote_runs

    async def start(
        self, *, suite_id: str, server_id: str, owner: str, kind: str, name: str | None, extra: dict[str, Any]
    ) -> tuple[str, str]:
        """Returns (run id, job id). `kind` names the run ("Scheduled Run",
        "CI Run") and prefixes its ids; `extra` is stored on the run."""
        suite = await self._test_store.get_suite(suite_id)
        if suite is None:
            raise ApiError(400, "The suite was deleted." if kind == "Scheduled Run" else "No suite with that suiteId.")
        cases = [c for c in await self._test_store.list_cases(suite_id) if not c.get("isDeleted")]
        script = PushedScript(suite["id"], suite.get("title", ""), build_robot_suite_text(suite, cases))
        server = await self._servers.get_server(server_id)
        slug = kind.split()[0].lower()  # "scheduled" / "ci"
        suffix = _suffix()
        run_id, job_id = f"run-{slug}-{suffix}", f"job-{slug}-{suffix}"
        await self._test_store.put_item(
            "runs",
            {
                "id": run_id,
                "name": name or f"{script.suite_title} {kind}",
                "suiteId": suite["id"],
                "environment": server["name"],
                "status": "In Progress",
                "passedCount": 0,
                "failedCount": 0,
                "blockedCount": 0,
                "executedAt": _now_iso(),
                "remote": {"server": server["name"], "phase": "QUEUED"},
                **extra,
                "createdBy": owner,
                "updatedAt": _now_iso(),
            },
        )
        try:
            await self._remote_runs.start(server["id"], script, job_id, owner, run_id)
        except ApiError as exc:
            run = await self._test_store.get_item("runs", run_id)
            if run is not None:
                run.update(status="Failed", remote={"server": server["name"], "phase": "FAILED", "error": exc.message})
                await self._test_store.put_item("runs", run)
            raise
        return run_id, job_id
