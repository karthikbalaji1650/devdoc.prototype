"""Index session_audit by user, for "my sign-ins".

Non-admins now read their own entries from the session audit log
(GET /api/audit/sessions filters by user_id for them). The log is never
trimmed, so without an index that filter would read the whole table.

Reversible: the downgrade drops only this index.

Revision ID: 0007
Revises: 0006
Create Date: 2026-11-15
"""

from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE INDEX session_audit_user_login_at_idx ON session_audit (user_id, login_at DESC, seq DESC)")


def downgrade() -> None:
    op.execute("DROP INDEX session_audit_user_login_at_idx")
