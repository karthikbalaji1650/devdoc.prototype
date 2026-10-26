from dataclasses import dataclass
from datetime import datetime
from typing import Any


@dataclass(frozen=True)
class DocumentRecord:
    """A row of `documents` as the routes read it. `author` and `status`
    are the indexed columns permission checks use - not the copies inside
    `document_json`."""

    id: str
    author: str | None
    status: str | None
    document_json: Any
    updated_at: datetime


@dataclass(frozen=True)
class DocumentWrite:
    """Column values for an upsert, already converted to the text form
    node-postgres sent (see services.documents.pg_param)."""

    id: str | None
    doc_number: str | None
    title: str | None
    subtitle: str | None
    author: str | None
    department: str | None
    doc_date: str | None
    version: str | None
    classification: str | None
    status: str | None
    template_type: str | None
    document_json: str
