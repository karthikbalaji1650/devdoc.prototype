from typing import Any

from app.core.errors import ApiError
from app.core.jscompat import js_dumps, js_iso_date, js_opt, js_spread, js_truthy
from app.db.params import pg_param
from app.models.document import DocumentRecord, DocumentWrite
from app.models.user import User
from app.repositories.base import DocumentRepository
from app.services.permissions import can_delete_document, can_edit_document, is_admin, is_visible

VALID_STATUSES = ("DRAFT", "IN_REVIEW", "APPROVED", "PUBLISHED")
NOT_FOUND = "Document not found."


def _with_updated_at(record: DocumentRecord) -> dict[str, Any]:
    # updatedAt lets the client tell a document it already has apart from
    # one that changed on the server since (syncFromBackend on the frontend).
    document = js_spread(record.document_json)
    document["updatedAt"] = js_iso_date(record.updated_at)
    return document


def _status_is_valid(status: Any) -> bool:
    return isinstance(status, str) and status in VALID_STATUSES


class DocumentService:
    def __init__(self, documents: DocumentRepository) -> None:
        self._documents = documents

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
