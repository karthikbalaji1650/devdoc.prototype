"""CI tokens in Redis (DDS-SRS-026/027).

dds:ci:tokens          hash  token id -> record JSON (SHA-256 of the token, never the token)
dds:ci:token-hash      hash  SHA-256 -> token id, for look-up on each request
"""

import json
from typing import Any

from redis.asyncio import Redis

PREFIX = "dds:ci:"


class CiTokenStore:
    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    async def list(self) -> list[dict[str, Any]]:
        items = [json.loads(v) for v in (await self._redis.hgetall(f"{PREFIX}tokens")).values()]
        return sorted(items, key=lambda t: t["createdAt"])

    async def put(self, record: dict[str, Any]) -> None:
        async with self._redis.pipeline(transaction=True) as pipe:
            pipe.hset(f"{PREFIX}tokens", record["id"], json.dumps(record))
            pipe.hset(f"{PREFIX}token-hash", record["hash"], record["id"])
            await pipe.execute()

    async def by_hash(self, token_hash: str) -> dict[str, Any] | None:
        token_id = await self._redis.hget(f"{PREFIX}token-hash", token_hash)
        if token_id is None:
            return None
        raw = await self._redis.hget(f"{PREFIX}tokens", token_id)
        return json.loads(raw) if raw else None

    async def touch(self, token_id: str, at: str) -> None:
        raw = await self._redis.hget(f"{PREFIX}tokens", token_id)
        if raw:
            await self._redis.hset(f"{PREFIX}tokens", token_id, json.dumps({**json.loads(raw), "lastUsedAt": at}))

    async def delete(self, token_id: str) -> bool:
        raw = await self._redis.hget(f"{PREFIX}tokens", token_id)
        if raw is None:
            return False
        async with self._redis.pipeline(transaction=True) as pipe:
            pipe.hdel(f"{PREFIX}tokens", token_id)
            pipe.hdel(f"{PREFIX}token-hash", json.loads(raw)["hash"])
            await pipe.execute()
        return True
