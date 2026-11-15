"""Drop the seven tables the old sql/init.sql created and nothing ever used.

incidents, release_master, reviewers_log, gantt_tasks, test_suites, test_cases
and test_runs held only the sample rows that init.sql inserted. No code reads
or writes them (the app keeps this data elsewhere: test management and
releases in Redis for now, the Incident screen in the browser). They exist only
on databases built by the old init.sql, so a fresh database has nothing to drop
(hence IF EXISTS: the one place a migration is allowed to tolerate a missing
table).

No CASCADE: if anything unexpected depends on one of them, this fails loudly
instead of silently removing it.

Not reversible: the sample data is gone, and the downgrade deliberately does
nothing (it must not recreate empty tables nobody uses).

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-13
"""

from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # One statement, so tables that reference each other (test_cases -> test_suites) go together.
    op.execute(
        "DROP TABLE IF EXISTS test_runs, test_cases, test_suites, gantt_tasks, reviewers_log, release_master, incidents"
    )


def downgrade() -> None:
    pass
