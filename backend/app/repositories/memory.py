"""In-memory repositories for tests and the browser-test harness.

Plays the part pg-mem did for the Node API: same observable behavior as
the Postgres repositories (ordering, soft delete, NOT NULL columns, case-
insensitive email lookup) with no database to run.
"""

import hashlib
import secrets
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from app.core.jscompat import js_loads
from app.models.document import DocumentRecord, DocumentWrite
from app.models.user import LoginCandidate, User
from app.repositories.base import Repositories, iso_z
from app.repositories.releases_memory import MemoryReleaseRepository


class IntegrityError(Exception):
    """Stands in for the Postgres constraint violation the real table raises."""


@dataclass
class _StoredUser:
    user: User
    password: str


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
    session_audit: list[dict[str, Any]] = field(default_factory=list)  # oldest first

    def add_user(self, user: User, password: str) -> None:
        self.users[user.id] = _StoredUser(user, password)

    def document_deleted_at(self, document_id: str) -> datetime | None:
        return self.documents[document_id].deleted_at


class MemoryUserRepository:
    def __init__(self, store: MemoryStore) -> None:
        self._store = store

    async def find_login_candidate(self, email_lower: str) -> LoginCandidate | None:
        for stored in self._store.users.values():
            if stored.user.email.lower() == email_lower:
                return LoginCandidate(stored.user.id, stored.password)
        return None

    async def find_by_name(self, name: str) -> list[User]:
        wanted = name.strip().lower()
        return [s.user for s in self._store.users.values() if s.user.name.strip().lower() == wanted]

    async def find_by_ids(self, user_ids: list[str]) -> list[User]:
        return [self._store.users[i].user for i in dict.fromkeys(user_ids) if i in self._store.users]

    async def search(self, query: str, limit: int) -> list[User]:
        wanted = query.strip().lower()
        found = [
            s.user
            for s in self._store.users.values()
            if wanted in f"{s.user.name}\n{s.user.designation or ''}\n{s.user.department or ''}".lower()
        ]
        return sorted(found, key=lambda u: (u.name.lower(), u.id))[:limit]


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


class MemorySessionAuditRepository:
    def __init__(self, store: MemoryStore) -> None:
        self._store = store

    async def record_login(self, session_id: str, user: User, login_at: datetime, expires_at: datetime) -> None:
        self._store.session_audit.append(
            {
                "id": secrets.token_hex(8),
                "_hash": _session_hash(session_id),
                "userId": user.id,
                "userName": user.name,
                "role": user.role,
                "loginTime": iso_z(login_at),
                "logoutTime": None,
                "expiresAt": iso_z(expires_at),
                "_expires": expires_at,
            }
        )

    async def record_logout(self, session_id: str, logout_at: datetime) -> None:
        digest = _session_hash(session_id)
        for entry in self._store.session_audit:
            if entry["_hash"] == digest:
                if entry["logoutTime"] is None and entry["_expires"] > logout_at:
                    entry["logoutTime"] = iso_z(logout_at)
                return

    async def recent(self, limit: int = 200, user_id: str | None = None) -> list[dict[str, Any]]:
        newest_first = [e for e in reversed(self._store.session_audit) if user_id is None or e["userId"] == user_id]
        return [{k: v for k, v in e.items() if not k.startswith("_")} for e in newest_first[:limit]]

    async def export_all(self) -> list[dict[str, Any]]:
        return [{k: v for k, v in e.items() if not k.startswith("_")} for e in self._store.session_audit]


def _session_hash(session_id: str) -> str:
    return hashlib.sha256(session_id.encode()).hexdigest()


def _to_record(stored: _StoredDocument) -> DocumentRecord:
    w = stored.write
    return DocumentRecord(
        id=w.id or "",
        author=w.author,
        owner_id=w.owner_id,
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
        if write.owner_id is not None and write.owner_id not in self._store.users:
            raise IntegrityError("documents.owner_id references a missing user")
        self._store.documents[write.id] = _StoredDocument(write, datetime.now(UTC))  # type: ignore[index]

    async def soft_delete(self, document_id: str) -> None:
        if document_id in self._store.documents:
            self._store.documents[document_id].deleted_at = datetime.now(UTC)

    async def purge(self, document_id: str) -> None:
        self._store.documents.pop(document_id, None)

    async def export_all(self) -> list[dict[str, Any]]:
        return [
            {
                "id": d.write.id,
                "ownerId": d.write.owner_id,
                "document": js_loads(d.write.document_json),
                "updatedAt": d.updated_at.isoformat(),
                "deletedAt": d.deleted_at.isoformat() if d.deleted_at else None,
            }
            for d in sorted(self._store.documents.values(), key=lambda d: d.updated_at)
        ]

    async def purge_all(self) -> None:
        self._store.documents.clear()


def memory_repositories(store: MemoryStore) -> Repositories:
    return Repositories(
        users=MemoryUserRepository(store),
        sessions=MemorySessionRepository(store),
        documents=MemoryDocumentRepository(store),
        session_audit=MemorySessionAuditRepository(store),
        releases=MemoryReleaseRepository(store),
    )
