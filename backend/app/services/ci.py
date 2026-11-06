"""CI/CD integration (DDS-SRS-026, 027): pipelines - Jenkins, Bitbucket
Pipelines or anything that can run curl - call DevDoc Studio with a CI token.

- Admins create named CI tokens. A token is shown once; only its SHA-256
  is stored (it is 256 random bits, so a fast hash is enough). Revoking
  one stops it at once.
- `trigger()` runs a stored suite on a registered test server, exactly as
  a scheduled run does (services/suite_runs.py); the pipeline then waits
  on `status()` and fails the build when the run fails.
- `upload()` records tests the pipeline ran itself (locally on the CI
  agent): a Robot Framework output.xml, or a JSON results list. It becomes
  a completed test run.
- Every CI run carries the build it came from (pipeline, build URL and
  number, repository, branch, commit), shown on the run. Runs are owned by
  the admin who created the token.

Ready-made pipeline steps: ci/devdoc-ci.sh, docs/ci/.
"""

import hashlib
import json
import random
import secrets
import string
import time
import uuid
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlsplit

from app.core.errors import ApiError
from app.core.jscompat import js_iso_date
from app.models.user import User
from app.repositories.ci_tokens import CiTokenStore
from app.repositories.test_management import TestManagementStore
from app.services.permissions import is_admin
from app.services.remote_runs import RemoteRunService, normalise_results
from app.services.robot_output import parse_robot_output
from app.services.suite_runs import SuiteRunStarter
from app.services.test_servers import TestServerService

TOKEN_PREFIX = "ddsci_"
BUILD_FIELDS = ("pipeline", "buildUrl", "buildNumber", "repository", "branch", "commit")
_BASE36 = string.digits + string.ascii_lowercase
_STATUS_NAMES = {"PASS": "Passed", "SKIP": "Skipped", "FAIL": "Failed"}


def _now_iso() -> str:
    return js_iso_date(datetime.now(UTC))


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def build_info(raw: Any) -> dict[str, str]:
    """The pipeline's description of the build; every field optional."""
    if raw is None:
        return {}
    if not isinstance(raw, dict):
        raise ApiError(400, "build must be an object.")
    out: dict[str, str] = {}
    for field in BUILD_FIELDS:
        value = raw.get(field)
        if value is None or value == "":
            continue
        if isinstance(value, int) and not isinstance(value, bool):
            value = str(value)
        if not isinstance(value, str) or len(value) > 500:
            raise ApiError(400, f"build.{field} must be text of at most 500 characters.")
        out[field] = value.strip()
    url = out.get("buildUrl")
    if url and urlsplit(url).scheme not in ("http", "https"):
        raise ApiError(400, "build.buildUrl must be an http:// or https:// URL.")
    return out


