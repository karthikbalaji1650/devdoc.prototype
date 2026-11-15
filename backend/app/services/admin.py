"""Admin data management (DDS-SRS-008): a backup of everything the server
holds, and a reset. All data now lives on the server, so these replace the
old browser-storage export and "clear all data"."""

from datetime import UTC, datetime
from typing import Any

from redis.asyncio import Redis

from app.core.errors import ApiError
from app.models.user import User
from app.repositories.base import DocumentRepository, SessionAuditRepository
from app.repositories.releases import ReleaseRepository
from app.services.permissions import is_admin

BACKUP_FORMAT = "devdoc-studio-backup-v1"
RESET_CONFIRMATION = "DELETE ALL DATA"
# Kept by a reset: audit logs are security records, and must not be erasable
# by the people they record. The session audit log, users and sessions live in
# Postgres and are untouched by a reset (so the admin stays signed in); so are
# releases with their builds and audit log (they are cancelled, never deleted).
_KEPT_BY_RESET = ("dds:audit:",)


def _require_admin(user: User) -> None:
    if not is_admin(user):
        raise ApiError(403, "Only admins can manage the application's data.")


async def _dump_key(redis: Redis, key: str) -> dict[str, Any]:
    kind = await redis.type(key)
    if kind == "string":
        value: Any = await redis.get(key)
    elif kind == "hash":
        value = await redis.hgetall(key)
    elif kind == "list":
        value = await redis.lrange(key, 0, -1)
    elif kind == "zset":
        value = [[member, score] for member, score in await redis.zrange(key, 0, -1, withscores=True)]
    elif kind == "set":
        value = sorted(await redis.smembers(key))
    else:
        value = None
    return {"type": kind, "value": value}


class AdminService:
    def __init__(
        self,
        documents: DocumentRepository,
        redis: Redis,
        session_audit: SessionAuditRepository,
        releases: ReleaseRepository,
    ) -> None:
        self._documents = documents
        self._redis = redis
        self._session_audit = session_audit
        self._releases = releases

    async def backup(self, user: User) -> dict[str, Any]:
        """Every document (deleted ones too) and every app key in Redis -
        test management, libraries, logs, Doc Bin and version history - plus
        the session audit log (`sessionAudit`) and the releases with their builds,
        blockers and audit logs (`releases`), which live in Postgres. The read
        cache is left out."""
        _require_admin(user)
        keys = sorted([k async for k in self._redis.scan_iter(match="dds:*") if not k.startswith("dds:cache:")])
        return {
            "format": BACKUP_FORMAT,
            "exportedAt": datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z"),
            "exportedBy": user.name,
            "documents": await self._documents.export_all(),
            "sessionAudit": await self._session_audit.export_all(),
            "releases": await self._releases.export_all(),
            "redis": {k: await _dump_key(self._redis, k) for k in keys},
        }

    async def reset(self, user: User, body: Any) -> dict[str, Any]:
        """Deletes all documents and app data. Needs the exact confirmation text."""
        _require_admin(user)
        if not isinstance(body, dict) or body.get("confirm") != RESET_CONFIRMATION:
            raise ApiError(400, f'Type "{RESET_CONFIRMATION}" to confirm.')
        await self._documents.purge_all()
        removed = 0
        async for key in self._redis.scan_iter(match="dds:*"):
            if not key.startswith(_KEPT_BY_RESET):
                removed += await self._redis.delete(key)
        return {"ok": True, "redisKeysRemoved": removed}
