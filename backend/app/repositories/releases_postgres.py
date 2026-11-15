"""Release storage in Postgres (tables from migration 0008)."""

from collections import defaultdict
from collections.abc import Callable
from typing import Any

from psycopg import errors
from psycopg.types.json import Jsonb
from psycopg_pool import AsyncConnectionPool

from app.repositories.base import iso_z
from app.repositories.releases import DuplicateBlocker, DuplicateBuild, DuplicateVersion

MILESTONES = (
    ("code-freeze", "Code Freeze"),
    ("rc-build", "RC Build Generation"),
    ("qa-regression", "QA Regression Window"),
    ("final-signoff", "Final Sign-off"),
    ("ga", "General Availability (GA)"),
)

_RELEASE_SELECT = """
    SELECT r.*, u.name AS created_by_name
      FROM releases r JOIN users u ON u.id = r.created_by
"""


def _num(value: float) -> int | float:
    return int(value) if float(value).is_integer() else value


def _day(value: Any) -> str | None:
    return value.isoformat() if value else None


def _iso(value: Any) -> str | None:
    return iso_z(value) if value else None


class PgReleaseRepository:
    def __init__(self, pool: AsyncConnectionPool) -> None:
        self._pool = pool

    async def _fetch(self, sql: str, params: Any = ()) -> list[dict[str, Any]]:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(sql, params)
            return await cur.fetchall() if cur.description else []

    # ── releases ──────────────────────────────────────────────────────
    async def _views(self, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if not rows:
            return []
        ids = [r["id"] for r in rows]
        milestones: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)
        for m in await self._fetch(
            "SELECT release_id, key, planned_date, actual_date FROM release_milestones WHERE release_id = ANY(%s)",
            (ids,),
        ):
            milestones[m["release_id"]][m["key"]] = m
        signers: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for s in await self._fetch(
            """SELECT s.release_id, u.id, u.name, u.title, u.department
                 FROM release_signers s JOIN users u ON u.id = s.user_id
                WHERE s.release_id = ANY(%s) ORDER BY s.release_id, s.position""",
            (ids,),
        ):
            signers[s["release_id"]].append(
                {"userId": s["id"], "name": s["name"], "title": s["title"], "department": s["department"]}
            )
        out = []
        for r in rows:
            have = milestones[r["id"]]
            out.append(
                {
                    "id": r["id"],
                    "version": r["version"],
                    "title": r["title"],
                    "type": r["type"],
                    "targetDate": _day(r["target_date"]),
                    "segment": r["segment"],
                    "status": r["status"],
                    "notes": r["notes"],
                    "milestones": [
                        {
                            "key": key,
                            "name": name,
                            "plannedDate": _day((have.get(key) or {}).get("planned_date")),
                            "actualDate": _day((have.get(key) or {}).get("actual_date")),
                        }
                        for key, name in MILESTONES
                    ],
                    "signers": signers[r["id"]],
                    "gateRules": {
                        "minPassRate": _num(r["gate_min_pass_rate"]),
                        "requireNoOpenBlockers": r["gate_require_no_blockers"],
                        "mandatorySuiteIds": list(r["gate_mandatory_suite_ids"]),
                    },
                    "blockerQuery": r["blocker_query"],
                    "blockerSync": r["blocker_sync"],
                    "createdBy": r["created_by"],
                    "createdByName": r["created_by_name"],
                    "createdAt": iso_z(r["created_at"]),
                    "updatedAt": iso_z(r["updated_at"]),
                    "cancelledReason": r["cancelled_reason"],
                    "cancelledAt": _iso(r["cancelled_at"]),
                }
            )
        return out

    async def get(self, release_id: str) -> dict[str, Any] | None:
        views = await self._views(await self._fetch(f"{_RELEASE_SELECT} WHERE r.id = %s", (release_id,)))
        return views[0] if views else None

    async def list_all(self) -> list[dict[str, Any]]:
        return await self._views(await self._fetch(f"{_RELEASE_SELECT} ORDER BY r.created_at, r.id"))

    @staticmethod
    def _release_params(release: dict[str, Any]) -> dict[str, Any]:
        rules = release["gateRules"]
        return {
            "id": release["id"],
            "version": release["version"],
            "title": release.get("title"),
            "type": release["type"],
            "target_date": release["targetDate"],
            "segment": release.get("segment"),
            "status": release["status"],
            "notes": release.get("notes") or "",
            "min_pass_rate": rules["minPassRate"],
            "no_blockers": rules["requireNoOpenBlockers"],
            "suites": list(rules["mandatorySuiteIds"]),
            "query": Jsonb(release["blockerQuery"]) if release.get("blockerQuery") else None,
        }

    async def create(self, release: dict[str, Any], signer_ids: list[str]) -> None:
        params = {**self._release_params(release), "created_by": release["createdBy"]}
        try:
            async with self._pool.connection() as conn, conn.transaction():
                await conn.execute(
                    """INSERT INTO releases
                         (id, version, title, type, target_date, segment, status, notes, gate_min_pass_rate,
                          gate_require_no_blockers, gate_mandatory_suite_ids, blocker_query, created_by)
                       VALUES (%(id)s, %(version)s, %(title)s, %(type)s, %(target_date)s, %(segment)s, %(status)s,
                               %(notes)s, %(min_pass_rate)s, %(no_blockers)s, %(suites)s, %(query)s, %(created_by)s)""",
                    params,
                )
                await self._write_milestones(conn, release["id"], release.get("milestones") or [])
                for position, user_id in enumerate(signer_ids):
                    await conn.execute(
                        "INSERT INTO release_signers (release_id, user_id, position, added_by) VALUES (%s, %s, %s, %s)",
                        (release["id"], user_id, position, release["createdBy"]),
                    )
        except errors.UniqueViolation as exc:
            if exc.diag.constraint_name == "releases_version_unique":
                raise DuplicateVersion(release["version"]) from exc
            raise

    @staticmethod
    async def _write_milestones(conn: Any, release_id: str, milestones: list[dict[str, Any]]) -> None:
        given = {m["key"]: m for m in milestones}
        for key, _name in MILESTONES:
            m = given.get(key) or {}
            await conn.execute(
                """INSERT INTO release_milestones (release_id, key, planned_date, actual_date)
                   VALUES (%s, %s, %s, %s)
                   ON CONFLICT (release_id, key)
                   DO UPDATE SET planned_date = EXCLUDED.planned_date, actual_date = EXCLUDED.actual_date""",
                (release_id, key, m.get("plannedDate") or None, m.get("actualDate") or None),
            )

    async def update(self, release: dict[str, Any]) -> None:
        try:
            async with self._pool.connection() as conn, conn.transaction():
                await conn.execute(
                    """UPDATE releases SET version = %(version)s, title = %(title)s, type = %(type)s,
                              target_date = %(target_date)s, segment = %(segment)s, status = %(status)s,
                              notes = %(notes)s, gate_min_pass_rate = %(min_pass_rate)s,
                              gate_require_no_blockers = %(no_blockers)s, gate_mandatory_suite_ids = %(suites)s,
                              blocker_query = %(query)s, updated_at = now()
                        WHERE id = %(id)s""",
                    self._release_params(release),
                )
                await self._write_milestones(conn, release["id"], release.get("milestones") or [])
        except errors.UniqueViolation as exc:
            if exc.diag.constraint_name == "releases_version_unique":
                raise DuplicateVersion(release["version"]) from exc
            raise

    async def cancel(self, release_id: str, reason: str) -> None:
        await self._fetch(
            """UPDATE releases SET status = 'Cancelled', cancelled_reason = %s, cancelled_at = now(),
                      updated_at = now() WHERE id = %s""",
            (reason, release_id),
        )

    async def set_signers(self, release_id: str, signer_ids: list[str], added_by: str) -> None:
        async with self._pool.connection() as conn, conn.transaction():
            await conn.execute(
                "DELETE FROM release_signers WHERE release_id = %s AND NOT (user_id = ANY(%s))",
                (release_id, signer_ids),
            )
            for position, user_id in enumerate(signer_ids):
                await conn.execute(
                    """INSERT INTO release_signers (release_id, user_id, position, added_by) VALUES (%s, %s, %s, %s)
                       ON CONFLICT (release_id, user_id) DO UPDATE SET position = EXCLUDED.position""",
                    (release_id, user_id, position, added_by),
                )
            await conn.execute("UPDATE releases SET updated_at = now() WHERE id = %s", (release_id,))

    async def set_blocker_sync(self, release_id: str, result: dict[str, Any]) -> None:
        await self._fetch("UPDATE releases SET blocker_sync = %s WHERE id = %s", (Jsonb(result), release_id))

    async def claim_sync(self, release_id: str, slot: int) -> bool:
        rows = await self._fetch(
            """UPDATE releases SET blockers_sync_slot = %s
                WHERE id = %s AND (blockers_sync_slot IS NULL OR blockers_sync_slot < %s) RETURNING id""",
            (slot, release_id, slot),
        )
        return bool(rows)

    # ── builds ────────────────────────────────────────────────────────
    async def list_builds(self, release_id: str) -> list[dict[str, Any]]:
        rows = await self._fetch(
            """SELECT b.*, ob.name AS override_by_name, pb.name AS promoted_by_name, cb.name AS created_by_name
                 FROM release_builds b
                 JOIN users cb ON cb.id = b.created_by
                 LEFT JOIN users ob ON ob.id = b.gate_override_by
                 LEFT JOIN users pb ON pb.id = b.promoted_by
                WHERE b.release_id = %s ORDER BY b.number""",
            (release_id,),
        )
        runs: dict[str, list[str]] = defaultdict(list)
        for r in await self._fetch(
            "SELECT build_id, test_run_id FROM release_build_runs WHERE release_id = %s ORDER BY build_id, position",
            (release_id,),
        ):
            runs[r["build_id"]].append(r["test_run_id"])
        signoffs: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)
        for s in await self._fetch(
            """SELECT s.build_id, s.user_id, s.decision, s.comment, s.decided_at, u.name
                 FROM release_signoffs s JOIN users u ON u.id = s.user_id WHERE s.release_id = %s""",
            (release_id,),
        ):
            signoffs[s["build_id"]][s["user_id"]] = {
                "userId": s["user_id"],
                "userName": s["name"],
                "decision": s["decision"],
                "comment": s["comment"],
                "at": iso_z(s["decided_at"]),
            }
        return [
            {
                "id": b["id"],
                "number": b["number"],
                "label": b["label"],
                "kind": b["kind"],
                "imageName": b["image_name"],
                "commitSha": b["commit_sha"],
                "branchTag": b["branch_tag"],
                "artifactUrl": b["artifact_url"],
                "repository": b["repository"],
                "sha256": b["sha256"],
                "builtAt": b["built_at"],
                "pipelineBuildId": b["pipeline_build_id"],
                "testRunIds": runs[b["id"]],
                "gateOverride": (
                    {
                        "by": b["override_by_name"],
                        "byId": b["gate_override_by"],
                        "reason": b["gate_override_reason"],
                        "at": iso_z(b["gate_override_at"]),
                    }
                    if b["gate_override_by"]
                    else None
                ),
                "promotedBy": b["promoted_by_name"],
                "promotedById": b["promoted_by"],
                "promotedAt": _iso(b["promoted_at"]),
                "createdBy": b["created_by"],
                "createdByName": b["created_by_name"],
                "createdAt": iso_z(b["created_at"]),
                "signoffs": signoffs[b["id"]],
            }
            for b in rows
        ]

    async def get_build(self, release_id: str, build_id: str) -> dict[str, Any] | None:
        return next((b for b in await self.list_builds(release_id) if b["id"] == build_id), None)

    async def add_build(self, release_id: str, build: dict[str, Any]) -> None:
        try:
            await self._fetch(
                """INSERT INTO release_builds
                     (release_id, id, number, label, kind, image_name, commit_sha, branch_tag, artifact_url,
                      repository, sha256, built_at, pipeline_build_id, created_by)
                   VALUES (%s, %s, %s, %s, 'RC', %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (
                    release_id,
                    build["id"],
                    build["number"],
                    build["label"],
                    build["imageName"],
                    build.get("commitSha"),
                    build.get("branchTag"),
                    build["artifactUrl"],
                    build["repository"],
                    build["sha256"],
                    build.get("builtAt"),
                    build.get("pipelineBuildId"),
                    build["createdBy"],
                ),
            )
        except errors.UniqueViolation as exc:
            raise DuplicateBuild(build["number"]) from exc

    async def set_gate_override(self, release_id: str, build_id: str, by_id: str, reason: str, at: str) -> None:
        await self._fetch(
            """UPDATE release_builds SET gate_override_by = %s, gate_override_reason = %s, gate_override_at = %s
                WHERE release_id = %s AND id = %s""",
            (by_id, reason, at, release_id, build_id),
        )

    async def set_build_runs(self, release_id: str, build_id: str, run_ids: list[str]) -> None:
        async with self._pool.connection() as conn, conn.transaction():
            await conn.execute(
                "DELETE FROM release_build_runs WHERE release_id = %s AND build_id = %s", (release_id, build_id)
            )
            for position, run_id in enumerate(run_ids):
                await conn.execute(
                    """INSERT INTO release_build_runs (release_id, build_id, test_run_id, position)
                       VALUES (%s, %s, %s, %s)""",
                    (release_id, build_id, run_id, position),
                )

    async def put_signoff(
        self, release_id: str, build_id: str, user_id: str, decision: str, comment: str | None, at: str
    ) -> None:
        await self._fetch(
            """INSERT INTO release_signoffs (release_id, build_id, user_id, decision, comment, decided_at)
               VALUES (%s, %s, %s, %s, %s, %s)
               ON CONFLICT (release_id, build_id, user_id)
               DO UPDATE SET decision = EXCLUDED.decision, comment = EXCLUDED.comment,
                             decided_at = EXCLUDED.decided_at""",
            (release_id, build_id, user_id, decision, comment, at),
        )

    async def promote(self, release_id: str, build_id: str, by_id: str, at: str, release_status: str) -> None:
        async with self._pool.connection() as conn, conn.transaction():
            await conn.execute(
                """UPDATE release_builds SET kind = 'Final', promoted_by = %s, promoted_at = %s
                    WHERE release_id = %s AND id = %s""",
                (by_id, at, release_id, build_id),
            )
            await conn.execute(
                "UPDATE releases SET status = %s, updated_at = now() WHERE id = %s", (release_status, release_id)
            )

    # ── blockers ──────────────────────────────────────────────────────
    @staticmethod
    def _blocker(r: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": r["id"],
            "key": r["key"],
            "tracker": r["tracker"],
            "title": r["title"],
            "url": r["url"],
            "severity": r["severity"],
            "status": r["status"],
            "source": r["source"],
            "syncNote": r["sync_note"],
            "syncedAt": _iso(r["synced_at"]),
            "createdBy": r["created_by"],
            "updatedAt": iso_z(r["updated_at"]),
        }

    async def list_blockers(self, release_id: str) -> list[dict[str, Any]]:
        rows = await self._fetch(
            "SELECT * FROM release_blockers WHERE release_id = %s ORDER BY created_at, id", (release_id,)
        )
        return [self._blocker(r) for r in rows]

    async def get_blocker(self, release_id: str, blocker_id: str) -> dict[str, Any] | None:
        rows = await self._fetch(
            "SELECT * FROM release_blockers WHERE release_id = %s AND id = %s", (release_id, blocker_id)
        )
        return self._blocker(rows[0]) if rows else None

    async def put_blocker(self, release_id: str, blocker: dict[str, Any]) -> None:
        try:
            await self._fetch(
                """INSERT INTO release_blockers
                     (id, release_id, tracker, key, title, url, severity, status, source, sync_note, synced_at,
                      created_by)
                   VALUES (%(id)s, %(release_id)s, %(tracker)s, %(key)s, %(title)s, %(url)s, %(severity)s,
                           %(status)s, %(source)s, %(sync_note)s, %(synced_at)s, %(created_by)s)
                   ON CONFLICT (id) DO UPDATE SET
                     tracker = EXCLUDED.tracker, key = EXCLUDED.key, title = EXCLUDED.title, url = EXCLUDED.url,
                     severity = EXCLUDED.severity, status = EXCLUDED.status, source = EXCLUDED.source,
                     sync_note = EXCLUDED.sync_note, synced_at = EXCLUDED.synced_at, updated_at = now()
                   WHERE release_blockers.release_id = EXCLUDED.release_id""",
                {
                    "id": blocker["id"],
                    "release_id": release_id,
                    "tracker": blocker["tracker"],
                    "key": blocker["key"],
                    "title": blocker.get("title"),
                    "url": blocker.get("url"),
                    "severity": blocker["severity"],
                    "status": blocker["status"],
                    "source": blocker.get("source") or "manual",
                    "sync_note": blocker.get("syncNote"),
                    "synced_at": blocker.get("syncedAt"),
                    "created_by": blocker["createdBy"],
                },
            )
        except errors.UniqueViolation as exc:
            raise DuplicateBlocker(blocker["key"]) from exc

    async def delete_blocker(self, release_id: str, blocker_id: str) -> None:
        await self._fetch("DELETE FROM release_blockers WHERE release_id = %s AND id = %s", (release_id, blocker_id))

    # ── audit ─────────────────────────────────────────────────────────
    async def append_audit(
        self, release_id: str, make_entry: Callable[[dict[str, Any] | None], dict[str, Any]]
    ) -> None:
        async with self._pool.connection() as conn, conn.transaction():
            # One writer at a time per release, so sequence numbers never collide.
            await conn.execute("SELECT id FROM releases WHERE id = %s FOR UPDATE", (release_id,))
            cur = await conn.execute(
                "SELECT seq, hash FROM release_audit WHERE release_id = %s ORDER BY seq DESC LIMIT 1", (release_id,)
            )
            tail = await cur.fetchone()
            entry = make_entry({"seq": tail["seq"], "hash": tail["hash"].strip()} if tail else None)
            await conn.execute(
                """INSERT INTO release_audit
                     (release_id, seq, at, actor_id, actor, actor_role, action, details, prev_hash, hash)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (
                    release_id,
                    entry["seq"],
                    entry["at"],
                    entry["actorId"],
                    entry["actor"],
                    entry["actorRole"],
                    entry["action"],
                    Jsonb(entry["details"]),
                    entry["prevHash"],
                    entry["hash"],
                ),
            )

    async def audit(self, release_id: str) -> list[dict[str, Any]]:
        rows = await self._fetch("SELECT * FROM release_audit WHERE release_id = %s ORDER BY seq", (release_id,))
        return [
            {
                "seq": r["seq"],
                "at": r["at"],
                "actorId": r["actor_id"],
                "actor": r["actor"],
                "actorRole": r["actor_role"],
                "action": r["action"],
                "details": r["details"],
                "prevHash": r["prev_hash"].strip(),
                "hash": r["hash"].strip(),
            }
            for r in rows
        ]

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
