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
    settings = test_settings(cors_origins=origin, secrets_key=secrets_key, remote_poll_enabled=True)
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
        if scope["type"] == "http" and scope["path"].startswith("/__e2e/testpc"):
            await fake_test_pc(scope, receive, send)
            return
        await app(scope, receive, send)

    testpc: dict[str, Any] = {"last": None}

    async def fake_test_pc(scope: dict[str, Any], receive: Any, send: Any) -> None:
        """A stand-in remote Test PC (docs/test-pc-api.md) for the browser
        tests: accepts runs with API key `e2e-testpc-key`, records the last
        start request (GET /__e2e/testpc/last), reports a run RUNNING at 50%
        on the first check and COMPLETED (1 pass, 1 fail) after that."""
        path, method = scope["path"], scope["method"]
        headers = {k.decode().lower(): v.decode() for k, v in scope["headers"]}
        body = b""
        while True:
            message = await receive()
            body += message.get("body", b"")
            if not message.get("more_body"):
                break

        async def reply(status: int, payload: Any) -> None:
            data = json.dumps(payload).encode()
            await send(
                {"type": "http.response.start", "status": status, "headers": [(b"content-type", b"application/json")]}
            )
            await send({"type": "http.response.body", "body": data})

        if path == "/__e2e/testpc/last":
            await reply(200, testpc["last"])
        elif headers.get("x-api-key") != "e2e-testpc-key":
            await reply(401, {"error": "bad key"})
        elif path == "/__e2e/testpc/runs" and method == "POST":
            testpc["last"] = {"apiKey": headers.get("x-api-key"), "body": json.loads(body or b"{}")}
            testpc["polls"] = 0
            await reply(202, {"jobId": "fake-1"})
        elif path.startswith("/__e2e/testpc/runs/") and method == "GET":
            # First check: halfway through; after that: completed.
            polls = testpc["polls"] = testpc.get("polls", 0) + 1
            if polls == 1:
                await reply(200, {"status": "RUNNING", "total": 2, "completed": 1, "passed": 1, "failed": 0})
            else:
                results = [
                    {"customId": "TC-001", "title": "TC-001", "status": "PASS"},
                    {"customId": "TC-002", "title": "TC-002", "status": "FAIL", "failureMessage": "Timeout"},
                ]
                await reply(200, {"status": "COMPLETED", "results": results})
        else:
            await reply(200, {"ok": True})

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
