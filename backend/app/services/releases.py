"""Release management (DDS-SRS-033 - 046).

- Release managers and admins create and edit releases, register builds,
  link test runs, log blockers, override gates and promote. Everyone signed
  in can read. A sign-off can only be given by the user assigned to that
  role on the release (045).
- Readiness gates (043) are evaluated here, from the test runs linked to a
  build (042) and the release's open blockers (044), on every read.
- Every change that matters is appended to the release's audit log (046):
  server-written, never edited, each entry hash-chained to the one before,
  so any tampering with the stored log is detectable.
"""

import hashlib
import json
import re
import time
import uuid
from dataclasses import replace
from datetime import UTC, datetime
from typing import Any

from app.core.errors import ApiError
from app.models.user import User
from app.repositories.releases import ReleaseStore
from app.repositories.test_management import TestManagementStore
from app.services.permissions import is_admin
from app.services.trackers import TrackerService, blocker_query

TYPES = ("Major", "Minor", "Patch", "Hotfix")
STATUSES = ("Planned", "In Progress", "RC Frozen", "Approved", "Deployed", "Cancelled")
MILESTONES = (
    ("code-freeze", "Code Freeze"),
    ("rc-build", "RC Build Generation"),
    ("qa-regression", "QA Regression Window"),
    ("final-signoff", "Final Sign-off"),
    ("ga", "General Availability (GA)"),
)
DEFAULT_SIGNOFF_ROLES = ("QA Lead", "Dev Lead", "Product Owner")
SEVERITIES = ("Blocker", "Critical", "Major", "Minor")
REPOSITORIES = ("Artifactory", "Nexus", "AWS ECR", "Other")
DEFAULT_GATE_RULES = {"minPassRate": 98, "requireNoOpenBlockers": True, "mandatorySuiteIds": []}
FIRST_RC_NUMBER = 100  # v2.4.0-RC100, -RC101, ... (DDS-SRS-039)
_SHA256 = re.compile(r"^[0-9a-fA-F]{64}$")
_COMMIT = re.compile(r"^[0-9a-fA-F]{7,40}$")
_GENESIS = "0" * 64


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


# Who the audit log names for the background sync of Jira / GitHub blockers.
TRACKER_SYNC_USER = User("system", "Tracker sync", "", None, None, "system", None, None)


def can_manage(user: User) -> bool:
    return is_admin(user) or user.role == "release-manager"


def _require_manager(user: User) -> None:
    if not can_manage(user):
        raise ApiError(403, "Only release managers and admins can change releases.")


def _text(body: dict[str, Any], field: str, required: bool = True) -> str | None:
    value = body.get(field)
    if value is None or (isinstance(value, str) and not value.strip()):
        if required:
            raise ApiError(400, f"{field} is required.")
        return None
    if not isinstance(value, str):
        raise ApiError(400, f"{field} must be text.")
    return value.strip()


