"""Release storage in memory: the same rules the Postgres tables enforce
(unique version, one Final build, one decision per person per build)."""

import copy
from collections.abc import Callable
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from app.repositories.base import iso_z
from app.repositories.releases import DuplicateBlocker, DuplicateBuild, DuplicateVersion

if TYPE_CHECKING:
    from app.repositories.memory import MemoryStore

MILESTONES = (
    ("code-freeze", "Code Freeze"),
    ("rc-build", "RC Build Generation"),
    ("qa-regression", "QA Regression Window"),
    ("final-signoff", "Final Sign-off"),
    ("ga", "General Availability (GA)"),
)


def _version_key(version: str) -> str:
    return version.strip().lower()


class MemoryReleaseRepository:
    def __init__(self, store: "MemoryStore") -> None:
        self._store = store
        self._releases: dict[str, dict[str, Any]] = {}
        self._signers: dict[str, list[str]] = {}
        self._builds: dict[str, dict[str, dict[str, Any]]] = {}
        self._signoffs: dict[tuple[str, str], dict[str, dict[str, Any]]] = {}
        self._blockers: dict[str, dict[str, dict[str, Any]]] = {}
        self._audit: dict[str, list[dict[str, Any]]] = {}
        self._audit_written: list[tuple[str, int]] = []  # (release id, index), in write order
        self._sync_slots: dict[str, int] = {}
        self._order = 0

    # ── helpers ───────────────────────────────────────────────────────
    def _name(self, user_id: str | None) -> str | None:
        stored = self._store.users.get(user_id) if user_id else None
        return stored.user.name if stored else None

    def _signer_rows(self, release_id: str) -> list[dict[str, Any]]:
        rows = []
        for user_id in self._signers.get(release_id, []):
            user = self._store.users[user_id].user
            rows.append(
                {"userId": user.id, "name": user.name, "designation": user.designation, "department": user.department}
            )
        return rows

    def _view(self, release_id: str) -> dict[str, Any]:
        release = copy.deepcopy(self._releases[release_id])
        release.pop("_order", None)
        release["signers"] = self._signer_rows(release_id)
        release["createdByName"] = self._name(release["createdBy"])
        return release

    def _check_version(self, release_id: str, version: str) -> None:
        for other_id, other in self._releases.items():
            if other_id != release_id and _version_key(other["version"]) == _version_key(version):
                raise DuplicateVersion(version)

    def _build_view(self, release_id: str, build: dict[str, Any]) -> dict[str, Any]:
        view = copy.deepcopy(build)
        override = view.pop("_override", None)
        view["gateOverride"] = {"by": self._name(override["byId"]), **override} if override else None
        view["promotedBy"] = self._name(view.get("promotedById"))
        view["createdByName"] = self._name(view.get("createdBy"))
        view["signoffs"] = {
            uid: {**s, "userName": self._name(uid)}
            for uid, s in copy.deepcopy(self._signoffs.get((release_id, build["id"]), {})).items()
        }
        return view

    # ── releases ──────────────────────────────────────────────────────
    async def create(self, release: dict[str, Any], signer_ids: list[str]) -> None:
        self._check_version(release["id"], release["version"])
        self._order += 1
        stored = copy.deepcopy(release)
        stored["_order"] = self._order
        given = {m["key"]: m for m in stored.get("milestones") or []}
        stored["milestones"] = [
            {
                "key": key,
                "name": name,
                "plannedDate": (given.get(key) or {}).get("plannedDate"),
                "actualDate": (given.get(key) or {}).get("actualDate"),
            }
            for key, name in MILESTONES
        ]
        now = iso_z(datetime.now(UTC))
        stored.update({"createdAt": now, "updatedAt": now})
        stored.setdefault("blockerSync", None)
        stored.setdefault("cancelledReason", None)
        stored.setdefault("cancelledAt", None)
        self._releases[release["id"]] = stored
        self._signers[release["id"]] = list(signer_ids)
        self._builds[release["id"]] = {}
        self._blockers[release["id"]] = {}
        self._audit[release["id"]] = []

    async def get(self, release_id: str) -> dict[str, Any] | None:
        return self._view(release_id) if release_id in self._releases else None

    async def list_all(self) -> list[dict[str, Any]]:
        ordered = sorted(self._releases, key=lambda r: self._releases[r]["_order"])
        return [self._view(r) for r in ordered]

    async def update(self, release: dict[str, Any]) -> None:
        self._check_version(release["id"], release["version"])
        current = self._releases[release["id"]]
        keep = {
            k: current[k] for k in ("_order", "blockerSync", "cancelledReason", "cancelledAt", "createdBy", "createdAt")
        }
        stored = copy.deepcopy(release)
        for key in ("signers", "createdByName"):
            stored.pop(key, None)
        stored["updatedAt"] = iso_z(datetime.now(UTC))
        self._releases[release["id"]] = {**stored, **keep}

    async def cancel(self, release_id: str, reason: str) -> None:
        self._releases[release_id].update(
            {"status": "Cancelled", "cancelledReason": reason, "cancelledAt": iso_z(datetime.now(UTC))}
        )

    async def set_signers(self, release_id: str, signer_ids: list[str], added_by: str) -> None:
        self._signers[release_id] = list(signer_ids)

    async def set_blocker_sync(self, release_id: str, result: dict[str, Any]) -> None:
        self._releases[release_id]["blockerSync"] = copy.deepcopy(result)

    async def claim_sync(self, release_id: str, slot: int) -> bool:
        if self._sync_slots.get(release_id, -1) >= slot:
            return False
        self._sync_slots[release_id] = slot
        return True

    # ── builds ────────────────────────────────────────────────────────
    async def list_builds(self, release_id: str) -> list[dict[str, Any]]:
        builds = sorted(self._builds.get(release_id, {}).values(), key=lambda b: b["number"])
        return [self._build_view(release_id, b) for b in builds]

    async def get_build(self, release_id: str, build_id: str) -> dict[str, Any] | None:
        build = self._builds.get(release_id, {}).get(build_id)
        return self._build_view(release_id, build) if build else None

    async def add_build(self, release_id: str, build: dict[str, Any]) -> None:
        if any(b["number"] == build["number"] for b in self._builds[release_id].values()):
            raise DuplicateBuild(build["number"])
        stored = copy.deepcopy(build)
        for key in ("signoffs", "gateOverride", "promotedBy", "createdByName"):
            stored.pop(key, None)
        stored["kind"] = "RC"
        stored["createdAt"] = iso_z(datetime.now(UTC))
        stored.setdefault("testRunIds", [])
        self._builds[release_id][build["id"]] = stored

    async def set_gate_override(self, release_id: str, build_id: str, by_id: str, reason: str, at: str) -> None:
        self._builds[release_id][build_id]["_override"] = {"byId": by_id, "reason": reason, "at": at}

    async def set_build_runs(self, release_id: str, build_id: str, run_ids: list[str]) -> None:
        self._builds[release_id][build_id]["testRunIds"] = list(run_ids)

    async def put_signoff(
        self, release_id: str, build_id: str, user_id: str, decision: str, comment: str | None, at: str
    ) -> None:
        self._signoffs.setdefault((release_id, build_id), {})[user_id] = {
            "userId": user_id,
            "decision": decision,
            "comment": comment,
            "at": at,
        }

    async def promote(self, release_id: str, build_id: str, by_id: str, at: str, release_status: str) -> None:
        build = self._builds[release_id][build_id]
        build.update({"kind": "Final", "promotedById": by_id, "promotedAt": at})
        self._releases[release_id]["status"] = release_status

    # ── blockers ──────────────────────────────────────────────────────
    async def list_blockers(self, release_id: str) -> list[dict[str, Any]]:
        return copy.deepcopy(list(self._blockers.get(release_id, {}).values()))

    async def get_blocker(self, release_id: str, blocker_id: str) -> dict[str, Any] | None:
        found = self._blockers.get(release_id, {}).get(blocker_id)
        return copy.deepcopy(found) if found else None

    async def put_blocker(self, release_id: str, blocker: dict[str, Any]) -> None:
        for other in self._blockers[release_id].values():
            if other["id"] != blocker["id"] and (other["tracker"], other["key"]) == (
                blocker["tracker"],
                blocker["key"],
            ):
                raise DuplicateBlocker(blocker["key"])
        self._blockers[release_id][blocker["id"]] = copy.deepcopy(blocker)

    async def delete_blocker(self, release_id: str, blocker_id: str) -> None:
        self._blockers[release_id].pop(blocker_id, None)

    # ── audit ─────────────────────────────────────────────────────────
    async def append_audit(
        self, release_id: str, make_entry: Callable[[dict[str, Any] | None], dict[str, Any]]
    ) -> None:
        log = self._audit[release_id]
        log.append(make_entry(copy.deepcopy(log[-1]) if log else None))
        self._audit_written.append((release_id, len(log) - 1))

    async def audit(self, release_id: str) -> list[dict[str, Any]]:
        return copy.deepcopy(self._audit.get(release_id, []))

    async def recent_audit(self, limit: int) -> list[dict[str, Any]]:
        latest = self._audit_written[::-1][:limit]
        return [{**copy.deepcopy(self._audit[rid][i]), "releaseId": rid} for rid, i in latest]

    async def export_all(self) -> list[dict[str, Any]]:
        out = []
        for release in await self.list_all():
            rid = release["id"]
            out.append(
                {
                    **release,
                    "builds": await self.list_builds(rid),
                    "blockers": await self.list_blockers(rid),
                    "audit": await self.audit(rid),
                }
            )
        return out