class CiService:
    def __init__(
        self,
        tokens: CiTokenStore,
        test_store: TestManagementStore,
        servers: TestServerService,
        remote_runs: RemoteRunService,
    ) -> None:
        self._tokens = tokens
        self._test_store = test_store
        self._remote_runs = remote_runs
        self._starter = SuiteRunStarter(test_store, servers, remote_runs)

    # ── tokens (admins, signed in) ─────────────────────────────────────
    @staticmethod
    def _require_admin(user: User) -> None:
        if not is_admin(user):
            raise ApiError(403, "Only admins can manage CI tokens.")

    @staticmethod
    def _view(record: dict[str, Any]) -> dict[str, Any]:
        return {k: v for k, v in record.items() if k != "hash"}

    async def list_tokens(self, user: User) -> dict[str, Any]:
        self._require_admin(user)
        return {"tokens": [self._view(t) for t in await self._tokens.list()]}

    async def create_token(self, user: User, body: Any) -> dict[str, Any]:
        self._require_admin(user)
        name = body.get("name") if isinstance(body, dict) else None
        if not isinstance(name, str) or not name.strip() or len(name.strip()) > 100:
            raise ApiError(400, 'name is required (at most 100 characters), e.g. "Jenkins - firmware".')
        token = TOKEN_PREFIX + secrets.token_urlsafe(32)
        record = {
            "id": str(uuid.uuid4()),
            "name": name.strip(),
            "hint": token[: len(TOKEN_PREFIX) + 4] + "…",
            "hash": hash_token(token),
            "createdBy": user.name,
            "createdAt": _now_iso(),
            "lastUsedAt": None,
        }
        await self._tokens.put(record)
        return {"token": token, "record": self._view(record)}

    async def revoke_token(self, user: User, token_id: str) -> None:
        self._require_admin(user)
        if not await self._tokens.delete(token_id):
            raise ApiError(404, "No CI token found with that id.")

    async def authenticate(self, authorization: str | None) -> dict[str, Any]:
        """The token record for `Authorization: Bearer <token>`, or 401."""
        scheme, _, token = (authorization or "").partition(" ")
        if scheme.lower() != "bearer" or not token.strip().startswith(TOKEN_PREFIX):
            raise ApiError(401, "A CI token is required: Authorization: Bearer ddsci_…", {"WWW-Authenticate": "Bearer"})
        record = await self._tokens.by_hash(hash_token(token.strip()))
        if record is None:
            raise ApiError(401, "This CI token is not valid or was revoked.", {"WWW-Authenticate": "Bearer"})
        await self._tokens.touch(record["id"], _now_iso())
        return record

    # ── pipeline calls (CI token) ──────────────────────────────────────
    async def trigger(self, token: dict[str, Any], body: Any) -> dict[str, Any]:
        """Runs a stored suite on a registered test server (DDS-SRS-027)."""
        if not isinstance(body, dict):
            raise ApiError(400, "Request body must be a JSON object.")
        suite_id, server_id = body.get("suiteId"), body.get("serverId")
        if not isinstance(suite_id, str) or not suite_id:
            raise ApiError(400, "suiteId is required.")
        if not isinstance(server_id, str) or not server_id:
            raise ApiError(400, "serverId is required.")
        name = body.get("name")
        if name is not None and (not isinstance(name, str) or len(name) > 200):
            raise ApiError(400, "name must be text of at most 200 characters.")
        build = {**build_info(body.get("build")), "token": token["name"]}
        run_id, job_id = await self._starter.start(
            suite_id=suite_id,
            server_id=server_id,
            owner=token["createdBy"],
            kind="CI Run",
            name=name.strip() if isinstance(name, str) and name.strip() else None,
            extra={"ci": build},
        )
        return {"runId": run_id, "jobId": job_id}

    async def status(self, job_id: str) -> dict[str, Any]:
        """The run's status plus `outcome` - pending, passed or failed - so a
        pipeline step can decide whether the build passes."""
        status = await self._remote_runs.status(job_id)
        if status is None:
            raise ApiError(404, "No run found with that jobId.")
        if status["status"] == "running":
            outcome = "pending"
        elif status["status"] == "completed" and status["results"]["summary"]["failed"] == 0:
            outcome = "passed"
        else:
            outcome = "failed"
        return {**status, "outcome": outcome}

    async def upload(
        self, token: dict[str, Any], params: dict[str, str], content_type: str, body: bytes
    ) -> dict[str, Any]:
        """Records tests the pipeline ran itself (DDS-SRS-026): output.xml
        (application/xml) or JSON {"results": [...]} as in docs/test-pc-api.md."""
        suite_id = params.get("suiteId")
        if not suite_id:
            raise ApiError(400, "suiteId is required (?suiteId=…).")
        suite = await self._test_store.get_suite(suite_id)
        if suite is None:
            raise ApiError(400, "No suite with that suiteId.")
        build = {**build_info({k: params.get(k) for k in BUILD_FIELDS}), "token": token["name"]}
        environment = build.get("pipeline") or "CI"
        mime = content_type.split(";")[0].strip().lower()
        if mime in ("application/xml", "text/xml"):
            parsed = parse_robot_output(body)
            results = normalise_results(parsed, suite.get("title", ""), environment)
        elif mime == "application/json":
            try:
                data = json.loads(body)
            except (ValueError, UnicodeDecodeError) as exc:
                raise ApiError(400, "The body is not valid JSON.") from exc
            if not isinstance(data, dict):
                raise ApiError(400, 'The body must be a JSON object with a "results" list.')
            try:
                results = normalise_results(data, suite.get("title", ""), environment)
            except ApiError as exc:  # the same checks, but the caller's mistake here
                raise ApiError(400, exc.message.replace(f'Test server "{environment}" ', "The upload ")) from exc
        else:
            raise ApiError(415, "Send output.xml as application/xml, or results as application/json.")

        summary = results["summary"]
        suffix = f"{int(time.time() * 1000)}-{''.join(random.choices(_BASE36, k=6))}"
        name = params.get("name") or f"{suite.get('title', '')} CI Run"
        run = {
            "id": f"run-ci-{suffix}",
            "name": name[:200],
            "suiteId": suite_id,
            "environment": environment,
            "status": "Completed" if summary["failed"] == 0 else "Failed",
            "passedCount": summary["passed"],
            "failedCount": summary["failed"],
            "blockedCount": summary["skipped"],
            "executedAt": _now_iso(),
            "caseResults": [
                {
                    "caseId": f"tc-{i}",
                    "customId": r["customId"],
                    "title": r["title"],
                    "status": _STATUS_NAMES[r["status"]],
                }
                for i, r in enumerate(results["results"])
            ],
            "ci": build,
            "createdBy": token["createdBy"],
            "updatedAt": _now_iso(),
        }
        await self._test_store.put_item("runs", run)
        return {"runId": run["id"], "summary": summary, "outcome": "passed" if summary["failed"] == 0 else "failed"}
