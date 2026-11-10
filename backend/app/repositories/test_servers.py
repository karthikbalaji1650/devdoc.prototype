"""Remote test execution servers in Redis (DDS-SRS-019).

dds:tsrv:servers    hash  server id -> server JSON (secrets sealed, see core/secrets.py)
dds:tsrv:seq        counter for insertion order
"""

import json
from typing import Any

from redis.asyncio import Redis

PREFIX = "dds:tsrv:"


class TestServerStore:
    __test__ = False

    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    async def list(self) -> list[dict[str, Any]]:
        items = [json.loads(v) for v in (await self._redis.hgetall(f"{PREFIX}servers")).values()]
        items.sort(key=lambda i: i.get("_seq", 0))
        for i in items:
            i.pop("_seq", None)
        return items

    async def get(self, server_id: str) -> dict[str, Any] | None:
        raw = await self._redis.hget(f"{PREFIX}servers", server_id)
        if raw is None:
            return None
        item = json.loads(raw)
        item.pop("_seq", None)
        return item

    async def put(self, server: dict[str, Any]) -> None:
        existing = await self._redis.hget(f"{PREFIX}servers", server["id"])
        seq = json.loads(existing).get("_seq") if existing else None
        if seq is None:
            seq = await self._redis.incr(f"{PREFIX}seq")
        await self._redis.hset(f"{PREFIX}servers", server["id"], json.dumps({**server, "_seq": seq}))

    async def delete(self, server_id: str) -> bool:
        return bool(await self._redis.hdel(f"{PREFIX}servers", server_id))
