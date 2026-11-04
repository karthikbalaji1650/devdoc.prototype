"""Document version history in Redis: earlier versions of each document,
newest first, taken by the server when a save replaces the stored copy
(at most every few minutes) and before a restore.

    dds:doc:{id}:history    list  snapshot JSON, newest first
"""

import json
from typing import Any

from redis.asyncio import Redis

MAX_SNAPSHOTS = 10


def _key(document_id: str) -> str:
    return f"dds:doc:{document_id}:history"


class DocumentHistoryStore:
    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    async def list(self, document_id: str) -> list[dict[str, Any]]:
        return [json.loads(s) for s in await self._redis.lrange(_key(document_id), 0, -1)]

    async def latest(self, document_id: str) -> dict[str, Any] | None:
        raw = await self._redis.lindex(_key(document_id), 0)
        return json.loads(raw) if raw else None

    async def add(self, document_id: str, snapshot: dict[str, Any]) -> None:
        async with self._redis.pipeline(transaction=True) as pipe:
            pipe.lpush(_key(document_id), json.dumps(snapshot))
            pipe.ltrim(_key(document_id), 0, MAX_SNAPSHOTS - 1)
            await pipe.execute()

    async def delete(self, document_id: str) -> None:
        await self._redis.delete(_key(document_id))
