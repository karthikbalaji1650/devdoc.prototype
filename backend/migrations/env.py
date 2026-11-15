"""Alembic environment.

The schema is plain SQL (the app talks to Postgres through psycopg, not an
ORM), so there is no model metadata to autogenerate from: every migration is
written by hand with `op.execute(...)`.
"""

import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool

from app.core.config import Settings

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)


def database_url() -> str:
    # ALEMBIC_DATABASE_URL lets a one-off run (or the tests) target another database.
    url = os.environ.get("ALEMBIC_DATABASE_URL") or Settings().database_url
    if not url:
        raise RuntimeError("DATABASE_URL is not set; Alembic needs it to know which database to migrate.")
    # SQLAlchemy needs to be told to use psycopg 3 (the driver the app uses).
    for prefix in ("postgresql://", "postgres://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix) :]
    return url


def run_migrations_offline() -> None:
    """`alembic upgrade head --sql`: print the SQL instead of running it."""
    context.configure(url=database_url(), literal_binds=True, dialect_opts={"paramstyle": "named"})
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(database_url(), poolclass=pool.NullPool)
    with engine.connect() as connection:
        context.configure(connection=connection)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
