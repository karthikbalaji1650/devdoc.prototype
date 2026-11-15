"""users.password_hash becomes users.password (temporary, plain text).

DEV-ONLY, by the owner's decision: until the real user directory is connected,
this app keeps its own simple accounts, and the password is stored and compared
as typed. It must NOT carry real users: when the directory arrives, the
password column goes away (single sign-on or the directory checks passwords,
and this app only matches the person by email).

Rows created before this migration still hold bcrypt hashes in the column.
Nobody can log in with them (the hash would have to be typed as the password):
recreate those users with `python -m app.db.create_user`, or delete them.

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-13
"""

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE users RENAME COLUMN password_hash TO password")


def downgrade() -> None:
    # Plain passwords written since 0002 are NOT hashes: users created after
    # the upgrade cannot log in under the old code until they get a bcrypt hash.
    op.execute("ALTER TABLE users RENAME COLUMN password TO password_hash")
