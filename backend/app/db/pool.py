from psycopg import AsyncConnection
from psycopg.rows import dict_row
from psycopg.types.json import set_json_loads
from psycopg_pool import AsyncConnectionPool

from app.core.jscompat import js_loads


async def _configure(conn: AsyncConnection) -> None:
    # node-postgres decoded json/jsonb with JSON.parse, so numbers and key
    # order come back the way JS saw them, not the way Python would.
    set_json_loads(js_loads, conn)


def create_pool(database_url: str) -> AsyncConnectionPool:
    """Lazy like `new pg.Pool()`: the API starts even if Postgres is not up
    yet, and connects on first use."""
    return AsyncConnectionPool(
        database_url,
        open=False,
        configure=_configure,
        # Verify a pooled connection before use: after a Postgres restart the
        # idle ones are dead, and node-postgres likewise dropped idle clients
        # that errored instead of failing the next request with them.
        check=AsyncConnectionPool.check_connection,
        kwargs={"row_factory": dict_row, "autocommit": True},
    )
