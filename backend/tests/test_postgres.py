"""The real SQL against a real Postgres, seeded from sql/init.sql.

Skipped unless TEST_DATABASE_URL points at a database this test may wipe:
    TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/devdoc_test uv run pytest -m postgres
"""

import os
from collections.abc import Iterator
from pathlib import Path

import psycopg
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from tests.conftest import test_settings

pytestmark = pytest.mark.postgres

DATABASE_URL = os.environ.get("TEST_DATABASE_URL")
INIT_SQL = Path(__file__).resolve().parents[1] / "sql" / "init.sql"
DEMO_PASSWORD = "devdoc-demo"  # init.sql's seeded password, demo use only
ADMIN_EMAIL = "mani.thangavel@sanmina.com"
AUTHOR_EMAIL = "vaishnavi.aasaithambi@sanmina.com"


@pytest.fixture
def client() -> Iterator[TestClient]:
    if not DATABASE_URL:
        pytest.skip("TEST_DATABASE_URL not set")
    with psycopg.connect(DATABASE_URL, autocommit=True) as conn:
        conn.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
        conn.execute(INIT_SQL.read_text())
    app = create_app(test_settings(database_url=DATABASE_URL))
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client


def sign_in(client: TestClient, email: str) -> dict[str, str]:
    res = client.post("/api/auth/login", json={"email": email, "password": DEMO_PASSWORD})
    assert res.status_code == 200, res.text
    cookie = {"Cookie": f"devdoc_sid={res.cookies['devdoc_sid']}"}
    client.cookies.clear()
    return cookie


def doc(doc_id: str, **overrides: object) -> dict[str, object]:
    metadata = {
        "id": doc_id,
        "title": "T",
        "docNumber": "FW-1",
        "date": "2026-09-28",
        "version": "1.0",
        "classification": "INTERNAL ONLY",
        "status": "DRAFT",
        "templateType": "technical-analysis",
    }
    return {"metadata": {**metadata, **overrides}, "sections": [{"id": "s1", "n": 1.5}]}


def test_login_me_logout_against_the_seeded_users(client: TestClient) -> None:
    res = client.post("/api/auth/login", json={"email": ADMIN_EMAIL.upper(), "password": DEMO_PASSWORD})
    assert res.json()["user"] == {
        "id": "usr-01",
        "name": "Manivannan Thangavel",
        "email": ADMIN_EMAIL,
        "title": "Software engineering manager",
        "department": "Platform Systems Engineering",
        "role": "admin",
        "avatarBg": "from-blue-600 to-indigo-600",
        "initials": "MT",
    }
    cookie = {"Cookie": f"devdoc_sid={res.cookies['devdoc_sid']}"}
    client.cookies.clear()
    assert client.get("/api/auth/me", headers=cookie).status_code == 200
    assert client.post("/api/auth/logout", headers=cookie).status_code == 204
    assert client.get("/api/auth/me", headers=cookie).status_code == 401


def test_document_lifecycle(client: TestClient) -> None:
    author = sign_in(client, AUTHOR_EMAIL)
    admin = sign_in(client, ADMIN_EMAIL)

    saved = client.put("/api/documents/pg-1", json=doc("pg-1"), headers=author)
    assert saved.status_code == 200
    assert saved.json()["document"]["metadata"]["author"] == "Vaishnavi Aasaithambi"
    client.put("/api/documents/pg-2", json=doc("pg-2", status="APPROVED"), headers=author)

    listed = client.get("/api/documents", headers=author).json()["documents"]
    assert [d["metadata"]["id"] for d in listed] == ["pg-1"]
    assert len(client.get("/api/documents", headers=admin).json()["documents"]) == 2

    fetched = client.get("/api/documents/pg-1", headers=author).json()["document"]
    assert fetched["sections"] == [{"id": "s1", "n": 1.5}]
    assert fetched["updatedAt"].endswith("Z")

    assert client.delete("/api/documents/pg-1", headers=author).status_code == 204
    assert client.get("/api/documents/pg-1", headers=author).status_code == 404
    assert client.delete("/api/documents/pg-1/purge", headers=author).status_code == 204
    assert client.delete("/api/documents/pg-1/purge", headers=author).status_code == 404


def test_values_are_coerced_like_node_postgres(client: TestClient) -> None:
    author = sign_in(client, AUTHOR_EMAIL)
    res = client.put("/api/documents/pg-3", json=doc("pg-3", title=42, version=2.0, date=""), headers=author)
    assert res.status_code == 200
    with psycopg.connect(DATABASE_URL) as conn:  # type: ignore[arg-type]
        row = conn.execute("SELECT title, version, doc_date FROM documents WHERE id = 'pg-3'").fetchone()
    assert row == ("42", "2", None)


def test_invalid_column_value_is_a_500(client: TestClient) -> None:
    author = sign_in(client, AUTHOR_EMAIL)
    assert client.put("/api/documents/pg-4", json=doc("pg-4", date="not-a-date"), headers=author).status_code == 500
