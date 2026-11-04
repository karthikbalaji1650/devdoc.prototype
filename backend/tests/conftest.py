"""Shared fixtures: an app on in-memory repositories (the pg-mem role from
the Node tests), seeded with the same three test users."""

from collections.abc import Iterator
from dataclasses import dataclass
from typing import Any

import fakeredis
import httpx
import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.security import SESSION_COOKIE
from app.main import create_app
from app.repositories.memory import MemoryStore, memory_repositories
from tests.seed import ADMIN, AUTHOR, OTHER, TEST_USERS, TestUser, seeded_store, test_settings

__all__ = ["ADMIN", "AUTHOR", "OTHER", "TEST_USERS", "Agent", "Api", "TestUser", "make_api", "test_settings"]


class Agent:
    """supertest's request.agent(): one signed-in identity on a shared app."""

    def __init__(self, client: TestClient, session_id: str | None) -> None:
        self._client = client
        self.session_id = session_id

    def request(self, method: str, url: str, **kwargs: Any) -> httpx.Response:
        headers = dict(kwargs.pop("headers", None) or {})
        if self.session_id:
            headers["Cookie"] = f"{SESSION_COOKIE}={self.session_id}"
        return self._client.request(method, url, headers=headers, **kwargs)

    def get(self, url: str, **kw: Any) -> httpx.Response:
        return self.request("GET", url, **kw)

    def post(self, url: str, **kw: Any) -> httpx.Response:
        return self.request("POST", url, **kw)

    def put(self, url: str, **kw: Any) -> httpx.Response:
        return self.request("PUT", url, **kw)

    def delete(self, url: str, **kw: Any) -> httpx.Response:
        return self.request("DELETE", url, **kw)


@dataclass
class Api:
    client: TestClient
    store: MemoryStore

    def anonymous(self) -> Agent:
        return Agent(self.client, None)

    def sign_in(self, user: TestUser) -> Agent:
        res = self.client.post("/api/auth/login", json={"email": user.email, "password": user.password})
        assert res.status_code == 200, res.text
        session_id = res.cookies.get(SESSION_COOKIE)
        self.client.cookies.clear()  # each Agent carries its own cookie
        return Agent(self.client, session_id)


def make_api(settings: Settings | None = None) -> Iterator[Api]:
    store = seeded_store()
    redis = fakeredis.FakeAsyncRedis(decode_responses=True)
    app = create_app(settings or test_settings(), repositories=memory_repositories(store), redis=redis)
    with TestClient(app, raise_server_exceptions=False) as client:
        yield Api(client, store)


@pytest.fixture
def api() -> Iterator[Api]:
    yield from make_api()
