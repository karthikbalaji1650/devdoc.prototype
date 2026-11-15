"""documents.owner_id: ownership by user id instead of by display name.

Until now "my document" meant `documents.author = users.name`: two people
with one name shared edit rights, and renaming a user locked them out. The
owner is now a user id. `author` stays as the name shown on the document.

Existing documents are matched to an owner by name (ignoring case and
surrounding spaces) ONLY when exactly one user has that name. A document whose
author matches no user, or several, is left with no owner: only admins can
edit it until an admin assigns one. Nothing is guessed.

ON DELETE RESTRICT: a user who owns documents cannot be deleted until the
documents are reassigned, so documents are never orphaned.

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-13
"""

from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE documents ADD COLUMN owner_id VARCHAR(64) REFERENCES users (id) ON DELETE RESTRICT")
    op.execute("CREATE INDEX documents_owner_id_idx ON documents (owner_id)")
    op.execute(
        """
        UPDATE documents d SET owner_id = m.user_id
          FROM (SELECT d2.id AS doc_id, min(u.id) AS user_id
                  FROM documents d2
                  JOIN users u ON lower(btrim(u.name)) = lower(btrim(d2.author))
                 GROUP BY d2.id
                HAVING count(*) = 1) m
         WHERE d.id = m.doc_id
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX documents_owner_id_idx")
    op.execute("ALTER TABLE documents DROP COLUMN owner_id")