def _choice(body: dict[str, Any], field: str, options: tuple[str, ...], default: str | None = None) -> str:
    value = body.get(field, default)
    if value not in options:
        raise ApiError(400, f"{field} must be one of {', '.join(options)}.")
    return value  # type: ignore[return-value]


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
    def __init__(self, store: ReleaseStore, tests: TestManagementStore, trackers: TrackerService | None = None) -> None:
        self._store = store
        self._tests = tests
        self._trackers = trackers

    # ── audit log (046) ────────────────────────────────────────────────
    async def _audit(self, user: User, release_id: str, action: str, details: dict[str, Any]) -> None:
        tail = await self._store.audit_tail(release_id)
        entry = {
            "seq": (tail["seq"] + 1) if tail else 1,
            "at": _now(),
            "actor": user.name,
            "actorRole": user.role,
            "action": action,
            "details": details,
            "prevHash": tail["hash"] if tail else _GENESIS,
        }
        entry["hash"] = _entry_hash(entry)
        await self._store.append_audit(release_id, entry)

    async def audit_log(self, release_id: str) -> dict[str, Any]:
        entries = await self._store.audit(release_id)
        return {"entries": entries, "intact": verify_chain(entries)}

    # ── reads ──────────────────────────────────────────────────────────
    async def _release_or_404(self, release_id: str) -> dict[str, Any]:
        release = await self._store.get_release(release_id)
        if release is None:
            raise ApiError(404, "Release not found.")
        return release

    async def _build_or_404(self, release_id: str, build_id: str) -> dict[str, Any]:
        build = await self._store.get_build(release_id, build_id)
        if build is None:
            raise ApiError(404, "Build not found.")
        return build

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

    def _signoff_status(self, release: dict[str, Any], build: dict[str, Any]) -> dict[str, Any]:
        roles = release.get("signoffRoles") or []
        given = build.get("signoffs") or {}
        approved = [r["role"] for r in roles if (given.get(r["role"]) or {}).get("decision") == "Approved"]
        return {
            "required": len(roles),
            "approved": len(approved),
            "complete": bool(roles) and len(approved) == len(roles),
        }

    async def snapshot(self, user: User) -> dict[str, Any]:
        """Every release with its builds (gates evaluated), blockers and metrics (036)."""
        runs = {r["id"]: r for r in await self._tests.list_items("runs")}
        releases = []
        for release in await self._store.list_releases():
            builds = await self._store.list_builds(release["id"])
            blockers = await self._store.list_blockers(release["id"])
            for build in builds:
                build["gates"] = self._gates(release, build, runs, blockers)
                build["signoffStatus"] = self._signoff_status(release, build)
            milestones = release.get("milestones") or []
            latest = builds[-1] if builds else None
            release["builds"] = builds
            release["blockers"] = blockers
            release["metrics"] = {
                "milestonesDone": sum(1 for m in milestones if m.get("actualDate")),
                "milestonesTotal": len(milestones),
                "openBlockers": sum(1 for b in blockers if b.get("status") == "Open"),
                "builds": len(builds),
                "latestBuild": latest["label"] if latest else None,
                "latestPassRate": latest["gates"]["passRate"] if latest else None,
                "latestCoverage": latest["gates"]["coverage"] if latest else None,
                "finalBuild": next((b["label"] for b in builds if b.get("kind") == "Final"), None),
            }
            releases.append(release)
        return {"releases": releases, "seeded": await self._store.is_seeded(), "canManage": can_manage(user)}

    # ── releases (037, 038) ────────────────────────────────────────────
    def _milestones(self, given: Any, existing: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
        by_key = {m["key"]: m for m in (existing or [])}
        if isinstance(given, list):
            for m in given:
                if isinstance(m, dict) and m.get("key") in dict(MILESTONES):
                    by_key[m["key"]] = {**by_key.get(m["key"], {}), **m}
        return [
            {
                "key": key,
                "name": name,
                "plannedDate": (by_key.get(key) or {}).get("plannedDate") or None,
                "actualDate": (by_key.get(key) or {}).get("actualDate") or None,
            }
            for key, name in MILESTONES
        ]

    def _signoff_roles(self, given: Any, existing: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
        if not isinstance(given, list):
            return existing or [{"role": r, "userName": None} for r in DEFAULT_SIGNOFF_ROLES]
        roles = []
        for r in given:
            if isinstance(r, dict) and isinstance(r.get("role"), str) and r["role"].strip():
                user_name = r.get("userName")
                roles.append(
                    {
                        "role": r["role"].strip(),
                        "userName": user_name.strip() if isinstance(user_name, str) and user_name.strip() else None,
                    }
                )
        if len({r["role"] for r in roles}) != len(roles):
            raise ApiError(400, "Each sign-off role can only be listed once.")
        return roles

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

    async def save_release(self, user: User, release_id: str, body: Any) -> dict[str, Any]:
        _require_manager(user)
        if not isinstance(body, dict):
            raise ApiError(400, "Body must be a JSON object.")
        existing = await self._store.get_release(release_id)
        release = {
            **(existing or {}),
            "id": release_id,
            "version": _text(body, "version"),
            "title": _text(body, "title", required=False),
            "type": _choice(body, "type", TYPES),
            "targetDate": _text(body, "targetDate"),
            "segment": _text(body, "segment", required=False),
            "status": _choice(body, "status", STATUSES, "Planned"),
            "milestones": self._milestones(body.get("milestones"), (existing or {}).get("milestones")),
            "signoffRoles": self._signoff_roles(body.get("signoffRoles"), (existing or {}).get("signoffRoles")),
            "gateRules": self._gate_rules(body.get("gateRules"), (existing or {}).get("gateRules")),
            "notes": body.get("notes") if isinstance(body.get("notes"), str) else (existing or {}).get("notes", ""),
            "documents": [
                d for d in body.get("documents", (existing or {}).get("documents", [])) if isinstance(d, dict)
            ],
            # Which Jira / GitHub issues are this release's blockers (044); null clears it.
            "blockerQuery": (
                blocker_query(body["blockerQuery"], None)
                if "blockerQuery" in body and body["blockerQuery"] is not None
                else None
                if "blockerQuery" in body
                else (existing or {}).get("blockerQuery")
            ),
            "createdBy": (existing or {}).get("createdBy", user.name),
            "createdAt": (existing or {}).get("createdAt", _now()),
            "updatedAt": _now(),
        }
        await self._store.put_release(release)
        if existing is None:
            await self._audit(
                user, release_id, "release-created", {"version": release["version"], "status": release["status"]}
            )
        elif existing.get("status") != release["status"]:
            await self._audit(
                user, release_id, "status-changed", {"from": existing.get("status"), "to": release["status"]}
            )
        if existing is not None and existing.get("gateRules") != release["gateRules"]:
            await self._audit(user, release_id, "gate-rules-changed", {"rules": release["gateRules"]})
        if existing is not None and existing.get("signoffRoles") != release["signoffRoles"]:
            await self._audit(user, release_id, "signoff-roles-changed", {"roles": release["signoffRoles"]})
        if (existing or {}).get("blockerQuery") != release["blockerQuery"] and (existing or release["blockerQuery"]):
            await self._audit(user, release_id, "blocker-query-changed", {"query": release["blockerQuery"]})
        return release

    async def delete_release(self, user: User, release_id: str) -> None:
        _require_manager(user)
        release = await self._release_or_404(release_id)
        await self._audit(user, release_id, "release-deleted", {"version": release.get("version")})
        await self._store.delete_release(release_id)

    # ── builds (035, 039, 040) ─────────────────────────────────────────
    async def register_build(self, user: User, release_id: str, body: Any) -> dict[str, Any]:
        _require_manager(user)
        release = await self._release_or_404(release_id)
        if not isinstance(body, dict):
            raise ApiError(400, "Body must be a JSON object.")
        sha256 = _text(body, "sha256")
        if not _SHA256.match(sha256 or ""):
            raise ApiError(400, "sha256 must be a 64-character hex SHA-256 checksum.")
        commit = _text(body, "commitSha", required=False)
        if commit and not _COMMIT.match(commit):
            raise ApiError(400, "commitSha must be a 7-40 character hex commit SHA.")
        artifact_url = _text(body, "artifactUrl")
        if not re.match(r"^https?://", artifact_url or ""):
            raise ApiError(400, "artifactUrl must be an http(s) URL.")
        builds = await self._store.list_builds(release_id)
        number = FIRST_RC_NUMBER + sum(1 for b in builds if b.get("number") is not None)
        label = f"{release['version']}-RC{number}"
        build = {
            "id": f"rc{number}",
            "number": number,
            "label": label,
            "kind": "RC",
            "imageName": _text(body, "imageName"),
            "commitSha": commit,
            "branchTag": _text(body, "branchTag", required=False),
            "artifactUrl": artifact_url,
            "repository": _choice(body, "repository", REPOSITORIES, "Other"),
            "sha256": (sha256 or "").lower(),
            "builtAt": _text(body, "builtAt", required=False),
            "pipelineBuildId": _text(body, "pipelineBuildId", required=False),
            "testRunIds": [],
            "signoffs": {},
            "createdBy": user.name,
            "createdAt": _now(),
        }
        await self._store.put_build(release_id, build)
        await self._audit(
            user,
            release_id,
            "build-registered",
            {"build": label, "imageName": build["imageName"], "sha256": build["sha256"]},
        )
        return build

    async def link_runs(self, user: User, release_id: str, build_id: str, body: Any) -> dict[str, Any]:
        """Links test runs to an RC build (042, 034)."""
        _require_manager(user)
        await self._release_or_404(release_id)
        build = await self._build_or_404(release_id, build_id)
        run_ids = body.get("testRunIds") if isinstance(body, dict) else None
        if not isinstance(run_ids, list) or not all(isinstance(r, str) for r in run_ids):
            raise ApiError(400, "testRunIds must be a list of test run ids.")
        known = {r["id"] for r in await self._tests.list_items("runs")}
        missing = [r for r in run_ids if r not in known]
        if missing:
            raise ApiError(400, f"Test run not found: {', '.join(missing)}.")
        before = build.get("testRunIds", [])
        build["testRunIds"] = list(dict.fromkeys(run_ids))
        await self._store.put_build(release_id, build)
        if before != build["testRunIds"]:
            await self._audit(
                user, release_id, "test-runs-linked", {"build": build["label"], "testRunIds": build["testRunIds"]}
            )
        return build

    async def override_gates(self, user: User, release_id: str, build_id: str, body: Any) -> dict[str, Any]:
        """Lets a build through failing gates, with a recorded reason (033)."""
        _require_manager(user)
        await self._release_or_404(release_id)
        build = await self._build_or_404(release_id, build_id)
        reason = _text(body if isinstance(body, dict) else {}, "reason")
        build["gateOverride"] = {"by": user.name, "reason": reason, "at": _now()}
        await self._store.put_build(release_id, build)
        await self._audit(user, release_id, "gates-overridden", {"build": build["label"], "reason": reason})
        return build

    # ── sign-offs (045) ────────────────────────────────────────────────
    async def sign_off(self, user: User, release_id: str, build_id: str, body: Any) -> dict[str, Any]:
        release = await self._release_or_404(release_id)
        build = await self._build_or_404(release_id, build_id)
        if not isinstance(body, dict):
            raise ApiError(400, "Body must be a JSON object.")
        role = _text(body, "role")
        decision = _choice(body, "decision", ("Approved", "Rejected"))
        assigned = next((r for r in release.get("signoffRoles") or [] if r["role"] == role), None)
        if assigned is None:
            raise ApiError(400, f"{role} is not a sign-off role on this release.")
        if assigned.get("userName") != user.name:
            raise ApiError(403, f"Only {assigned.get('userName') or 'the assigned user'} can sign off as {role}.")
        if build.get("kind") == "Final":
            raise ApiError(409, "This build is already Final.")
        comment = _text(body, "comment", required=decision == "Rejected")
        build.setdefault("signoffs", {})[role] = {
            "userName": user.name,
            "decision": decision,
            "comment": comment,
            "at": _now(),
        }
        await self._store.put_build(release_id, build)
        await self._audit(
            user,
            release_id,
            "signed-off",
            {"build": build["label"], "role": role, "decision": decision, "comment": comment},
        )
        return build

    # ── promotion (041) ────────────────────────────────────────────────
    async def promote(self, user: User, release_id: str, build_id: str) -> dict[str, Any]:
        """RC -> Final, once every gate passes (or was overridden) and every
        required sign-off approved this build."""
        _require_manager(user)
        release = await self._release_or_404(release_id)
        build = await self._build_or_404(release_id, build_id)
        builds = await self._store.list_builds(release_id)
        if build.get("kind") == "Final":
            raise ApiError(409, "This build is already Final.")
        if any(b.get("kind") == "Final" for b in builds):
            raise ApiError(409, "This release already has a Final build.")
        runs = {r["id"]: r for r in await self._tests.list_items("runs")}
        gates = self._gates(release, build, runs, await self._store.list_blockers(release_id))
        if not gates["ready"]:
            failing = ", ".join(c["label"] for c in gates["checks"] if not c["passed"])
            raise ApiError(409, f"Exit criteria not met: {failing}. Fix them or override the gates with a reason.")
        signoffs = self._signoff_status(release, build)
        if not signoffs["complete"]:
            raise ApiError(
                409, f"Sign-offs incomplete: {signoffs['approved']} of {signoffs['required']} roles approved."
            )
        build.update({"kind": "Final", "promotedBy": user.name, "promotedAt": _now()})
        await self._store.put_build(release_id, build)
        old_status = release.get("status")
        release.update({"status": "Approved", "updatedAt": _now()})
        await self._store.put_release(release)
        await self._audit(
            user, release_id, "promoted-to-final", {"build": build["label"], "gatesOverridden": gates["overridden"]}
        )
        if old_status != "Approved":
            await self._audit(user, release_id, "status-changed", {"from": old_status, "to": "Approved"})
        return build

    # ── blockers (044, 034) ────────────────────────────────────────────
    async def save_blocker(self, user: User, release_id: str, blocker_id: str, body: Any) -> dict[str, Any]:
        _require_manager(user)
        await self._release_or_404(release_id)
        if not isinstance(body, dict):
            raise ApiError(400, "Body must be a JSON object.")
        url = _text(body, "url", required=False)
        if url and not re.match(r"^https?://", url):
            raise ApiError(400, "url must be an http(s) URL.")
        existing = await self._store.get_blocker(release_id, blocker_id)
        blocker = {
            "id": blocker_id,
            "key": _text(body, "key"),
            "tracker": _choice(body, "tracker", ("Jira", "GitHub"), "Jira"),
            "title": _text(body, "title", required=False),
            "url": url,
            "severity": _choice(body, "severity", SEVERITIES, "Major"),
            "status": _choice(body, "status", ("Open", "Closed"), "Open"),
            "createdBy": (existing or {}).get("createdBy", user.name),
            "updatedAt": _now(),
        }
        await self._store.put_blocker(release_id, blocker)
        if existing is None:
            await self._audit(
                user, release_id, "blocker-logged", {"key": blocker["key"], "severity": blocker["severity"]}
            )
        elif existing.get("status") != blocker["status"]:
            await self._audit(user, release_id, "blocker-" + blocker["status"].lower(), {"key": blocker["key"]})
        return blocker

    async def delete_blocker(self, user: User, release_id: str, blocker_id: str) -> None:
        _require_manager(user)
        blocker = await self._store.get_blocker(release_id, blocker_id)
        if blocker is None:
            raise ApiError(404, "Blocker not found.")
        await self._store.delete_blocker(release_id, blocker_id)
        await self._audit(user, release_id, "blocker-removed", {"key": blocker["key"]})

    # ── blockers from Jira / GitHub (044) ──────────────────────────────
    def _require_trackers(self) -> TrackerService:
        if self._trackers is None:
            raise ApiError(501, "Issue trackers are not available on this server.")
        return self._trackers

    async def lookup_blocker(self, user: User, release_id: str, body: Any) -> dict[str, Any]:
        """Links one issue by key; its title, link, severity and status are read
        from the tracker, and kept current by each sync."""
        _require_manager(user)
        await self._release_or_404(release_id)
        trackers = self._require_trackers()
        if not isinstance(body, dict):
            raise ApiError(400, "Body must be a JSON object.")
        tracker = _choice(body, "tracker", ("Jira", "GitHub"), "Jira")
        info = await trackers.issue(tracker, _text(body, "key") or "")
        blockers = await self._store.list_blockers(release_id)
        existing = next((b for b in blockers if b.get("tracker") == tracker and b.get("key") == info["key"]), None)
        blocker = {
            **(existing or {"id": f"b-{uuid.uuid4().hex[:12]}", "createdBy": user.name}),
            **info,
            "source": (existing or {}).get("source") if (existing or {}).get("source") == "synced" else "linked",
            "syncedAt": _now(),
            "updatedAt": _now(),
        }
        blocker.pop("syncNote", None)
        await self._store.put_blocker(release_id, blocker)
        if existing is None:
            await self._audit(
                user, release_id, "blocker-logged", {"key": blocker["key"], "severity": blocker["severity"]}
            )
        return blocker

    async def sync_blockers(self, user: User, release_id: str) -> dict[str, Any]:
        """Brings in the issues the release's blocker query matches and refreshes
        every linked issue. An issue that no longer matches the query is closed
        here (it is no longer marked as a blocker). One audit entry per sync
        that changed anything."""
        release = await self._release_or_404(release_id)
        trackers = self._require_trackers()
        query = release.get("blockerQuery") or {}
        blockers = await self._store.list_blockers(release_id)
        by_key = {(b.get("tracker"), b.get("key")): b for b in blockers}
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
                elif old.get("status") != info["status"]:
                    (closed if info["status"] == "Closed" else reopened).append(info["key"])
                new = {
                    **(old or {"id": f"b-{uuid.uuid4().hex[:12]}", "createdBy": user.name}),
                    **info,
                    "source": "synced" if (old or {}).get("source") != "linked" else "linked",
                    "syncedAt": _now(),
                    "updatedAt": _now(),
                }
                new.pop("syncNote", None)
                if new != old:
                    await self._store.put_blocker(release_id, new)
            for (tracker, key), old in by_key.items():
                if (tracker, key) in seen or old.get("source") not in ("synced", "linked"):
                    continue
                try:
                    info = await trackers.issue(tracker, key)
                except ApiError as exc:
                    if exc.status != 404:
                        raise
                    info = {
                        **{k: old.get(k) for k in ("tracker", "key", "title", "url", "severity")},
                        "status": "Closed",
                    }
                    old = {**old, "syncNote": "Not found in the tracker any more."}
                new = {**old, **info, "syncedAt": _now(), "updatedAt": _now()}
                if old.get("source") == "synced" and info["status"] == "Open":
                    new["status"] = "Closed"
                    new["syncNote"] = "No longer matches the blocker query."
                if old.get("status") != new["status"]:
                    (closed if new["status"] == "Closed" else reopened).append(key)
                if new != old:
                    await self._store.put_blocker(release_id, new)
        except ApiError as exc:
            error = exc.message
        result = {"at": _now(), "added": added, "closed": closed, "reopened": reopened, "error": error}
        await self._store.put_release({**release, "blockerSync": result})
        if added or closed or reopened:
            await self._audit(
                user, release_id, "blockers-synced", {"added": added, "closed": closed, "reopened": reopened}
            )
        return result

    async def sync_blockers_now(self, user: User, release_id: str) -> dict[str, Any]:
        """The "Sync now" button: release managers and admins."""
        _require_manager(user)
        return await self.sync_blockers(user, release_id)

    SYNC_EVERY_S = 300

    async def sync_all_due(self, now: float | None = None) -> int:
        """The background worker's step: every SYNC_EVERY_S, sync each active
        release that has a blocker query or linked issues."""
        if self._trackers is None or not any((await self._trackers.configured()).values()):
            return 0
        now = time.time() if now is None else now
        synced = 0
        for release in await self._store.list_releases():
            if release.get("status") in ("Deployed", "Cancelled"):
                continue
            if not release.get("blockerQuery") and not any(
                b.get("source") in ("synced", "linked") for b in await self._store.list_blockers(release["id"])
            ):
                continue
            if not await self._store.claim_sync(release["id"], int(now // self.SYNC_EVERY_S), self.SYNC_EVERY_S):
                continue
            await self.sync_blockers(TRACKER_SYNC_USER, release["id"])
            synced += 1
        return synced

    # ── sample data ────────────────────────────────────────────────────
    async def seed(self, user: User, body: Any) -> dict[str, Any]:
        items = body.get("releases") if isinstance(body, dict) else None
        if not isinstance(items, list):
            raise ApiError(400, "Body must have a releases array.")
        if not await self._store.claim_seed():
            raise ApiError(409, "Sample data has already been loaded.")
        for item in items:
            if not isinstance(item, dict) or not isinstance(item.get("id"), str):
                continue
            # Sample data is written as the seeding user, whatever their role.
            seeder = replace(user, role="admin")
            await self.save_release(seeder, item["id"], item)
            for blocker in item.get("blockers") or []:
                if isinstance(blocker, dict) and isinstance(blocker.get("id"), str):
                    await self.save_blocker(seeder, item["id"], blocker["id"], blocker)
        return await self.snapshot(user)
