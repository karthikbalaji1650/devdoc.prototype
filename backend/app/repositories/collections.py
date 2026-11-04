"""Shared collections in Redis: data the frontend used to keep in each
browser (libraries, logs), now one copy for every user.

    dds:col:{name}          hash  item id -> item JSON (with `_seq`)
    dds:col:{name}:seq      counter for insertion order
    dds:col:{name}:seeded   set once sample data has been loaded
"""

import json
from typing import Any

from redis.asyncio import Redis

PREFIX = "dds:col:"


class CollectionStore:
    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    async def list(self, name: str) -> list[dict[str, Any]]:
        """Oldest first (insertion order)."""
        items = [json.loads(v) for v in (await self._redis.hgetall(f"{PREFIX}{name}")).values()]
        items.sort(key=lambda i: i.get("_seq", 0))
        for item in items:
            item.pop("_seq", None)
        return items

    async def get(self, name: str, item_id: str) -> dict[str, Any] | None:
        raw = await self._redis.hget(f"{PREFIX}{name}", item_id)
        if raw is None:
            return None
        item = json.loads(raw)
        item.pop("_seq", None)
        return item

    async def count(self, name: str) -> int:
        return await self._redis.hlen(f"{PREFIX}{name}")

    async def put(self, name: str, item: dict[str, Any]) -> None:
        existing = await self._redis.hget(f"{PREFIX}{name}", item["id"])
        seq = json.loads(existing).get("_seq") if existing else None
        if seq is None:
            seq = await self._redis.incr(f"{PREFIX}{name}:seq")
        await self._redis.hset(f"{PREFIX}{name}", item["id"], json.dumps({**item, "_seq": seq}))

    async def delete(self, name: str, item_id: str) -> None:
        await self._redis.hdel(f"{PREFIX}{name}", item_id)

    async def claim_seed(self, name: str) -> bool:
        return bool(await self._redis.set(f"{PREFIX}{name}:seeded", "1", nx=True))

    async def is_seeded(self, name: str) -> bool:
        return bool(await self._redis.exists(f"{PREFIX}{name}:seeded"))
