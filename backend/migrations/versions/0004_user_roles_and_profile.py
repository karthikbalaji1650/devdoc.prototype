"""Two account roles (admin, user) and a required title and department.

Decided with the owner, from the SRS (it only ever says "user" and "admin"):
positions such as firmware-lead or release-manager are no longer tracked on
accounts. Every non-admin becomes `user`, and the database now refuses any
other role, so a typo cannot quietly make someone a non-admin.

Title and department are required for every user. The check is NOT VALID: it
applies to every new and changed row, but does not fail on users that already
exist without them (nothing is invented for those; fill them in and run
`ALTER TABLE users VALIDATE CONSTRAINT users_title_required` when ready).

Not reversible in data: the old position values are gone after the upgrade.
`session_audit` is untouched: old entries keep the role they were written with.

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-13
"""

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE users SET role = 'user' WHERE role <> 'admin'")
    op.execute("ALTER TABLE users ALTER COLUMN role SET DEFAULT 'user'")
    op.execute("ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'user'))")
    op.execute(
        """
        ALTER TABLE users ADD CONSTRAINT users_title_required
        CHECK (title IS NOT NULL AND btrim(title) <> '') NOT VALID
        """
    )
    op.execute(
        """
        ALTER TABLE users ADD CONSTRAINT users_department_required
        CHECK (department IS NOT NULL AND btrim(department) <> '') NOT VALID
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP CONSTRAINT users_department_required")
    op.execute("ALTER TABLE users DROP CONSTRAINT users_title_required")
    op.execute("ALTER TABLE users DROP CONSTRAINT users_role_check")
    op.execute("ALTER TABLE users ALTER COLUMN role SET DEFAULT 'firmware-lead'")
