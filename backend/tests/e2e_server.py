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
import time
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
        if scope["type"] == "http" and scope["path"] == "/__e2e/fire-schedules" and scope["method"] == "POST":
            # Fires every enabled schedule as if a week had passed (DDS-SRS-028),
            # so a browser test need not wait for the clock.
            fired = await app.state.services.schedules.fire_due(time.time() + 8 * 24 * 3600)
            await send(
                {"type": "http.response.start", "status": 200, "headers": [(b"content-type", b"application/json")]}
            )
            await send({"type": "http.response.body", "body": json.dumps({"fired": fired}).encode()})
            return
        if scope["type"] == "http" and scope["path"].startswith("/__e2e/jira/"):
            await fake_jira(scope, receive, send)
            return
        if scope["type"] == "http" and scope["path"].startswith("/__e2e/testpc"):
            await fake_test_pc(scope, receive, send)
            return
        await app(scope, receive, send)

    testpc: dict[str, Any] = {"last": None}

    def jira_issue(key: str, summary: str, priority: str, done: bool) -> dict[str, Any]:
        category = "done" if done else "indeterminate"
        status = {"name": "Done" if done else "In Progress", "statusCategory": {"key": category}}
        return {"key": key, "fields": {"summary": summary, "priority": {"name": priority}, "status": status}}

    jira_issues = {
        "FW-101": jira_issue("FW-101", "BMC hangs after warm reset", "Highest", False),
        "FW-102": jira_issue("FW-102", "Fan curve ignores ambient sensor", "High", False),
        "FW-103": jira_issue("FW-103", "Typo in SEL message", "Low", True),
        "FW-200": jira_issue("FW-200", "Watchdog not re-armed", "Medium", False),
    }

    async def fake_jira(scope: dict[str, Any], receive: Any, send: Any) -> None:
        """A stand-in Jira Cloud (DDS-SRS-044) for the browser tests: token
        `e2e-jira-token` for qa@example.com; JQL search returns FW-101..103."""
        path, method = scope["path"].removeprefix("/__e2e/jira"), scope["method"]
        headers = {k.decode().lower(): v.decode() for k, v in scope["headers"]}
        while (await receive()).get("more_body"):
            pass

        async def reply(status: int, payload: Any) -> None:
            await send(
                {"type": "http.response.start", "status": status, "headers": [(b"content-type", b"application/json")]}
            )
            await send({"type": "http.response.body", "body": json.dumps(payload).encode()})

        expected = "Basic " + base64.b64encode(b"qa@example.com:e2e-jira-token").decode()
        if headers.get("authorization") != expected:
            await reply(401, {"errorMessages": ["Unauthorized"]})
        elif path == "/rest/api/3/myself":
            await reply(200, {"displayName": "QA Bot"})
        elif path == "/rest/api/3/search/jql" and method == "POST":
            await reply(200, {"issues": [jira_issues[k] for k in ("FW-101", "FW-102", "FW-103")], "isLast": True})
        elif path.startswith("/rest/api/3/issue/") and path.split("/")[-1] in jira_issues:
            await reply(200, jira_issues[path.split("/")[-1]])
        else:
            await reply(404, {"errorMessages": ["Issue does not exist"]})

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
