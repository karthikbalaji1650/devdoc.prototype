"""Sign-in audit log (DDS-SRS-011) in Redis: one entry per session,
written by the server at login and logout - not by the browser, so it
covers every user on every machine and cannot be edited client-side.

Keys (under `dds:audit:`):

    sessions            hash   entry id -> entry JSON
    sessions:by-login   zset   entry id, scored by login time (ms)
    open:{sha256(session id)}   entry id, expiring with the session

The session id itself is never stored, only a hash of it to find the
entry again at logout.
"""

import hashlib
import json
import secrets
from datetime import datetime
from typing import Any

from redis.asyncio import Redis

PREFIX = "dds:audit:"
MAX_ENTRIES = 1000


def _iso(moment: datetime) -> str:
    return moment.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _open_key(session_id: str) -> str:
    return f"{PREFIX}open:{hashlib.sha256(session_id.encode()).hexdigest()}"


class SessionAuditStore:
    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    async def record_login(self, session_id: str, user: Any, login_at: datetime, expires_at: datetime) -> None:
        entry_id = secrets.token_hex(8)
        entry = {
            "id": entry_id,
            "userId": user.id,
            "userName": user.name,
            "role": user.role,
            "loginTime": _iso(login_at),
            "logoutTime": None,
            "expiresAt": _iso(expires_at),
        }
        ttl_ms = max(1, int((expires_at - login_at).total_seconds() * 1000))
        async with self._redis.pipeline(transaction=True) as pipe:
            pipe.hset(f"{PREFIX}sessions", entry_id, json.dumps(entry))
            pipe.zadd(f"{PREFIX}sessions:by-login", {entry_id: login_at.timestamp() * 1000})
            pipe.set(_open_key(session_id), entry_id, px=ttl_ms)
            await pipe.execute()
        await self._trim()

    async def record_logout(self, session_id: str, logout_at: datetime) -> None:
        entry_id = await self._redis.getdel(_open_key(session_id))
        if not entry_id:
            return  # unknown, already ended, or expired
        raw = await self._redis.hget(f"{PREFIX}sessions", entry_id)
        if raw is None:
            return
        entry = json.loads(raw)
        entry["logoutTime"] = _iso(logout_at)
        await self._redis.hset(f"{PREFIX}sessions", entry_id, json.dumps(entry))

    async def recent(self, limit: int = 200) -> list[dict[str, Any]]:
        """Newest login first."""
        ids = await self._redis.zrevrange(f"{PREFIX}sessions:by-login", 0, limit - 1)
        if not ids:
            return []
        raws = await self._redis.hmget(f"{PREFIX}sessions", ids)
        return [json.loads(r) for r in raws if r is not None]

    async def _trim(self) -> None:
        excess = await self._redis.zcard(f"{PREFIX}sessions:by-login") - MAX_ENTRIES
        if excess <= 0:
            return
        oldest = await self._redis.zrange(f"{PREFIX}sessions:by-login", 0, excess - 1)
        async with self._redis.pipeline(transaction=True) as pipe:
            pipe.zrem(f"{PREFIX}sessions:by-login", *oldest)
            pipe.hdel(f"{PREFIX}sessions", *oldest)
            await pipe.execute()
