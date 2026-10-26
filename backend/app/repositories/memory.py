"""In-memory repositories for tests and the browser-test harness.

Plays the part pg-mem did for the Node API: same observable behavior as
the Postgres repositories (ordering, soft delete, NOT NULL columns, case-
insensitive email lookup) with no database to run.
"""

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from app.core.jscompat import js_loads
from app.models.document import DocumentRecord, DocumentWrite
from app.models.user import LoginCandidate, User
from app.repositories.base import Repositories


class IntegrityError(Exception):
    """Stands in for the Postgres constraint violation the real table raises."""


@dataclass
class _StoredUser:
    user: User
    password_hash: str


@dataclass
class _StoredDocument:
    write: DocumentWrite
    updated_at: datetime
    deleted_at: datetime | None = None


@dataclass
class MemoryStore:
    users: dict[str, _StoredUser] = field(default_factory=dict)
    sessions: dict[str, tuple[str, datetime]] = field(default_factory=dict)
    documents: dict[str, _StoredDocument] = field(default_factory=dict)

    def add_user(self, user: User, password_hash: str) -> None:
        self.users[user.id] = _StoredUser(user, password_hash)

    def document_deleted_at(self, document_id: str) -> datetime | None:
        return self.documents[document_id].deleted_at


class MemoryUserRepository:
    def __init__(self, store: MemoryStore) -> None:
        self._store = store

    async def find_login_candidate(self, email_lower: str) -> LoginCandidate | None:
        for stored in self._store.users.values():
            if stored.user.email.lower() == email_lower:
                return LoginCandidate(stored.user.id, stored.password_hash)
        return None


class MemorySessionRepository:
    def __init__(self, store: MemoryStore) -> None:
        self._store = store

    async def create(self, session_id: str, user_id: str, expires_at: datetime) -> None:
        if user_id not in self._store.users:
            raise IntegrityError("sessions.user_id references a missing user")
        self._store.sessions[session_id] = (user_id, expires_at)

    async def delete(self, session_id: str) -> None:
        self._store.sessions.pop(session_id, None)

    async def find_active_user(self, session_id: str) -> User | None:
        entry = self._store.sessions.get(session_id)
        if entry is None or entry[1] <= datetime.now(UTC):
            return None
        stored = self._store.users.get(entry[0])
        return stored.user if stored else None


def _to_record(stored: _StoredDocument) -> DocumentRecord:
    w = stored.write
    return DocumentRecord(
        id=w.id or "",
        author=w.author,
        status=w.status,
        document_json=js_loads(w.document_json),
        updated_at=stored.updated_at,
    )


class MemoryDocumentRepository:
    def __init__(self, store: MemoryStore) -> None:
        self._store = store

    async def list_active(self) -> list[DocumentRecord]:
        active = [d for d in self._store.documents.values() if d.deleted_at is None]
        active.sort(key=lambda d: d.updated_at, reverse=True)
        return [_to_record(d) for d in active]

    async def get_active(self, document_id: str) -> DocumentRecord | None:
        stored = self._store.documents.get(document_id)
        return _to_record(stored) if stored and stored.deleted_at is None else None

    async def get_including_deleted(self, document_id: str) -> DocumentRecord | None:
        stored = self._store.documents.get(document_id)
        return _to_record(stored) if stored else None

    async def upsert(self, write: DocumentWrite) -> None:
        missing: list[Any] = [n for n in ("id", "doc_number", "title") if getattr(write, n) is None]
        if missing:
            raise IntegrityError(f"null value in NOT NULL column(s) {missing}")
        self._store.documents[write.id] = _StoredDocument(write, datetime.now(UTC))  # type: ignore[index]

    async def soft_delete(self, document_id: str) -> None:
        if document_id in self._store.documents:
            self._store.documents[document_id].deleted_at = datetime.now(UTC)

    async def purge(self, document_id: str) -> None:
        self._store.documents.pop(document_id, None)


def memory_repositories(store: MemoryStore) -> Repositories:
    return Repositories(
        users=MemoryUserRepository(store),
        sessions=MemorySessionRepository(store),
        documents=MemoryDocumentRepository(store),
    )
