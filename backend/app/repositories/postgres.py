"""Postgres repositories: the exact statements the Node API issued."""

import hashlib
import secrets
from datetime import datetime
from typing import Any

from psycopg_pool import AsyncConnectionPool

from app.models.document import DocumentRecord, DocumentWrite
from app.models.user import LoginCandidate, User
from app.repositories.base import Repositories, iso_z
from app.repositories.releases_postgres import PgReleaseRepository

_DOC_COLUMNS = "id, author, owner_id, status, document_json, updated_at"


class _PgRepository:
    def __init__(self, pool: AsyncConnectionPool) -> None:
        self._pool = pool

    async def _fetch(self, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(sql, params)
            return await cur.fetchall() if cur.description else []


class PgUserRepository(_PgRepository):
    async def find_login_candidate(self, email_lower: str) -> LoginCandidate | None:
        rows = await self._fetch("SELECT id, password FROM users WHERE lower(email) = %s", (email_lower,))
        return LoginCandidate(id=rows[0]["id"], password=rows[0]["password"]) if rows else None

    async def find_by_name(self, name: str) -> list[User]:
        rows = await self._fetch(
            """SELECT id, name, email, title, department, role, avatar_bg, initials
                 FROM users WHERE lower(btrim(name)) = lower(btrim(%s)) ORDER BY id""",
            (name,),
        )
        return [User(**r) for r in rows]

    async def find_by_ids(self, user_ids: list[str]) -> list[User]:
        rows = await self._fetch(
            """SELECT id, name, email, title, department, role, avatar_bg, initials
                 FROM users WHERE id = ANY(%s) ORDER BY id""",
            (list(dict.fromkeys(user_ids)),),
        )
        return [User(**r) for r in rows]

    async def search(self, query: str, limit: int) -> list[User]:
        like = "%" + query.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        rows = await self._fetch(
            """SELECT id, name, email, title, department, role, avatar_bg, initials
                 FROM users
                WHERE name ILIKE %(q)s OR coalesce(title, '') ILIKE %(q)s OR coalesce(department, '') ILIKE %(q)s
                ORDER BY lower(name), id LIMIT %(n)s""",
            {"q": like, "n": limit},
        )
        return [User(**r) for r in rows]


class PgSessionRepository(_PgRepository):
    async def create(self, session_id: str, user_id: str, expires_at: datetime) -> None:
        await self._fetch(
            "INSERT INTO sessions (id, user_id, expires_at) VALUES (%s, %s, %s)", (session_id, user_id, expires_at)
        )

    async def delete(self, session_id: str) -> None:
        await self._fetch("DELETE FROM sessions WHERE id = %s", (session_id,))

    async def find_active_user(self, session_id: str) -> User | None:
        rows = await self._fetch(
            """SELECT u.id, u.name, u.email, u.title, u.department, u.role, u.avatar_bg, u.initials
                 FROM sessions s JOIN users u ON u.id = s.user_id
                WHERE s.id = %s AND s.expires_at > now()""",
            (session_id,),
        )
        return User(**rows[0]) if rows else None


class PgSessionAuditRepository(_PgRepository):
    async def record_login(self, session_id: str, user: User, login_at: datetime, expires_at: datetime) -> None:
        await self._fetch(
            """INSERT INTO session_audit (id, session_id_hash, user_id, user_name, role, login_at, expires_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s)""",
            (secrets.token_hex(8), _session_hash(session_id), user.id, user.name, user.role, login_at, expires_at),
        )

    async def record_logout(self, session_id: str, logout_at: datetime) -> None:
        # Once only, and not for a session that had already timed out: it stays "expired".
        await self._fetch(
            """UPDATE session_audit SET logout_at = %s
                WHERE session_id_hash = %s AND logout_at IS NULL AND expires_at > %s""",
            (logout_at, _session_hash(session_id), logout_at),
        )

    async def recent(self, limit: int = 200, user_id: str | None = None) -> list[dict[str, Any]]:
        if user_id is None:
            rows = await self._fetch(f"{_AUDIT_SELECT} ORDER BY login_at DESC, seq DESC LIMIT %s", (limit,))
        else:
            rows = await self._fetch(
                f"{_AUDIT_SELECT} WHERE user_id = %s ORDER BY login_at DESC, seq DESC LIMIT %s",
                (user_id, limit),
            )
        return [_audit_entry(r) for r in rows]

    async def export_all(self) -> list[dict[str, Any]]:
        return [_audit_entry(r) for r in await self._fetch(f"{_AUDIT_SELECT} ORDER BY login_at, seq")]


_AUDIT_SELECT = "SELECT id, user_id, user_name, role, login_at, logout_at, expires_at FROM session_audit"


def _audit_entry(r: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": r["id"],
        "userId": r["user_id"],
        "userName": r["user_name"],
        "role": r["role"],
        "loginTime": iso_z(r["login_at"]),
        "logoutTime": iso_z(r["logout_at"]) if r["logout_at"] else None,
        "expiresAt": iso_z(r["expires_at"]),
    }


def _session_hash(session_id: str) -> str:
    return hashlib.sha256(session_id.encode()).hexdigest()


def _record(row: dict[str, Any]) -> DocumentRecord:
    return DocumentRecord(**row)


class PgDocumentRepository(_PgRepository):
    async def list_active(self) -> list[DocumentRecord]:
        rows = await self._fetch(
            f"SELECT {_DOC_COLUMNS} FROM documents WHERE deleted_at IS NULL ORDER BY updated_at DESC"
        )
        return [_record(r) for r in rows]

    async def get_active(self, document_id: str) -> DocumentRecord | None:
        rows = await self._fetch(
            f"SELECT {_DOC_COLUMNS} FROM documents WHERE id = %s AND deleted_at IS NULL", (document_id,)
        )
        return _record(rows[0]) if rows else None

    async def get_including_deleted(self, document_id: str) -> DocumentRecord | None:
        rows = await self._fetch(f"SELECT {_DOC_COLUMNS} FROM documents WHERE id = %s", (document_id,))
        return _record(rows[0]) if rows else None

    async def upsert(self, write: DocumentWrite) -> None:
        await self._fetch(
            """INSERT INTO documents (id, doc_number, title, subtitle, author, owner_id, department, doc_date,
                                      version, classification, status, template_type, document_json, updated_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now())
               ON CONFLICT (id) DO UPDATE SET
                 doc_number = EXCLUDED.doc_number, title = EXCLUDED.title, subtitle = EXCLUDED.subtitle,
                 author = EXCLUDED.author, owner_id = EXCLUDED.owner_id, department = EXCLUDED.department,
                 doc_date = EXCLUDED.doc_date,
                 version = EXCLUDED.version, classification = EXCLUDED.classification, status = EXCLUDED.status,
                 template_type = EXCLUDED.template_type, document_json = EXCLUDED.document_json,
                 updated_at = now(), deleted_at = NULL""",
            (
                write.id,
                write.doc_number,
                write.title,
                write.subtitle,
                write.author,
                write.owner_id,
                write.department,
                write.doc_date,
                write.version,
                write.classification,
                write.status,
                write.template_type,
                write.document_json,
            ),
        )

    async def soft_delete(self, document_id: str) -> None:
        await self._fetch("UPDATE documents SET deleted_at = now() WHERE id = %s", (document_id,))

    async def purge(self, document_id: str) -> None:
        await self._fetch("DELETE FROM documents WHERE id = %s", (document_id,))

    async def export_all(self) -> list[dict[str, Any]]:
        rows = await self._fetch(
            "SELECT id, owner_id, document_json, updated_at, deleted_at FROM documents ORDER BY updated_at"
        )
        return [
            {
                "id": r["id"],
                "ownerId": r["owner_id"],
                "document": r["document_json"],
                "updatedAt": r["updated_at"].isoformat(),
                "deletedAt": r["deleted_at"].isoformat() if r["deleted_at"] else None,
            }
            for r in rows
        ]

    async def purge_all(self) -> None:
        await self._fetch("DELETE FROM documents")


def postgres_repositories(pool: AsyncConnectionPool) -> Repositories:
    return Repositories(
        users=PgUserRepository(pool),
        sessions=PgSessionRepository(pool),
        documents=PgDocumentRepository(pool),
        session_audit=PgSessionAuditRepository(pool),
        releases=PgReleaseRepository(pool),
    )
