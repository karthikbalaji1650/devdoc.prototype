"""Seed data shared by the pytest fixtures and the browser-test API
(tests/e2e_server.py): the same three users the Node tests used."""

from dataclasses import dataclass
from functools import cache
from typing import Any

from app.core.config import Settings
from app.core.security import hash_password
from app.models.user import User
from app.repositories.memory import MemoryStore


@dataclass(frozen=True)
class TestUser:
    __test__ = False
    id: str
    name: str
    email: str
    role: str
    password: str


TEST_USERS = [
    TestUser("usr-01", "Manivannan Thangavel", "mani.thangavel@sanmina.com", "admin", "demo-pass-1"),
    TestUser("usr-02", "Vaishnavi Aasaithambi", "vaishnavi.aasaithambi@sanmina.com", "release-manager", "demo-pass-2"),
    TestUser("usr-03", "Judia Lumina", "judia.lumina@sanmina.com", "firmware-lead", "demo-pass-3"),
]
ADMIN, AUTHOR, OTHER = TEST_USERS


@cache
def _hash(password: str) -> str:
    return hash_password(password)  # cost 12 is slow; hash each once per run


def seeded_store() -> MemoryStore:
    store = MemoryStore()
    for u in TEST_USERS:
        store.add_user(User(u.id, u.name, u.email, None, None, u.role, None, None), _hash(u.password))
    return store


def test_settings(**overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "database_url": None,
        "redis_url": None,
        "cookie_secure": "",
        "cors_origins": "",
        "gemini_api_key": "",
        "gemini_model": "",
        "openai_api_key": "",
        "openai_model": "",
        "secrets_key": "",
        "remote_poll_enabled": False,
        "bridge_url": "",
        "bridge_token": "",
        "jwt_secret": "",
        "oidc_issuer": "",
        "oidc_client_id": "",
        "oidc_client_secret": "",
        "oidc_redirect_uri": "",
        "oidc_scopes": "",
        "oidc_provider_name": "",
        "oidc_post_login_url": "",
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


test_settings.__test__ = False  # type: ignore[attr-defined]
