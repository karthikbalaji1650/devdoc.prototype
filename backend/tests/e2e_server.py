"""Standalone API for the browser tests (e2e/backend-login.spec.ts and
e2e/remote-test-execution.spec.ts): the real app on in-memory
repositories seeded with the test users, so no database is needed.
Started and killed by those specs; prints `READY <users json>` once up.
`POST /__e2e/reset` empties its (fake, in-process) Redis and documents between tests.

    PORT=4111 FRONTEND_ORIGIN=http://localhost:5199 uv run python -m tests.e2e_server
"""

import base64
import json
import os
from typing import Any

import fakeredis
import uvicorn

from app.main import create_app
from app.repositories.memory import memory_repositories
from tests.seed import TEST_USERS, seeded_store, test_settings


def main() -> None:
    port = int(os.environ.get("PORT") or 4111)
    origin = os.environ.get("FRONTEND_ORIGIN", "http://localhost:5199")
    redis = fakeredis.FakeAsyncRedis(decode_responses=True)
    store = seeded_store()
    # A fresh key per run, so test-server credentials can be stored (DDS-SRS-075).
    secrets_key = os.environ.get("SECRETS_KEY") or base64.b64encode(os.urandom(32)).decode()
    settings = test_settings(cors_origins=origin, secrets_key=secrets_key)
    app = create_app(settings, repositories=memory_repositories(store), redis=redis)

    async def with_reset(scope: dict[str, Any], receive: Any, send: Any) -> None:
        """POST /__e2e/reset empties Redis and the documents, so each browser
        test starts from the sample data. Users (and their sessions) stay.
        Test harness only - not part of the API."""
        if scope["type"] == "http" and scope["path"] == "/__e2e/reset" and scope["method"] == "POST":
            await redis.flushall()
            store.documents.clear()
            await send({"type": "http.response.start", "status": 204, "headers": []})
            await send({"type": "http.response.body", "body": b""})
            return
        await app(scope, receive, send)

    config = uvicorn.Config(
        with_reset, host="127.0.0.1", port=port, log_level="warning", proxy_headers=False, server_header=False
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
