"""Storage interfaces the services depend on.

Two implementations exist: `postgres` (production, the same SQL the Node
API ran) and `memory` (tests and the browser-test harness - the role
pg-mem played for the Node API, so neither needs a database).
"""

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Protocol

from app.models.document import DocumentRecord, DocumentWrite
from app.models.user import LoginCandidate, User
from app.repositories.releases import ReleaseRepository


def iso_z(moment: datetime) -> str:
    """UTC, millisecond precision, a trailing Z: the format the API has always returned."""
    return moment.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class UserRepository(Protocol):
    async def find_login_candidate(self, email_lower: str) -> LoginCandidate | None: ...

    async def find_by_name(self, name: str) -> list[User]:
        """Every user whose name equals `name`, ignoring case and surrounding spaces."""
        ...

    async def find_by_ids(self, user_ids: list[str]) -> list[User]:
        """The users that exist among `user_ids` (unknown ids are left out)."""
        ...

    async def search(self, query: str, limit: int) -> list[User]:
        """Users whose name, title or department contains `query` (ignoring case
        and surrounding spaces; `%` and `_` are plain text), by name, at most
        `limit`. An empty query matches everyone."""
        ...


class SessionRepository(Protocol):
    async def create(self, session_id: str, user_id: str, expires_at: datetime) -> None: ...

    async def delete(self, session_id: str) -> None: ...

    async def find_active_user(self, session_id: str) -> User | None: ...


class SessionAuditRepository(Protocol):
    """The sign-in audit log (DDS-SRS-011): append-only, never trimmed."""

    async def record_login(self, session_id: str, user: User, login_at: datetime, expires_at: datetime) -> None: ...

    async def record_logout(self, session_id: str, logout_at: datetime) -> None:
        """Marks the session's entry signed out. Does nothing if the session is
        unknown, already signed out, or had already expired."""
        ...

    async def recent(self, limit: int = 200, user_id: str | None = None) -> list[dict[str, Any]]:
        """Newest sign-in first: id, userId, userName, role, loginTime,
        logoutTime, expiresAt (ISO strings). With `user_id`, only that
        user's sign-ins."""
        ...

    async def export_all(self) -> list[dict[str, Any]]:
        """Every entry, oldest first, same shape as `recent` - for the admin backup."""
        ...


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
    session_audit: SessionAuditRepository
    releases: ReleaseRepository
