"""Scheduled test runs in Redis (DDS-SRS-028).

dds:sched:schedules          hash  schedule id -> schedule JSON
dds:sched:seq                counter for insertion order
dds:sched:lock:{id}:{due}    set while one API instance fires that occurrence
"""

import json
from typing import Any

from redis.asyncio import Redis

PREFIX = "dds:sched:"


class ScheduleStore:
    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    async def list(self) -> list[dict[str, Any]]:
        items = [json.loads(v) for v in (await self._redis.hgetall(f"{PREFIX}schedules")).values()]
        items.sort(key=lambda i: i.get("_seq", 0))
        for i in items:
            i.pop("_seq", None)
        return items

    async def get(self, schedule_id: str) -> dict[str, Any] | None:
        raw = await self._redis.hget(f"{PREFIX}schedules", schedule_id)
        if raw is None:
            return None
        item = json.loads(raw)
        item.pop("_seq", None)
        return item

    async def put(self, schedule: dict[str, Any]) -> None:
        existing = await self._redis.hget(f"{PREFIX}schedules", schedule["id"])
        seq = json.loads(existing).get("_seq") if existing else None
        if seq is None:
            seq = await self._redis.incr(f"{PREFIX}seq")
        await self._redis.hset(f"{PREFIX}schedules", schedule["id"], json.dumps({**schedule, "_seq": seq}))

    async def delete(self, schedule_id: str) -> bool:
        return bool(await self._redis.hdel(f"{PREFIX}schedules", schedule_id))

    async def claim(self, schedule_id: str, due: float) -> bool:
        """True for exactly one caller per occurrence, across API instances."""
        key = f"{PREFIX}lock:{schedule_id}:{int(due)}"
        return bool(await self._redis.set(key, "1", nx=True, ex=24 * 3600))
