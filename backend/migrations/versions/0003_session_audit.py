"""session_audit: the sign-in audit log (DDS-SRS-011), moved from Redis.

One row per sign-in. Differences from the Redis version, all deliberate:

- Nothing is ever trimmed. The Redis store silently dropped everything past the
  newest 1,000 entries, which an audit log must not do.
- Append-only, enforced by database triggers, not just by app code: rows cannot
  be deleted or truncated, and an update may only fill in `logout_at` once.
  This guards against bugs and mistakes. It does NOT yet stop someone holding
  the app's database login: the app connects as the database owner (a
  superuser), who can disable a trigger. Tamper-proofing needs the restricted
  application user, which is deferred to deployment preparation.
- No foreign key to users. The audit row must outlive the user it describes, so
  the name and role are copied at sign-in (they record what was true then).
- Only a sha256 of the session id is stored, never the id itself.
- Existing Redis audit entries are not copied: they were dev data (decided with
  the owner). Old `dds:audit:sessions*` and `dds:audit:open:*` keys can be
  deleted from Redis by hand.

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-13
"""

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Deliberately plain CREATE (not IF NOT EXISTS): from 0002 on, finding the
    # table already there should fail loudly.
    op.execute(
        """
        CREATE TABLE session_audit (
            seq BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            id VARCHAR(32) NOT NULL UNIQUE,
            session_id_hash CHAR(64) NOT NULL UNIQUE,
            user_id VARCHAR(64) NOT NULL,
            user_name VARCHAR(255) NOT NULL,
            role VARCHAR(64) NOT NULL,
            login_at TIMESTAMP WITH TIME ZONE NOT NULL,
            logout_at TIMESTAMP WITH TIME ZONE,
            expires_at TIMESTAMP WITH TIME ZONE NOT NULL
        )
        """
    )
    # The audit view lists the newest sign-ins first.
    op.execute("CREATE INDEX session_audit_login_at_idx ON session_audit (login_at DESC, seq DESC)")
    op.execute(
        """
        CREATE FUNCTION session_audit_guard() RETURNS trigger AS $$
        BEGIN
            IF TG_OP = 'UPDATE'
               AND OLD.logout_at IS NULL
               AND NEW.logout_at IS NOT NULL
               AND (NEW.seq, NEW.id, NEW.session_id_hash, NEW.user_id, NEW.user_name,
                    NEW.role, NEW.login_at, NEW.expires_at)
                   IS NOT DISTINCT FROM
                   (OLD.seq, OLD.id, OLD.session_id_hash, OLD.user_id, OLD.user_name,
                    OLD.role, OLD.login_at, OLD.expires_at)
            THEN
                RETURN NEW;
            END IF;
            RAISE EXCEPTION 'session_audit is append-only (only a logout time can be added, once)';
        END;
        $$ LANGUAGE plpgsql
        """
    )
    op.execute(
        """
        CREATE TRIGGER session_audit_no_rewrite
        BEFORE UPDATE OR DELETE ON session_audit
        FOR EACH ROW EXECUTE FUNCTION session_audit_guard()
        """
    )
    op.execute(
        """
        CREATE TRIGGER session_audit_no_truncate
        BEFORE TRUNCATE ON session_audit
        FOR EACH STATEMENT EXECUTE FUNCTION session_audit_guard()
        """
    )


def downgrade() -> None:
    # Dropping the table is the one deliberate way to remove the audit trail.
    op.execute("DROP TABLE session_audit")
    op.execute("DROP FUNCTION session_audit_guard()")
