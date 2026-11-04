"""Postgres repositories: the exact statements the Node API issued."""

from datetime import datetime
from typing import Any

from psycopg_pool import AsyncConnectionPool

from app.models.document import DocumentRecord, DocumentWrite
from app.models.user import LoginCandidate, User
from app.repositories.base import Repositories

_DOC_COLUMNS = "id, author, status, document_json, updated_at"


class _PgRepository:
    def __init__(self, pool: AsyncConnectionPool) -> None:
        self._pool = pool

    async def _fetch(self, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(sql, params)
            return await cur.fetchall() if cur.description else []


class PgUserRepository(_PgRepository):
    async def find_login_candidate(self, email_lower: str) -> LoginCandidate | None:
        rows = await self._fetch("SELECT id, password_hash FROM users WHERE lower(email) = %s", (email_lower,))
        return LoginCandidate(id=rows[0]["id"], password_hash=rows[0]["password_hash"]) if rows else None


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
            """INSERT INTO documents (id, doc_number, title, subtitle, author, department, doc_date, version,
                                      classification, status, template_type, document_json, updated_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now())
               ON CONFLICT (id) DO UPDATE SET
                 doc_number = EXCLUDED.doc_number, title = EXCLUDED.title, subtitle = EXCLUDED.subtitle,
                 author = EXCLUDED.author, department = EXCLUDED.department, doc_date = EXCLUDED.doc_date,
                 version = EXCLUDED.version, classification = EXCLUDED.classification, status = EXCLUDED.status,
                 template_type = EXCLUDED.template_type, document_json = EXCLUDED.document_json,
                 updated_at = now(), deleted_at = NULL""",
            (
                write.id,
                write.doc_number,
                write.title,
                write.subtitle,
                write.author,
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
        rows = await self._fetch("SELECT id, document_json, updated_at, deleted_at FROM documents ORDER BY updated_at")
        return [
            {
                "id": r["id"],
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
    )
