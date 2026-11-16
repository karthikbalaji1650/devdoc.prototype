"""Rename users.title to users.designation.

A rename, so every existing value is kept. The "required" check constraint
(0004) follows the column and is renamed to match. Reversible.

Revision ID: 0009
Revises: 0008
Create Date: 2026-11-15
"""

from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE users RENAME COLUMN title TO designation")
    op.execute("ALTER TABLE users RENAME CONSTRAINT users_title_required TO users_designation_required")


def downgrade() -> None:
    op.execute("ALTER TABLE users RENAME CONSTRAINT users_designation_required TO users_title_required")
    op.execute("ALTER TABLE users RENAME COLUMN designation TO title")
