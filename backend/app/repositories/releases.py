"""Release management data in Redis (DDS-SRS-033 - 046).

    dds:rel:releases              hash  release id -> release JSON
    dds:rel:{id}:builds           hash  build id -> build JSON (RC and Final)
    dds:rel:{id}:blockers         hash  blocker id -> blocker JSON
    dds:rel:seq                   counter for insertion order
    dds:rel:seeded                set once sample data has been loaded
    dds:audit:releases:{id}       list  audit entries, oldest first (append-only)

The audit log lives under dds:audit: so the admin reset keeps it, like the
session audit log. Nothing ever rewrites or removes an entry.
"""

import json
from typing import Any

from redis.asyncio import Redis

PREFIX = "dds:rel:"


def _ordered(raw: dict[str, str]) -> list[dict[str, Any]]:
    items = [json.loads(v) for v in raw.values()]
    items.sort(key=lambda i: i.get("_seq", 0))
    for i in items:
        i.pop("_seq", None)
    return items


def _load(raw: str | None) -> dict[str, Any] | None:
    if raw is None:
        return None
    item = json.loads(raw)
    item.pop("_seq", None)
    return item


def audit_key(release_id: str) -> str:
    return f"dds:audit:releases:{release_id}"


class ReleaseStore:
    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    async def _put(self, key: str, item: dict[str, Any]) -> None:
        existing = await self._redis.hget(key, item["id"])
        seq = json.loads(existing).get("_seq") if existing else None
        if seq is None:
            seq = await self._redis.incr(f"{PREFIX}seq")
        await self._redis.hset(key, item["id"], json.dumps({**item, "_seq": seq}))

    # releases
    async def list_releases(self) -> list[dict[str, Any]]:
        return _ordered(await self._redis.hgetall(f"{PREFIX}releases"))

    async def get_release(self, release_id: str) -> dict[str, Any] | None:
        return _load(await self._redis.hget(f"{PREFIX}releases", release_id))

    async def put_release(self, release: dict[str, Any]) -> None:
        await self._put(f"{PREFIX}releases", release)

    async def delete_release(self, release_id: str) -> None:
        """Removes the release with its builds and blockers; its audit log stays."""
        async with self._redis.pipeline(transaction=True) as pipe:
            pipe.hdel(f"{PREFIX}releases", release_id)
            pipe.delete(f"{PREFIX}{release_id}:builds", f"{PREFIX}{release_id}:blockers")
            await pipe.execute()

    # builds and blockers
    async def list_builds(self, release_id: str) -> list[dict[str, Any]]:
        return _ordered(await self._redis.hgetall(f"{PREFIX}{release_id}:builds"))

    async def get_build(self, release_id: str, build_id: str) -> dict[str, Any] | None:
        return _load(await self._redis.hget(f"{PREFIX}{release_id}:builds", build_id))

    async def put_build(self, release_id: str, build: dict[str, Any]) -> None:
        await self._put(f"{PREFIX}{release_id}:builds", build)

    async def list_blockers(self, release_id: str) -> list[dict[str, Any]]:
        return _ordered(await self._redis.hgetall(f"{PREFIX}{release_id}:blockers"))

    async def get_blocker(self, release_id: str, blocker_id: str) -> dict[str, Any] | None:
        return _load(await self._redis.hget(f"{PREFIX}{release_id}:blockers", blocker_id))

    async def put_blocker(self, release_id: str, blocker: dict[str, Any]) -> None:
        await self._put(f"{PREFIX}{release_id}:blockers", blocker)

    async def delete_blocker(self, release_id: str, blocker_id: str) -> None:
        await self._redis.hdel(f"{PREFIX}{release_id}:blockers", blocker_id)

    # audit log (append-only)
    async def audit_tail(self, release_id: str) -> dict[str, Any] | None:
        raw = await self._redis.lindex(audit_key(release_id), -1)
        return json.loads(raw) if raw else None

    async def append_audit(self, release_id: str, entry: dict[str, Any]) -> None:
        await self._redis.rpush(audit_key(release_id), json.dumps(entry))

    async def audit(self, release_id: str) -> list[dict[str, Any]]:
        return [json.loads(e) for e in await self._redis.lrange(audit_key(release_id), 0, -1)]

    # sample data
    async def claim_seed(self) -> bool:
        return bool(await self._redis.set(f"{PREFIX}seeded", "1", nx=True))

    async def is_seeded(self) -> bool:
        return bool(await self._redis.exists(f"{PREFIX}seeded"))
