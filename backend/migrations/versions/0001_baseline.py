"""Baseline: the three tables the API actually uses.

This is the schema as sql/init.sql created it, restricted to what the code
reads and writes today: users, sessions, documents. The other tables in the
old init.sql (incidents, release_master, reviewers_log, gantt_tasks,
test_suites, test_cases, test_runs) have no code behind them and are not
carried over.

Tables are created IF NOT EXISTS on purpose: a database that init.sql already
built (every existing dev volume) adopts Alembic with a plain
`alembic upgrade head`, and `alembic stamp 0001` works too. Later migrations
must NOT do this: from 0002 on, a migration that finds its table already there
should fail loudly.

Demo users are not here (migrations also run in production): see
app/db/seed_demo.py.

Revision ID: 0001
Revises:
Create Date: 2026-11-12
"""

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id VARCHAR(64) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            title VARCHAR(255),
            department VARCHAR(255),
            role VARCHAR(64) NOT NULL DEFAULT 'firmware-lead',
            avatar_bg VARCHAR(64) DEFAULT 'from-blue-600 to-indigo-600',
            initials VARCHAR(8) DEFAULT 'MT',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    # Server-side sessions: a random id per sign-in, deleted on logout, so
    # revoking access takes effect immediately (unlike a JWT).
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS sessions (
            id VARCHAR(64) PRIMARY KEY,
            user_id VARCHAR(64) NOT NULL REFERENCES users (id) ON DELETE CASCADE,
            expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS documents (
            id VARCHAR(64) PRIMARY KEY,
            doc_number VARCHAR(64) NOT NULL,
            title VARCHAR(255) NOT NULL,
            subtitle VARCHAR(255),
            author VARCHAR(255),
            department VARCHAR(255),
            doc_date DATE,
            version VARCHAR(32) DEFAULT '1.0',
            classification VARCHAR(32) DEFAULT 'INTERNAL ONLY',
            status VARCHAR(32) DEFAULT 'APPROVED',
            template_type VARCHAR(64) DEFAULT 'technical-analysis',
            document_json JSONB NOT NULL,
            -- Soft delete: the API never destroys a document, it stops returning it.
            deleted_at TIMESTAMP WITH TIME ZONE,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE documents")
    op.execute("DROP TABLE sessions")
    op.execute("DROP TABLE users")
