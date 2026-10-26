"""Standalone API for the browser tests (e2e/backend-login.spec.ts and
e2e/remote-test-execution.spec.ts): the real app on in-memory
repositories seeded with the test users, so no database is needed.
Started and killed by those specs; prints `READY <users json>` once up.

    PORT=4111 FRONTEND_ORIGIN=http://localhost:5199 uv run python -m tests.e2e_server
"""

import json
import os

import uvicorn

from app.main import create_app
from app.repositories.memory import memory_repositories
from tests.seed import TEST_USERS, seeded_store, test_settings


def main() -> None:
    port = int(os.environ.get("PORT") or 4111)
    origin = os.environ.get("FRONTEND_ORIGIN", "http://localhost:5199")
    app = create_app(test_settings(cors_origins=origin), repositories=memory_repositories(seeded_store()))
    config = uvicorn.Config(
        app, host="127.0.0.1", port=port, log_level="warning", proxy_headers=False, server_header=False
    )
    server = uvicorn.Server(config)

    users = [{"email": u.email, "password": u.password, "name": u.name} for u in TEST_USERS]
    original_startup = server.startup

    async def startup(sockets: list | None = None) -> None:
        await original_startup(sockets)
        print(f"test-api listening on :{port}", flush=True)
        print(f"READY {json.dumps(users)}", flush=True)

    server.startup = startup  # type: ignore[method-assign]
    server.run()


if __name__ == "__main__":
    main()
