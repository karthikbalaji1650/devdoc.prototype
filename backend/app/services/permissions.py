"""Server-side copy of the rules the frontend applies (src/services/
permissions.ts). Every route re-checks these itself rather than trusting
the browser."""

from app.models.document import DocumentRecord
from app.models.user import User


def is_admin(user: User) -> bool:
    return user.role == "admin"


def can_edit_document(user: User, doc: DocumentRecord) -> bool:
    """Admins, and the document's owner. A document with no owner (its author
    matched no single user) can be edited by admins only, until one is assigned."""
    return is_admin(user) or (doc.owner_id is not None and doc.owner_id == user.id)


can_delete_document = can_edit_document


def is_visible(user: User, doc: DocumentRecord) -> bool:
    return is_admin(user) or doc.status in ("DRAFT", "IN_REVIEW")
