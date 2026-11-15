"""Release management (DDS-SRS-033 - 046), moved from Redis to Postgres.

releases            one row per release; the readiness rules, blocker query and
                    last blocker sync live on it. The version is unique ignoring
                    case and surrounding spaces. Never deleted: a release is
                    cancelled.
release_milestones  the five SRS-038 milestones, planned and actual dates.
release_signers     the 2 to 5 people who sign off (the limits are the
                    service's rule; the creator is always one of them).
release_builds      RC and Final builds. Numbers are unique per release and at
                    most one build per release is Final.
release_build_runs  test runs linked to a build. No foreign key to the runs
                    until test management moves to Postgres.
release_signoffs    one decision per person per build. A person removed from
                    the signers keeps their row (history); it just stops counting.
release_blockers    Jira / GitHub issues blocking a release.
release_audit       append-only and hash-chained (SRS-046); a trigger refuses
                    every UPDATE, DELETE and TRUNCATE.

Nothing is copied over: the Redis data was the two sample releases, which are
deleted by hand (dds:rel:* and dds:audit:releases:*).

Revision ID: 0008
Revises: 0007
Create Date: 2026-11-15
"""

from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE releases (
            id VARCHAR(64) PRIMARY KEY,
            version VARCHAR(100) NOT NULL CHECK (btrim(version) <> ''),
            title VARCHAR(255),
            type VARCHAR(16) NOT NULL CHECK (type IN ('Major', 'Minor', 'Patch', 'Hotfix')),
            target_date DATE NOT NULL,
            segment VARCHAR(255),
            status VARCHAR(16) NOT NULL DEFAULT 'Planned'
                CHECK (status IN ('Planned', 'In Progress', 'RC Frozen', 'Approved', 'Deployed', 'Cancelled')),
            notes TEXT NOT NULL DEFAULT '',
            gate_min_pass_rate DOUBLE PRECISION NOT NULL DEFAULT 98
                CHECK (gate_min_pass_rate >= 0 AND gate_min_pass_rate <= 100),
            gate_require_no_blockers BOOLEAN NOT NULL DEFAULT TRUE,
            gate_mandatory_suite_ids TEXT[] NOT NULL DEFAULT '{}',
            blocker_query JSONB,
            blocker_sync JSONB,
            blockers_sync_slot BIGINT,
            cancelled_reason TEXT,
            cancelled_at TIMESTAMP WITH TIME ZONE,
            created_by VARCHAR(64) NOT NULL REFERENCES users (id),
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            CHECK ((status = 'Cancelled') = (cancelled_reason IS NOT NULL))
        )
        """
    )
    op.execute("CREATE UNIQUE INDEX releases_version_unique ON releases (lower(btrim(version)))")
    op.execute("CREATE INDEX releases_created_idx ON releases (created_at, id)")

    op.execute(
        """
        CREATE TABLE release_milestones (
            release_id VARCHAR(64) NOT NULL REFERENCES releases (id),
            key VARCHAR(32) NOT NULL
                CHECK (key IN ('code-freeze', 'rc-build', 'qa-regression', 'final-signoff', 'ga')),
            planned_date DATE,
            actual_date DATE,
            PRIMARY KEY (release_id, key)
        )
        """
    )
    op.execute(
        """
        CREATE TABLE release_signers (
            release_id VARCHAR(64) NOT NULL REFERENCES releases (id),
            user_id VARCHAR(64) NOT NULL REFERENCES users (id),
            position SMALLINT NOT NULL,
            added_by VARCHAR(64) NOT NULL REFERENCES users (id),
            added_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            PRIMARY KEY (release_id, user_id)
        )
        """
    )
    op.execute(
        """
        CREATE TABLE release_builds (
            release_id VARCHAR(64) NOT NULL REFERENCES releases (id),
            id VARCHAR(64) NOT NULL,
            number INTEGER NOT NULL,
            label VARCHAR(160) NOT NULL,
            kind VARCHAR(8) NOT NULL DEFAULT 'RC' CHECK (kind IN ('RC', 'Final')),
            image_name VARCHAR(500) NOT NULL,
            commit_sha VARCHAR(40),
            branch_tag VARCHAR(255),
            artifact_url TEXT NOT NULL,
            repository VARCHAR(32) NOT NULL,
            sha256 CHAR(64) NOT NULL,
            built_at VARCHAR(64),
            pipeline_build_id VARCHAR(255),
            gate_override_by VARCHAR(64) REFERENCES users (id),
            gate_override_reason TEXT,
            gate_override_at TIMESTAMP WITH TIME ZONE,
            promoted_by VARCHAR(64) REFERENCES users (id),
            promoted_at TIMESTAMP WITH TIME ZONE,
            created_by VARCHAR(64) NOT NULL REFERENCES users (id),
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            PRIMARY KEY (release_id, id),
            UNIQUE (release_id, number),
            CHECK ((gate_override_reason IS NULL) = (gate_override_by IS NULL)),
            CHECK ((kind = 'Final') = (promoted_by IS NOT NULL))
        )
        """
    )
    op.execute("CREATE UNIQUE INDEX release_builds_one_final ON release_builds (release_id) WHERE kind = 'Final'")
    op.execute(
        """
        CREATE TABLE release_build_runs (
            release_id VARCHAR(64) NOT NULL,
            build_id VARCHAR(64) NOT NULL,
            test_run_id VARCHAR(128) NOT NULL,
            position SMALLINT NOT NULL,
            PRIMARY KEY (release_id, build_id, test_run_id),
            FOREIGN KEY (release_id, build_id) REFERENCES release_builds (release_id, id)
        )
        """
    )
    op.execute(
        """
        CREATE TABLE release_signoffs (
            release_id VARCHAR(64) NOT NULL,
            build_id VARCHAR(64) NOT NULL,
            user_id VARCHAR(64) NOT NULL REFERENCES users (id),
            decision VARCHAR(16) NOT NULL CHECK (decision IN ('Approved', 'Rejected')),
            comment TEXT,
            decided_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            PRIMARY KEY (release_id, build_id, user_id),
            FOREIGN KEY (release_id, build_id) REFERENCES release_builds (release_id, id),
            CHECK (decision = 'Approved' OR btrim(coalesce(comment, '')) <> '')
        )
        """
    )
    op.execute(
        """
        CREATE TABLE release_blockers (
            id VARCHAR(64) PRIMARY KEY,
            release_id VARCHAR(64) NOT NULL REFERENCES releases (id),
            tracker VARCHAR(16) NOT NULL CHECK (tracker IN ('Jira', 'GitHub')),
            key VARCHAR(255) NOT NULL,
            title TEXT,
            url TEXT,
            severity VARCHAR(16) NOT NULL CHECK (severity IN ('Blocker', 'Critical', 'Major', 'Minor')),
            status VARCHAR(16) NOT NULL CHECK (status IN ('Open', 'Closed')),
            source VARCHAR(16) NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'linked', 'synced')),
            sync_note TEXT,
            synced_at TIMESTAMP WITH TIME ZONE,
            created_by VARCHAR(255) NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            UNIQUE (release_id, tracker, key)
        )
        """
    )

    op.execute(
        """
        CREATE TABLE release_audit (
            id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            release_id VARCHAR(64) NOT NULL REFERENCES releases (id),
            seq INTEGER NOT NULL,
            at VARCHAR(32) NOT NULL,
            actor_id VARCHAR(64) NOT NULL,
            actor VARCHAR(255) NOT NULL,
            actor_role VARCHAR(64) NOT NULL,
            action VARCHAR(64) NOT NULL,
            details JSONB NOT NULL,
            prev_hash CHAR(64) NOT NULL,
            hash CHAR(64) NOT NULL,
            UNIQUE (release_id, seq)
        )
        """
    )
    op.execute(
        """
        CREATE FUNCTION release_audit_guard() RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION 'release_audit is append-only';
        END;
        $$ LANGUAGE plpgsql
        """
    )
    op.execute(
        """
        CREATE TRIGGER release_audit_no_rewrite
        BEFORE UPDATE OR DELETE ON release_audit
        FOR EACH ROW EXECUTE FUNCTION release_audit_guard()
        """
    )
    op.execute(
        """
        CREATE TRIGGER release_audit_no_truncate
        BEFORE TRUNCATE ON release_audit
        FOR EACH STATEMENT EXECUTE FUNCTION release_audit_guard()
        """
    )


def downgrade() -> None:
    # Dropping release_audit is the one deliberate way to remove the audit trail.
    op.execute("DROP TABLE release_audit")
    op.execute("DROP FUNCTION release_audit_guard()")
    for table in (
        "release_blockers",
        "release_signoffs",
        "release_build_runs",
        "release_builds",
        "release_signers",
        "release_milestones",
        "releases",
    ):
        op.execute(f"DROP TABLE {table}")
