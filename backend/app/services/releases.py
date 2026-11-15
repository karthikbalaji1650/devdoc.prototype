"""Release management (DDS-SRS-033 - 046).

Who may do what - the same for admins and regular users:

- Anyone signed in can read every release and can create one. The creator is
  automatically the first signer and picks 1 to 4 more (2 to 5 in all).
- Only the creator changes a release: details, signers, builds, linked test
  runs, blockers, notes and cancelling. Nobody can delete a release.
- Any signer can sign off a build, override failing gates (with a reason) and
  promote a build to Final. Every signer must approve a build first.
- Readiness gates (043) are evaluated here, from the test runs linked to a
  build (042) and the release's open blockers (044), on every read.
- Every change that matters is appended to the release's audit log (046):
  server-written, never edited, each entry hash-chained to the one before,
  so any tampering with the stored log is detectable.

Sign-offs are per build: a new RC needs everyone's approval again. The one
place that decides which sign-offs count for a build is `_signoffs_of`.
"""

import hashlib
import json
import re
import time
import uuid
from datetime import UTC, date, datetime
from typing import Any

from app.core.errors import ApiError
from app.core.jscompat import js_dumps, js_loads
from app.models.user import User
from app.repositories.base import UserRepository
from app.repositories.releases import DuplicateBlocker, DuplicateBuild, DuplicateVersion, ReleaseRepository
from app.repositories.test_management import TestManagementStore
from app.services.trackers import TrackerService, blocker_query

TYPES = ("Major", "Minor", "Patch", "Hotfix")
STATUSES = ("Planned", "In Progress", "RC Frozen", "Approved", "Deployed", "Cancelled")
SETTABLE_STATUSES = tuple(s for s in STATUSES if s != "Cancelled")  # cancelling has its own action
MILESTONES = (
    ("code-freeze", "Code Freeze"),
    ("rc-build", "RC Build Generation"),
    ("qa-regression", "QA Regression Window"),
    ("final-signoff", "Final Sign-off"),
    ("ga", "General Availability (GA)"),
)
SEVERITIES = ("Blocker", "Critical", "Major", "Minor")
REPOSITORIES = ("Artifactory", "Nexus", "AWS ECR", "Other")
DEFAULT_GATE_RULES = {"minPassRate": 98, "requireNoOpenBlockers": True, "mandatorySuiteIds": []}
FIRST_RC_NUMBER = 100  # v2.4.0-RC100, -RC101, ... (DDS-SRS-039)
MIN_SIGNERS = 2
MAX_SIGNERS = 5
_SHA256 = re.compile(r"^[0-9a-fA-F]{64}$")
_COMMIT = re.compile(r"^[0-9a-fA-F]{7,40}$")
_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_GENESIS = "0" * 64


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


# Who the audit log names for the background sync of Jira / GitHub blockers.
TRACKER_SYNC_USER = User("system", "Tracker sync", "", None, None, "system", None, None)


def _text(body: dict[str, Any], field: str, required: bool = True, limit: int = 2000) -> str | None:
    value = body.get(field)
    if value is None or (isinstance(value, str) and not value.strip()):
        if required:
            raise ApiError(400, f"{field} is required.")
        return None
    if not isinstance(value, str):
        raise ApiError(400, f"{field} must be text.")
    if len(value.strip()) > limit:
        raise ApiError(400, f"{field} must be at most {limit} characters.")
    return value.strip()


def _choice(body: dict[str, Any], field: str, options: tuple[str, ...], default: str | None = None) -> str:
    value = body.get(field, default)
    if value not in options:
        raise ApiError(400, f"{field} must be one of {', '.join(options)}.")
    return value  # type: ignore[return-value]


def _day(value: Any, field: str, required: bool = False) -> str | None:
    if value is None or value == "":
        if required:
            raise ApiError(400, f"{field} is required.")
        return None
    if not isinstance(value, str) or not _DATE.match(value):
        raise ApiError(400, f"{field} must be a date like 2026-12-01.")
    try:
        date.fromisoformat(value)
    except ValueError as exc:
        raise ApiError(400, f"{field} must be a real date like 2026-12-01.") from exc
    return value


