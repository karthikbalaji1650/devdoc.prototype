from typing import Any, Literal

from app.schemas.common import WireModel

DocumentStatus = Literal["DRAFT", "IN_REVIEW", "APPROVED", "PUBLISHED"]


class DocumentMetadata(WireModel):
    id: str
    title: str
    subtitle: str | None = None
    docNumber: str
    author: str
    department: str | None = None
    date: str
    version: str
    classification: str
    status: DocumentStatus
    templateType: str
    logoUrl: str | None = None
    logoPosition: str | None = None
    tags: list[str] | None = None


class DocumentModel(WireModel):
    metadata: DocumentMetadata
    sections: list[Any]


class StoredDocument(DocumentModel):
    """A document as read back: the saved model plus the server's updatedAt
    (ISO 8601, UTC, millisecond precision)."""

    updatedAt: str


class DocumentListResponse(WireModel):
    documents: list[StoredDocument]


class StoredDocumentResponse(WireModel):
    document: StoredDocument


class SavedDocumentResponse(WireModel):
    """PUT echoes the saved model without updatedAt, as Node did."""

    document: DocumentModel
