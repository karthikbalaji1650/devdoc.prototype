"""Storage interfaces the services depend on.

Two implementations exist: `postgres` (production, the same SQL the Node
API ran) and `memory` (tests and the browser-test harness - the role
pg-mem played for the Node API, so neither needs a database).
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Protocol

from app.models.document import DocumentRecord, DocumentWrite
from app.models.user import LoginCandidate, User


class UserRepository(Protocol):
    async def find_login_candidate(self, email_lower: str) -> LoginCandidate | None: ...


class SessionRepository(Protocol):
    async def create(self, session_id: str, user_id: str, expires_at: datetime) -> None: ...

    async def delete(self, session_id: str) -> None: ...

    async def find_active_user(self, session_id: str) -> User | None: ...


class DocumentRepository(Protocol):
    async def list_active(self) -> list[DocumentRecord]:
        """Every non-deleted document, most recently updated first."""
        ...

    async def get_active(self, document_id: str) -> DocumentRecord | None: ...

    async def get_including_deleted(self, document_id: str) -> DocumentRecord | None: ...

    async def upsert(self, write: DocumentWrite) -> None:
        """Insert or replace, bumping updated_at and un-deleting."""
        ...

    async def soft_delete(self, document_id: str) -> None: ...

    async def purge(self, document_id: str) -> None: ...

    async def export_all(self) -> list[dict[str, Any]]:
        """Every document, deleted ones included: id, document, updatedAt,
        deletedAt (ISO strings) - for the admin backup."""
        ...

    async def purge_all(self) -> None:
        """Deletes every document (the admin reset)."""
        ...


@dataclass
class Repositories:
    users: UserRepository
    sessions: SessionRepository
    documents: DocumentRepository