def _entry_hash(entry: dict[str, Any]) -> str:
    content = {k: v for k, v in entry.items() if k != "hash"}
    return hashlib.sha256(json.dumps(content, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def verify_chain(entries: list[dict[str, Any]]) -> bool:
    """True if no stored entry was changed, removed or reordered."""
    previous = _GENESIS
    for i, entry in enumerate(entries):
        if entry.get("seq") != i + 1 or entry.get("prevHash") != previous or entry.get("hash") != _entry_hash(entry):
            return False
        previous = entry["hash"]
    return True


class ReleaseService:
    def __init__(
        self,
        repo: ReleaseRepository,
        users: UserRepository,
        tests: TestManagementStore,
        trackers: TrackerService | None = None,
    ) -> None:
        self._repo = repo
        self._users = users
        self._tests = tests
        self._trackers = trackers

    # ── permissions ────────────────────────────────────────────────────
    @staticmethod
    def _is_creator(user: User, release: dict[str, Any]) -> bool:
        return release["createdBy"] == user.id

    @staticmethod
    def _is_signer(user: User, release: dict[str, Any]) -> bool:
        return any(s["userId"] == user.id for s in release["signers"])

    def _require_creator(self, user: User, release: dict[str, Any]) -> None:
        """The creator, on a release that is not cancelled."""
        if not self._is_creator(user, release):
            raise ApiError(403, f"Only {release['createdByName']}, who created this release, can change it.")
        self._require_not_cancelled(release)

    @staticmethod
    def _require_not_cancelled(release: dict[str, Any]) -> None:
        if release["status"] == "Cancelled":
            raise ApiError(409, "This release is cancelled and can no longer be changed.")

    def _require_signer(self, user: User, release: dict[str, Any], what: str) -> None:
        if not self._is_signer(user, release):
            raise ApiError(403, f"Only the signers of this release can {what}.")
        self._require_not_cancelled(release)

    # ── audit log (046) ────────────────────────────────────────────────
    async def _audit(self, user: User, release_id: str, action: str, details: dict[str, Any]) -> None:
        # Stored and hashed in the same form (a whole 98.0 reads back as 98).
        details = js_loads(js_dumps(details))
        at = _now()

        def make(tail: dict[str, Any] | None) -> dict[str, Any]:
            entry = {
                "seq": (tail["seq"] + 1) if tail else 1,
                "at": at,
                "actorId": user.id,
                "actor": user.name,
                "actorRole": user.role,
                "action": action,
                "details": details,
                "prevHash": tail["hash"] if tail else _GENESIS,
            }
            entry["hash"] = _entry_hash(entry)
            return entry

        await self._repo.append_audit(release_id, make)

    async def audit_log(self, release_id: str) -> dict[str, Any]:
        await self._release_or_404(release_id)
        entries = await self._repo.audit(release_id)
        return {"entries": entries, "intact": verify_chain(entries)}

    async def export_all(self) -> list[dict[str, Any]]:
        return await self._repo.export_all()

    # ── lookups ────────────────────────────────────────────────────────
    async def _release_or_404(self, release_id: str) -> dict[str, Any]:
        release = await self._repo.get(release_id)
        if release is None:
            raise ApiError(404, "Release not found.")
        return release

    async def _build_or_404(self, release_id: str, build_id: str) -> dict[str, Any]:
        build = await self._repo.get_build(release_id, build_id)
        if build is None:
            raise ApiError(404, "Build not found.")
        return build

    async def _people(self, ids: list[str]) -> list[User]:
        """The users behind `ids`, in that order; an unknown id is a 400."""
        found = {u.id: u for u in await self._users.find_by_ids(ids)}
        missing = [i for i in ids if i not in found]
        if missing:
            raise ApiError(400, f"Unknown user: {', '.join(missing)}.")
        return [found[i] for i in ids]

    async def _other_signers(self, body: Any, field: str, creator_id: str) -> list[User]:
        """The people picked besides the creator: 1 to 4 of them."""
        ids = body.get(field) if isinstance(body, dict) else None
        if not isinstance(ids, list) or not all(isinstance(i, str) for i in ids):
            raise ApiError(400, f"{field} must be a list of user ids.")
        others = [i for i in dict.fromkeys(ids) if i != creator_id]  # the creator is always a signer
        if not MIN_SIGNERS - 1 <= len(others) <= MAX_SIGNERS - 1:
            raise ApiError(
                400,
                f"A release needs {MIN_SIGNERS} to {MAX_SIGNERS} signers: you and "
                f"{MIN_SIGNERS - 1} to {MAX_SIGNERS - 1} others.",
            )
        return await self._people(others)

    # ── readiness (043) and sign-offs (045) ────────────────────────────
    def _gates(
        self,
        release: dict[str, Any],
        build: dict[str, Any],
        runs: dict[str, dict[str, Any]],
        blockers: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """Readiness of one build against the release's rules (043)."""
        rules = {**DEFAULT_GATE_RULES, **(release.get("gateRules") or {})}
        linked = [runs[r] for r in build.get("testRunIds", []) if r in runs]
        results = [res for run in linked for res in run.get("caseResults") or []]
        executed = [r for r in results if r.get("status") != "Untested"]
        passed = sum(1 for r in executed if r.get("status") == "Passed")
        pass_rate = round(passed / len(executed) * 100, 1) if executed else None
        coverage = round(len(executed) / len(results) * 100, 1) if results else None
        open_critical = [
            b for b in blockers if b.get("status") == "Open" and b.get("severity") in ("Blocker", "Critical")
        ]

        checks = [
            {
                "id": "pass-rate",
                "label": f"Pass rate at least {rules['minPassRate']}%",
                "passed": pass_rate is not None and pass_rate >= rules["minPassRate"],
                "detail": f"{pass_rate}% of {len(executed)} executed results"
                if pass_rate is not None
                else "No executed results linked",
            }
        ]
        if rules.get("requireNoOpenBlockers", True):
            checks.append(
                {
                    "id": "blockers",
                    "label": "No open Critical or Blocker issues",
                    "passed": not open_critical,
                    "detail": ", ".join(b["key"] for b in open_critical) or "None open",
                }
            )
        for suite_id in rules.get("mandatorySuiteIds") or []:
            suite_runs = [r for r in linked if r.get("suiteId") == suite_id]
            complete = any(
                (r.get("caseResults") or []) and all(c.get("status") != "Untested" for c in r["caseResults"])
                for r in suite_runs
            )
            checks.append(
                {
                    "id": f"suite:{suite_id}",
                    "label": f"Mandatory suite {suite_id} 100% executed",
                    "passed": complete,
                    "detail": "Fully executed"
                    if complete
                    else ("Not fully executed" if suite_runs else "No run linked"),
                }
            )
        all_passed = all(c["passed"] for c in checks)
        override = build.get("gateOverride")
        verification = "Pending" if not linked else ("Verified" if all_passed else "Failed")
        return {
            "checks": checks,
            "passed": all_passed,
            "overridden": bool(override) and not all_passed,
            "ready": all_passed or bool(override),
            "passRate": pass_rate,
            "coverage": coverage,
            "linkedRuns": len(linked),
            "verification": verification,
        }

    @staticmethod
    def _signoffs_of(build: dict[str, Any]) -> dict[str, dict[str, Any]]:
        """The sign-offs that count for `build`, by user id. Sign-offs are per
        build today; if they ever apply to the whole release, this is the one
        place to change."""
        return build.get("signoffs") or {}

    def _signoff_status(self, release: dict[str, Any], build: dict[str, Any]) -> dict[str, Any]:
        """Counts only the release's current signers; a removed signer's
        decision stays on record but no longer counts."""
        given = self._signoffs_of(build)
        signers = release["signers"]
        decided = {s["userId"]: (given.get(s["userId"]) or {}).get("decision") for s in signers}
        approved = [s for s in signers if decided[s["userId"]] == "Approved"]
        return {
            "required": len(signers),
            "approved": len(approved),
            "rejected": sum(1 for d in decided.values() if d == "Rejected"),
            "waitingFor": [s["name"] for s in signers if decided[s["userId"]] != "Approved"],
            "complete": len(signers) >= MIN_SIGNERS and len(approved) == len(signers),
        }

    # ── reads (036) ────────────────────────────────────────────────────
    def _metrics(self, release: dict[str, Any], builds: list[dict[str, Any]], blockers: list[dict[str, Any]]) -> dict:
        milestones = release.get("milestones") or []
        latest = builds[-1] if builds else None
        gates = latest.get("gates") if latest else None
        return {
            "milestonesDone": sum(1 for m in milestones if m.get("actualDate")),
            "milestonesTotal": len(milestones),
            "openBlockers": sum(1 for b in blockers if b.get("status") == "Open"),
            "builds": len(builds),
            "latestBuild": latest["label"] if latest else None,
            "latestPassRate": gates["passRate"] if gates else None,
            "latestCoverage": gates["coverage"] if gates else None,
            "finalBuild": next((b["label"] for b in builds if b.get("kind") == "Final"), None),
        }

    def _flags(self, user: User, release: dict[str, Any]) -> dict[str, Any]:
        return {
            "canEdit": self._is_creator(user, release) and release["status"] != "Cancelled",
            "isSigner": self._is_signer(user, release),
        }

    async def list_releases(self, user: User) -> dict[str, Any]:
        """A light line per release; the full picture is `get_release`."""
        out = []
        for release in await self._repo.list_all():
            builds = await self._repo.list_builds(release["id"])
            blockers = await self._repo.list_blockers(release["id"])
            metrics = self._metrics(release, builds, blockers)
            out.append(
                {
                    "id": release["id"],
                    "version": release["version"],
                    "title": release["title"],
                    "type": release["type"],
                    "status": release["status"],
                    "targetDate": release["targetDate"],
                    "segment": release["segment"],
                    "createdBy": release["createdBy"],
                    "createdByName": release["createdByName"],
                    "signerCount": len(release["signers"]),
                    **self._flags(user, release),
                    "metrics": {k: metrics[k] for k in ("builds", "latestBuild", "finalBuild", "openBlockers")},
                }
            )
        return {"releases": out}

    async def get_release(self, user: User, release_id: str) -> dict[str, Any]:
        """One release with its builds (gates evaluated), blockers and metrics."""
        release = await self._release_or_404(release_id)
        return await self._detail(user, release)

    async def _detail(self, user: User, release: dict[str, Any]) -> dict[str, Any]:
        runs = {r["id"]: r for r in await self._tests.list_items("runs")}
        builds = await self._repo.list_builds(release["id"])
        blockers = await self._repo.list_blockers(release["id"])
        for build in builds:
            build["gates"] = self._gates(release, build, runs, blockers)
            build["signoffStatus"] = self._signoff_status(release, build)
        release["builds"] = builds
        release["blockers"] = blockers
        release["metrics"] = self._metrics(release, builds, blockers)
        release.update(self._flags(user, release))
        release["signersLocked"] = release["status"] == "Cancelled" or any(b["kind"] == "Final" for b in builds)
        return release

    # ── releases (037, 038) ────────────────────────────────────────────
    def _milestones(self, given: Any, existing: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
        by_key = {m["key"]: m for m in (existing or [])}
        if given is not None and not isinstance(given, list):
            raise ApiError(400, "milestones must be a list.")
        for m in given or []:
            if isinstance(m, dict) and m.get("key") in dict(MILESTONES):
                current = by_key.get(m["key"], {})
                by_key[m["key"]] = {
                    **current,
                    **{f: _day(m[f], f"{m['key']} {f}") for f in ("plannedDate", "actualDate") if f in m},
                }
        return [
            {
                "key": key,
                "name": name,
                "plannedDate": (by_key.get(key) or {}).get("plannedDate") or None,
                "actualDate": (by_key.get(key) or {}).get("actualDate") or None,
            }
            for key, name in MILESTONES
        ]

    def _gate_rules(self, given: Any, existing: dict[str, Any] | None) -> dict[str, Any]:
        rules = {**DEFAULT_GATE_RULES, **(existing or {})}
        if isinstance(given, dict):
            if "minPassRate" in given:
                rate = given["minPassRate"]
                if not isinstance(rate, int | float) or isinstance(rate, bool) or not 0 <= rate <= 100:
                    raise ApiError(400, "minPassRate must be a number from 0 to 100.")
                rules["minPassRate"] = rate
            if "requireNoOpenBlockers" in given:
                rules["requireNoOpenBlockers"] = bool(given["requireNoOpenBlockers"])
            if "mandatorySuiteIds" in given:
                ids = given["mandatorySuiteIds"]
                if not isinstance(ids, list) or not all(isinstance(i, str) for i in ids):
                    raise ApiError(400, "mandatorySuiteIds must be a list of suite ids.")
                rules["mandatorySuiteIds"] = list(dict.fromkeys(ids))
        return rules

    async def create_release(self, user: User, body: Any) -> dict[str, Any]:
        """Anyone signed in. The creator is the first signer; `signerIds` are
        the 1 to 4 others."""
        if not isinstance(body, dict):
            raise ApiError(400, "Body must be a JSON object.")
        version = _text(body, "version", limit=100)
        release = {
            "id": f"rel-{uuid.uuid4().hex[:12]}",
            "version": version,
            "title": _text(body, "title", required=False, limit=255),
            "type": _choice(body, "type", TYPES),
            "targetDate": _day(body.get("targetDate"), "targetDate", required=True),
            "segment": _text(body, "segment", required=False, limit=255),
            "status": _choice(body, "status", SETTABLE_STATUSES, "Planned"),
            "notes": body["notes"] if isinstance(body.get("notes"), str) else "",
            "milestones": self._milestones(body.get("milestones"), None),
            "gateRules": self._gate_rules(body.get("gateRules"), None),
            "blockerQuery": blocker_query(body.get("blockerQuery"), None),
            "createdBy": user.id,
        }
        others = await self._other_signers(body, "signerIds", user.id)
        try:
            await self._repo.create(release, [user.id, *[o.id for o in others]])
        except DuplicateVersion as exc:
            raise ApiError(409, f"A release with version {version} already exists.") from exc
        await self._audit(
            user,
            release["id"],
            "release-created",
            {"version": version, "status": release["status"], "signers": [user.name, *[o.name for o in others]]},
        )
        return await self.get_release(user, release["id"])

    async def update_release(self, user: User, release_id: str, body: Any) -> dict[str, Any]:
        """Changes only the fields sent. Creator only."""
        release = await self._release_or_404(release_id)
        self._require_creator(user, release)
        if not isinstance(body, dict):
            raise ApiError(400, "Body must be a JSON object.")
        builds = await self._repo.list_builds(release_id)
        has_final = any(b["kind"] == "Final" for b in builds)
        new = {**release}

        if "version" in body:
            new["version"] = _text(body, "version", limit=100)
            if new["version"] != release["version"] and builds:
                raise ApiError(409, "The version cannot change once a build is registered.")
        if "title" in body:
            new["title"] = _text(body, "title", required=False, limit=255)
        if "type" in body:
            new["type"] = _choice(body, "type", TYPES)
        if "targetDate" in body:
            new["targetDate"] = _day(body["targetDate"], "targetDate", required=True)
        if "segment" in body:
            new["segment"] = _text(body, "segment", required=False, limit=255)
        if "status" in body:
            if body["status"] == "Cancelled":
                raise ApiError(400, "Use the cancel action to cancel a release.")
            new["status"] = _choice(body, "status", SETTABLE_STATUSES)
        if "notes" in body:
            if not isinstance(body["notes"], str):
                raise ApiError(400, "notes must be text.")
            new["notes"] = body["notes"]
        if "milestones" in body:
            new["milestones"] = self._milestones(body["milestones"], release["milestones"])
        if "gateRules" in body:
            new["gateRules"] = self._gate_rules(body["gateRules"], release["gateRules"])
            if new["gateRules"] != release["gateRules"] and has_final:
                raise ApiError(409, "The readiness rules cannot change once a build is Final.")
        if "blockerQuery" in body:
            new["blockerQuery"] = blocker_query(body["blockerQuery"], None)

        try:
            await self._repo.update(new)
        except DuplicateVersion as exc:
            raise ApiError(409, f"A release with version {new['version']} already exists.") from exc

        edited = {
            f: {"from": release[f], "to": new[f]}
            for f in ("version", "title", "type", "targetDate", "segment")
            if release[f] != new[f]
        }
        if edited:
            await self._audit(user, release_id, "release-edited", edited)
        if release["status"] != new["status"]:
            await self._audit(user, release_id, "status-changed", {"from": release["status"], "to": new["status"]})
        if release["gateRules"] != new["gateRules"]:
            await self._audit(user, release_id, "gate-rules-changed", {"rules": new["gateRules"]})
        if release["blockerQuery"] != new["blockerQuery"]:
            await self._audit(user, release_id, "blocker-query-changed", {"query": new["blockerQuery"]})
        return await self.get_release(user, release_id)

    async def set_signers(self, user: User, release_id: str, body: Any) -> dict[str, Any]:
        """Replaces the people who sign besides the creator. Allowed until a
        build is Final; a removed signer's earlier decisions stay on record
        but stop counting, and a newly added signer must approve too."""
        release = await self._release_or_404(release_id)
        self._require_creator(user, release)
        if any(b["kind"] == "Final" for b in await self._repo.list_builds(release_id)):
            raise ApiError(409, "The signers cannot change once a build is Final.")
        others = await self._other_signers(body, "userIds", release["createdBy"])
        before = {s["userId"]: s["name"] for s in release["signers"]}
        after = {release["createdBy"]: release["createdByName"], **{o.id: o.name for o in others}}
        await self._repo.set_signers(release_id, list(after), user.id)
        if set(before) != set(after):
            await self._audit(
                user,
                release_id,
                "signers-changed",
                {
                    "added": [n for i, n in after.items() if i not in before],
                    "removed": [n for i, n in before.items() if i not in after],
                    "signers": list(after.values()),
                },
            )
        return await self.get_release(user, release_id)

    async def cancel_release(self, user: User, release_id: str, body: Any) -> dict[str, Any]:
        """The only way a release ends without being deployed. Keeps everything."""
        release = await self._release_or_404(release_id)
        self._require_creator(user, release)
        if release["status"] == "Deployed":
            raise ApiError(409, "A deployed release cannot be cancelled.")
        reason = _text(body if isinstance(body, dict) else {}, "reason")
        await self._repo.cancel(release_id, reason or "")
        await self._audit(user, release_id, "release-cancelled", {"reason": reason, "from": release["status"]})
        return await self.get_release(user, release_id)

    # ── builds (035, 039, 040) ─────────────────────────────────────────
    async def register_build(self, user: User, release_id: str, body: Any) -> dict[str, Any]:
        release = await self._release_or_404(release_id)
        self._require_creator(user, release)
        if not isinstance(body, dict):
            raise ApiError(400, "Body must be a JSON object.")
        builds = await self._repo.list_builds(release_id)
        if any(b["kind"] == "Final" for b in builds):
            raise ApiError(409, "This release already has a Final build.")
        sha256 = _text(body, "sha256")
        if not _SHA256.match(sha256 or ""):
            raise ApiError(400, "sha256 must be a 64-character hex SHA-256 checksum.")
        commit = _text(body, "commitSha", required=False)
        if commit and not _COMMIT.match(commit):
            raise ApiError(400, "commitSha must be a 7-40 character hex commit SHA.")
        artifact_url = _text(body, "artifactUrl")
        if not re.match(r"^https?://", artifact_url or ""):
            raise ApiError(400, "artifactUrl must be an http(s) URL.")
        number = max((b["number"] for b in builds), default=FIRST_RC_NUMBER - 1) + 1
        label = f"{release['version']}-RC{number}"
        build = {
            "id": f"rc{number}",
            "number": number,
            "label": label,
            "imageName": _text(body, "imageName", limit=500),
            "commitSha": commit,
            "branchTag": _text(body, "branchTag", required=False, limit=255),
            "artifactUrl": artifact_url,
            "repository": _choice(body, "repository", REPOSITORIES, "Other"),
            "sha256": (sha256 or "").lower(),
            "builtAt": _text(body, "builtAt", required=False, limit=64),
            "pipelineBuildId": _text(body, "pipelineBuildId", required=False, limit=255),
            "createdBy": user.id,
        }
        try:
            await self._repo.add_build(release_id, build)
        except DuplicateBuild as exc:
            raise ApiError(409, "Another build was registered at the same moment. Try again.") from exc
        await self._audit(
            user,
            release_id,
            "build-registered",
            {"build": label, "imageName": build["imageName"], "sha256": build["sha256"]},
        )
        return await self._build_or_404(release_id, build["id"])

    async def link_runs(self, user: User, release_id: str, build_id: str, body: Any) -> dict[str, Any]:
        """Links test runs to an RC build (042, 034)."""
        release = await self._release_or_404(release_id)
        self._require_creator(user, release)
        build = await self._build_or_404(release_id, build_id)
        if build["kind"] == "Final":
            raise ApiError(409, "This build is already Final.")
        run_ids = body.get("testRunIds") if isinstance(body, dict) else None
        if not isinstance(run_ids, list) or not all(isinstance(r, str) for r in run_ids):
            raise ApiError(400, "testRunIds must be a list of test run ids.")
        known = {r["id"] for r in await self._tests.list_items("runs")}
        missing = [r for r in run_ids if r not in known]
        if missing:
            raise ApiError(400, f"Test run not found: {', '.join(missing)}.")
        wanted = list(dict.fromkeys(run_ids))
        await self._repo.set_build_runs(release_id, build_id, wanted)
        if build["testRunIds"] != wanted:
            await self._audit(user, release_id, "test-runs-linked", {"build": build["label"], "testRunIds": wanted})
        return await self._build_or_404(release_id, build_id)

    async def override_gates(self, user: User, release_id: str, build_id: str, body: Any) -> dict[str, Any]:
        """Lets a build through failing gates, with a recorded reason (033)."""
        release = await self._release_or_404(release_id)
        self._require_signer(user, release, "override the readiness gates")
        build = await self._build_or_404(release_id, build_id)
        if build["kind"] == "Final":
            raise ApiError(409, "This build is already Final.")
        if build["gateOverride"]:
            raise ApiError(409, "The gates were already overridden for this build.")
        reason = _text(body if isinstance(body, dict) else {}, "reason")
        await self._repo.set_gate_override(release_id, build_id, user.id, reason or "", _now())
        await self._audit(user, release_id, "gates-overridden", {"build": build["label"], "reason": reason})
        return await self._build_or_404(release_id, build_id)

    # ── sign-offs (045) ────────────────────────────────────────────────
    async def sign_off(self, user: User, release_id: str, build_id: str, body: Any) -> dict[str, Any]:
        release = await self._release_or_404(release_id)
        self._require_signer(user, release, "sign off")
        build = await self._build_or_404(release_id, build_id)
        if not isinstance(body, dict):
            raise ApiError(400, "Body must be a JSON object.")
        if build["kind"] == "Final":
            raise ApiError(409, "This build is already Final.")
        decision = _choice(body, "decision", ("Approved", "Rejected"))
        comment = _text(body, "comment", required=decision == "Rejected")
        await self._repo.put_signoff(release_id, build_id, user.id, decision, comment, _now())
        await self._audit(
            user,
            release_id,
            "signed-off",
            {"build": build["label"], "decision": decision, "comment": comment},
        )
        return await self._build_or_404(release_id, build_id)

    # ── promotion (041) ────────────────────────────────────────────────
    async def promote(self, user: User, release_id: str, build_id: str) -> dict[str, Any]:
        """RC -> Final, once every gate passes (or was overridden) and every
        signer approved this build."""
        release = await self._release_or_404(release_id)
        self._require_signer(user, release, "promote a build")
        build = await self._build_or_404(release_id, build_id)
        builds = await self._repo.list_builds(release_id)
        if build["kind"] == "Final":
            raise ApiError(409, "This build is already Final.")
        if any(b["kind"] == "Final" for b in builds):
            raise ApiError(409, "This release already has a Final build.")
        runs = {r["id"]: r for r in await self._tests.list_items("runs")}
        gates = self._gates(release, build, runs, await self._repo.list_blockers(release_id))
        if not gates["ready"]:
            failing = ", ".join(c["label"] for c in gates["checks"] if not c["passed"])
            raise ApiError(409, f"Exit criteria not met: {failing}. Fix them or override the gates with a reason.")
        signoffs = self._signoff_status(release, build)
        if not signoffs["complete"]:
            waiting = ", ".join(signoffs["waitingFor"])
            raise ApiError(
                409,
                f"Sign-offs incomplete: {signoffs['approved']} of {signoffs['required']} signers approved "
                f"(waiting for {waiting}).",
            )
        await self._repo.promote(release_id, build_id, user.id, _now(), "Approved")
        await self._audit(
            user, release_id, "promoted-to-final", {"build": build["label"], "gatesOverridden": gates["overridden"]}
        )
        if release["status"] != "Approved":
            await self._audit(user, release_id, "status-changed", {"from": release["status"], "to": "Approved"})
        return await self._build_or_404(release_id, build_id)

    # ── blockers (044, 034) ────────────────────────────────────────────
    async def add_blocker(self, user: User, release_id: str, body: Any) -> dict[str, Any]:
        """A blocker entered by hand."""
        release = await self._release_or_404(release_id)
        self._require_creator(user, release)
        if not isinstance(body, dict):
            raise ApiError(400, "Body must be a JSON object.")
        blocker = {
            "id": f"b-{uuid.uuid4().hex[:12]}",
            "key": _text(body, "key", limit=255),
            "tracker": _choice(body, "tracker", ("Jira", "GitHub"), "Jira"),
            "title": _text(body, "title", required=False),
            "url": self._url(body),
            "severity": _choice(body, "severity", SEVERITIES, "Major"),
            "status": _choice(body, "status", ("Open", "Closed"), "Open"),
            "source": "manual",
            "syncNote": None,
            "syncedAt": None,
            "createdBy": user.name,
        }
        try:
            await self._repo.put_blocker(release_id, blocker)
        except DuplicateBlocker as exc:
            raise ApiError(409, f"{blocker['key']} is already listed on this release.") from exc
        await self._audit(user, release_id, "blocker-logged", {"key": blocker["key"], "severity": blocker["severity"]})
        return (await self._repo.get_blocker(release_id, blocker["id"])) or blocker

    @staticmethod
    def _url(body: dict[str, Any]) -> str | None:
        url = _text(body, "url", required=False)
        if url and not re.match(r"^https?://", url):
            raise ApiError(400, "url must be an http(s) URL.")
        return url

    async def update_blocker(self, user: User, release_id: str, blocker_id: str, body: Any) -> dict[str, Any]:
        release = await self._release_or_404(release_id)
        self._require_creator(user, release)
        existing = await self._repo.get_blocker(release_id, blocker_id)
        if existing is None:
            raise ApiError(404, "Blocker not found.")
        if not isinstance(body, dict):
            raise ApiError(400, "Body must be a JSON object.")
        if existing["source"] != "manual":
            raise ApiError(409, "This issue is read from the tracker, so it can only be removed.")
        blocker = {**existing}
        if "key" in body:
            blocker["key"] = _text(body, "key", limit=255)
        if "tracker" in body:
            blocker["tracker"] = _choice(body, "tracker", ("Jira", "GitHub"))
        if "title" in body:
            blocker["title"] = _text(body, "title", required=False)
        if "url" in body:
            blocker["url"] = self._url(body)
        if "severity" in body:
            blocker["severity"] = _choice(body, "severity", SEVERITIES)
        if "status" in body:
            blocker["status"] = _choice(body, "status", ("Open", "Closed"))
        try:
            await self._repo.put_blocker(release_id, blocker)
        except DuplicateBlocker as exc:
            raise ApiError(409, f"{blocker['key']} is already listed on this release.") from exc
        if existing["status"] != blocker["status"]:
            await self._audit(user, release_id, "blocker-" + blocker["status"].lower(), {"key": blocker["key"]})
        return (await self._repo.get_blocker(release_id, blocker_id)) or blocker

    async def delete_blocker(self, user: User, release_id: str, blocker_id: str) -> None:
        release = await self._release_or_404(release_id)
        self._require_creator(user, release)
        blocker = await self._repo.get_blocker(release_id, blocker_id)
        if blocker is None:
            raise ApiError(404, "Blocker not found.")
        await self._repo.delete_blocker(release_id, blocker_id)
        await self._audit(user, release_id, "blocker-removed", {"key": blocker["key"]})

    # ── blockers from Jira / GitHub (044) ──────────────────────────────
    def _require_trackers(self) -> TrackerService:
        if self._trackers is None:
            raise ApiError(501, "Issue trackers are not available on this server.")
        return self._trackers

    async def lookup_blocker(self, user: User, release_id: str, body: Any) -> dict[str, Any]:
        """Links one issue by key; its title, link, severity and status are read
        from the tracker, and kept current by each sync."""
        release = await self._release_or_404(release_id)
        self._require_creator(user, release)
        trackers = self._require_trackers()
        if not isinstance(body, dict):
            raise ApiError(400, "Body must be a JSON object.")
        tracker = _choice(body, "tracker", ("Jira", "GitHub"), "Jira")
        info = await trackers.issue(tracker, _text(body, "key") or "")
        blockers = await self._repo.list_blockers(release_id)
        existing = next((b for b in blockers if b["tracker"] == tracker and b["key"] == info["key"]), None)
        blocker = {
            **(existing or {"id": f"b-{uuid.uuid4().hex[:12]}", "createdBy": user.name}),
            **info,
            "source": existing["source"] if existing and existing["source"] == "synced" else "linked",
            "syncedAt": _now(),
            "syncNote": None,
        }
        await self._repo.put_blocker(release_id, blocker)
        if existing is None:
            await self._audit(
                user, release_id, "blocker-logged", {"key": blocker["key"], "severity": blocker["severity"]}
            )
        return (await self._repo.get_blocker(release_id, blocker["id"])) or blocker

    async def sync_blockers(self, user: User, release_id: str) -> dict[str, Any]:
        """Brings in the issues the release's blocker query matches and refreshes
        every linked issue. An issue that no longer matches the query is closed
        here (it is no longer marked as a blocker). One audit entry per sync
        that changed anything."""
        release = await self._release_or_404(release_id)
        trackers = self._require_trackers()
        query = release.get("blockerQuery") or {}
        blockers = await self._repo.list_blockers(release_id)
        by_key = {(b["tracker"], b["key"]): b for b in blockers}
        added: list[str] = []
        closed: list[str] = []
        reopened: list[str] = []
        error = None
        try:
            matched = await trackers.search(query) if query else []
            seen = set()
            for info in matched:
                seen.add((info["tracker"], info["key"]))
                old = by_key.get((info["tracker"], info["key"]))
                if old is None:
                    added.append(info["key"])
                elif old["status"] != info["status"]:
                    (closed if info["status"] == "Closed" else reopened).append(info["key"])
                new = {
                    **(old or {"id": f"b-{uuid.uuid4().hex[:12]}", "createdBy": user.name}),
                    **info,
                    "source": "synced" if (old or {}).get("source") != "linked" else "linked",
                    "syncedAt": _now(),
                    "syncNote": None,
                }
                await self._repo.put_blocker(release_id, new)
            for (tracker, key), old in by_key.items():
                if (tracker, key) in seen or old["source"] not in ("synced", "linked"):
                    continue
                note = None
                try:
                    info = await trackers.issue(tracker, key)
                except ApiError as exc:
                    if exc.status != 404:
                        raise
                    info = {
                        **{k: old.get(k) for k in ("tracker", "key", "title", "url", "severity")},
                        "status": "Closed",
                    }
                    note = "Not found in the tracker any more."
                new = {**old, **info, "syncedAt": _now(), "syncNote": note}
                if old["source"] == "synced" and info["status"] == "Open":
                    new["status"] = "Closed"
                    new["syncNote"] = "No longer matches the blocker query."
                if old["status"] != new["status"]:
                    (closed if new["status"] == "Closed" else reopened).append(key)
                await self._repo.put_blocker(release_id, new)
        except ApiError as exc:
            error = exc.message
        result = {"at": _now(), "added": added, "closed": closed, "reopened": reopened, "error": error}
        await self._repo.set_blocker_sync(release_id, result)
        if added or closed or reopened:
            await self._audit(
                user, release_id, "blockers-synced", {"added": added, "closed": closed, "reopened": reopened}
            )
        return result

    async def sync_blockers_now(self, user: User, release_id: str) -> dict[str, Any]:
        """The "Sync now" button: the creator."""
        release = await self._release_or_404(release_id)
        self._require_creator(user, release)
        return await self.sync_blockers(user, release_id)

    SYNC_EVERY_S = 300

    async def sync_all_due(self, now: float | None = None) -> int:
        """The background worker's step: every SYNC_EVERY_S, sync each active
        release that has a blocker query or linked issues."""
        if self._trackers is None or not any((await self._trackers.configured()).values()):
            return 0
        now = time.time() if now is None else now
        synced = 0
        for release in await self._repo.list_all():
            if release["status"] in ("Deployed", "Cancelled"):
                continue
            if not release.get("blockerQuery") and not any(
                b["source"] in ("synced", "linked") for b in await self._repo.list_blockers(release["id"])
            ):
                continue
            if not await self._repo.claim_sync(release["id"], int(now // self.SYNC_EVERY_S)):
                continue
            await self.sync_blockers(TRACKER_SYNC_USER, release["id"])
            synced += 1
        return synced
