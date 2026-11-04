"""A Redis read cache in front of the document repository: the documents
list (read on every screen that shows documents) is served from Redis and
dropped on any write, so Postgres stays the only real copy."""

import json
from datetime import datetime

from redis.asyncio import Redis

from app.models.document import DocumentRecord, DocumentWrite
from app.repositories.base import DocumentRepository

LIST_KEY = "dds:cache:documents:active"
TTL_SECONDS = 300  # a safety net; every write clears it anyway


class CachedDocumentRepository:
    def __init__(self, inner: DocumentRepository, redis: Redis) -> None:
        self._inner = inner
        self._redis = redis

    async def list_active(self) -> list[DocumentRecord]:
        cached = await self._redis.get(LIST_KEY)
        if cached is not None:
            return [
                DocumentRecord(
                    id=r["id"],
                    author=r["author"],
                    status=r["status"],
                    document_json=r["document_json"],
                    updated_at=datetime.fromisoformat(r["updated_at"]),
                )
                for r in json.loads(cached)
            ]
        records = await self._inner.list_active()
        payload = [
            {
                "id": r.id,
                "author": r.author,
                "status": r.status,
                "document_json": r.document_json,
                "updated_at": r.updated_at.isoformat(),
            }
            for r in records
        ]
        await self._redis.set(LIST_KEY, json.dumps(payload), ex=TTL_SECONDS)
        return records

    async def get_active(self, document_id: str) -> DocumentRecord | None:
        return await self._inner.get_active(document_id)

    async def get_including_deleted(self, document_id: str) -> DocumentRecord | None:
        return await self._inner.get_including_deleted(document_id)

    async def upsert(self, write: DocumentWrite) -> None:
        await self._inner.upsert(write)
        await self._redis.delete(LIST_KEY)

    async def soft_delete(self, document_id: str) -> None:
        await self._inner.soft_delete(document_id)
        await self._redis.delete(LIST_KEY)

    async def purge(self, document_id: str) -> None:
        await self._inner.purge(document_id)
        await self._redis.delete(LIST_KEY)
