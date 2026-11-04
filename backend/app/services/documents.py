import secrets
from datetime import UTC, datetime
from typing import Any

from app.core.errors import ApiError
from app.core.jscompat import js_dumps, js_iso_date, js_opt, js_spread, js_truthy
from app.db.params import pg_param
from app.models.document import DocumentRecord, DocumentWrite
from app.models.user import User
from app.repositories.base import DocumentRepository
from app.repositories.document_history import DocumentHistoryStore
from app.services.permissions import can_delete_document, can_edit_document, is_admin, is_visible

VALID_STATUSES = ("DRAFT", "IN_REVIEW", "APPROVED", "PUBLISHED")
NOT_FOUND = "Document not found."
# Automatic snapshots: at most one per document in this window, so history
# holds meaningful restore points rather than every autosave.
SNAPSHOT_INTERVAL_SECONDS = 5 * 60


def _with_updated_at(record: DocumentRecord) -> dict[str, Any]:
    # updatedAt lets the client tell a document it already has apart from
    # one that changed on the server since (syncFromBackend on the frontend).
    document = js_spread(record.document_json)
    document["updatedAt"] = js_iso_date(record.updated_at)
    return document


def _status_is_valid(status: Any) -> bool:
    return isinstance(status, str) and status in VALID_STATUSES


def _iso(moment: datetime) -> str:
    return moment.isoformat(timespec="milliseconds").replace("+00:00", "Z")


class DocumentService:
    def __init__(self, documents: DocumentRepository, history: DocumentHistoryStore) -> None:
        self._documents = documents
        self._history = history

    async def _snapshot(self, record: DocumentRecord, label: str, user: User) -> None:
        now = datetime.now(UTC)
        await self._history.add(
            record.id,
            {
                "id": f"{record.id}-{int(now.timestamp() * 1000)}-{secrets.token_hex(2)}",
                "savedAt": js_iso_date(record.updated_at),  # when this version was saved
                "takenAt": _iso(now),
                "label": label,
                "takenBy": user.name,
                "doc": js_spread(record.document_json),
            },
        )

    async def _snapshot_if_due(self, record: DocumentRecord, new_document: dict[str, Any], user: User) -> None:
        if record.document_json == new_document:
            return
        latest = await self._history.latest(record.id)
        if latest is not None:
            taken = datetime.fromisoformat(latest["takenAt"].replace("Z", "+00:00"))
            if (datetime.now(UTC) - taken).total_seconds() < SNAPSHOT_INTERVAL_SECONDS:
                return
        await self._snapshot(record, "Auto-saved version", user)

    async def list_visible(self, user: User) -> list[dict[str, Any]]:
        records = await self._documents.list_active()
        return [_with_updated_at(r) for r in records if is_visible(user, r)]

    async def get_visible(self, user: User, document_id: str) -> dict[str, Any]:
        record = await self._documents.get_active(document_id)
        if record is None or not is_visible(user, record):
            raise ApiError(404, NOT_FOUND)
        return _with_updated_at(record)

    async def save(self, user: User, document_id: str, body: Any) -> dict[str, Any]:
        metadata = js_opt(body, "metadata")
        sections = js_opt(body, "sections")
        if not js_truthy(metadata) or not isinstance(metadata, dict | list) or not isinstance(sections, list):
            raise ApiError(400, "Body must be a document with metadata and sections.")
        status = js_opt(metadata, "status")
        if js_truthy(status) and not _status_is_valid(status):
            raise ApiError(400, f"status must be one of {', '.join(VALID_STATUSES)}.")

        existing = await self._documents.get_active(document_id)
        if existing is not None and not can_edit_document(user, existing):
            raise ApiError(403, "You can only edit documents you authored.")

        # A non-admin cannot author on someone else's behalf, and cannot use
        # an edit to hand a document to a different author and lock
        # themselves out.
        requested_author = js_opt(metadata, "author")
        author = (requested_author if js_truthy(requested_author) else user.name) if is_admin(user) else user.name
        saved_metadata = js_spread(metadata)
        saved_metadata["id"] = document_id
        saved_metadata["author"] = author
        document = {"metadata": saved_metadata, "sections": sections}
        if existing is not None:
            await self._snapshot_if_due(existing, document, user)

        date = saved_metadata.get("date")
        await self._documents.upsert(
            DocumentWrite(
                id=pg_param(document_id),
                doc_number=pg_param(saved_metadata.get("docNumber")),
                title=pg_param(saved_metadata.get("title")),
                subtitle=pg_param(saved_metadata.get("subtitle")),
                author=pg_param(author),
                department=pg_param(saved_metadata.get("department")),
                doc_date=pg_param(date) if js_truthy(date) else None,
                version=pg_param(saved_metadata.get("version")),
                classification=pg_param(saved_metadata.get("classification")),
                status=pg_param(saved_metadata.get("status")),
                template_type=pg_param(saved_metadata.get("templateType")),
                document_json=js_dumps(document),
            )
        )
        return document

    async def soft_delete(self, user: User, document_id: str) -> None:
        """Soft delete, mirroring the app's Doc Bin convention."""
        existing = await self._documents.get_active(document_id)
        if existing is None:
            raise ApiError(404, NOT_FOUND)
        if not can_delete_document(user, existing):
            raise ApiError(403, "You can only delete documents you authored.")
        await self._documents.soft_delete(document_id)

    async def purge(self, user: User, document_id: str) -> None:
        """Permanently removes a document, including one already soft-deleted
        (the Doc Bin's "permanently delete"). Same author-or-admin rule."""
        existing = await self._documents.get_including_deleted(document_id)
        if existing is None:
            raise ApiError(404, NOT_FOUND)
        if not can_delete_document(user, existing):
            raise ApiError(403, "You can only delete documents you authored.")
        await self._documents.purge(document_id)
        await self._history.delete(document_id)

    async def history(self, user: User, document_id: str) -> list[dict[str, Any]]:
        """Earlier versions, newest first - for anyone who can see the document."""
        await self.get_visible(user, document_id)
        return await self._history.list(document_id)

    async def restore(self, user: User, document_id: str, snapshot_id: str) -> dict[str, Any]:
        """Makes an earlier version current. The version being replaced is
        kept in history first, so a restore can itself be undone."""
        record = await self._documents.get_active(document_id)
        if record is None or not is_visible(user, record):
            raise ApiError(404, NOT_FOUND)
        if not can_edit_document(user, record):
            raise ApiError(403, "You can only edit documents you authored.")
        snapshot = next((s for s in await self._history.list(document_id) if s["id"] == snapshot_id), None)
        if snapshot is None:
            raise ApiError(404, "That version is no longer in the history.")
        await self._snapshot(record, "Before restore", user)
        return await self.save(user, document_id, snapshot["doc"])
