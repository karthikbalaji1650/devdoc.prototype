"""The real SQL against a real Postgres, built by the Alembic migrations.

Skipped unless TEST_DATABASE_URL points at a database this test may wipe:
    TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/devdoc_test uv run pytest -m postgres
"""

import os
from collections.abc import Iterator
from pathlib import Path

import fakeredis
import psycopg
import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient

from app.db.create_user import UserInputError, create_user
from app.main import create_app
from tests.conftest import test_settings

pytestmark = pytest.mark.postgres

DATABASE_URL = os.environ.get("TEST_DATABASE_URL")
BACKEND_DIR = Path(__file__).resolve().parents[1]
LEGACY_SCHEMA = BACKEND_DIR / "tests" / "fixtures" / "legacy_schema.sql"
ADMIN_PASSWORD = "admin-pass"
AUTHOR_PASSWORD = "author-pass"
ADMIN_EMAIL = "mani.thangavel@sanmina.com"
AUTHOR_EMAIL = "vaishnavi.aasaithambi@sanmina.com"


def alembic_config(url: str) -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    os.environ["ALEMBIC_DATABASE_URL"] = url
    return config


def seed_users(url: str) -> None:
    create_user(
        url,
        name="Manivannan Thangavel",
        email=ADMIN_EMAIL,
        password=ADMIN_PASSWORD,
        is_admin=True,
        title="Software engineering manager",
        department="Platform Systems Engineering",
    )
    create_user(
        url,
        name="Vaishnavi Aasaithambi",
        email=AUTHOR_EMAIL,
        password=AUTHOR_PASSWORD,
        is_admin=False,
        title="Technical lead",
        department="SW engineering",
    )


@pytest.fixture
def client() -> Iterator[TestClient]:
    if not DATABASE_URL:
        pytest.skip("TEST_DATABASE_URL not set")
    with psycopg.connect(DATABASE_URL, autocommit=True) as conn:
        conn.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
    command.upgrade(alembic_config(DATABASE_URL), "head")
    seed_users(DATABASE_URL)
    app = create_app(test_settings(database_url=DATABASE_URL), redis=fakeredis.FakeAsyncRedis(decode_responses=True))
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client


def sign_in(client: TestClient, email: str) -> dict[str, str]:
    password = ADMIN_PASSWORD if email == ADMIN_EMAIL else AUTHOR_PASSWORD
    res = client.post("/api/auth/login", json={"email": email, "password": password})
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


def test_login_me_logout_against_created_users(client: TestClient) -> None:
    res = client.post("/api/auth/login", json={"email": ADMIN_EMAIL.upper(), "password": ADMIN_PASSWORD})
    user = res.json()["user"]
    assert user.pop("id").startswith("usr-")
    assert user == {
        "name": "Manivannan Thangavel",
        "email": ADMIN_EMAIL,
        "title": "Software engineering manager",
        "department": "Platform Systems Engineering",
        "role": "admin",
        "avatarBg": "from-blue-600 to-indigo-600",
        "initials": "MT",
    }
    assert client.post("/api/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"}).status_code == 401
    cookie = {"Cookie": f"devdoc_sid={res.cookies['devdoc_sid']}"}
    client.cookies.clear()
    assert client.get("/api/auth/me", headers=cookie).status_code == 200
    assert client.post("/api/auth/logout", headers=cookie).status_code == 204
    assert client.get("/api/auth/me", headers=cookie).status_code == 401


def test_user_search_matches_name_title_department_and_treats_wildcards_as_text(client: TestClient) -> None:
    cookie = sign_in(client, AUTHOR_EMAIL)

    def names(q: str) -> list[str]:
        return [u["name"] for u in client.get("/api/users", params={"q": q}, headers=cookie).json()["users"]]

    assert names("  VAISH ") == ["Vaishnavi Aasaithambi"]  # name, any case
    assert names("software engineering") == ["Manivannan Thangavel"]  # title
    assert names("sw eng") == ["Vaishnavi Aasaithambi"]  # department
    assert names("") == ["Manivannan Thangavel", "Vaishnavi Aasaithambi"]
    assert names("%") == [] and names("_") == [] and names("\\") == []
    user = client.get("/api/users", headers=cookie).json()["users"][0]
    assert set(user) == {"id", "name", "title", "department"}


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


RELEASE_TABLES = {
    "releases",
    "release_milestones",
    "release_signers",
    "release_builds",
    "release_build_runs",
    "release_signoffs",
    "release_blockers",
    "release_audit",
}


def _tables(url: str) -> set[str]:
    with psycopg.connect(url) as conn:
        rows = conn.execute("SELECT tablename FROM pg_tables WHERE schemaname = 'public'").fetchall()
    return {r[0] for r in rows}


def _wipe(url: str) -> None:
    with psycopg.connect(url, autocommit=True) as conn:
        conn.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")


def test_migrations_upgrade_and_downgrade_cleanly() -> None:
    if not DATABASE_URL:
        pytest.skip("TEST_DATABASE_URL not set")
    _wipe(DATABASE_URL)
    config = alembic_config(DATABASE_URL)
    command.upgrade(config, "head")
    assert _tables(DATABASE_URL) == CURRENT_TABLES
    command.downgrade(config, "base")
    assert _tables(DATABASE_URL) == {"alembic_version"}
    command.upgrade(config, "head")  # and back up again
    assert {"users", "sessions", "documents", "session_audit"} <= _tables(DATABASE_URL)


UNUSED_LEGACY_TABLES = {
    "incidents",
    "release_master",
    "reviewers_log",
    "gantt_tasks",
    "test_suites",
    "test_cases",
    "test_runs",
}
BASE_TABLES = {"users", "sessions", "documents", "session_audit", "alembic_version"}  # before the releases migration
CURRENT_TABLES = BASE_TABLES | RELEASE_TABLES


def _build_legacy_database(url: str) -> None:
    """A database as the old docker-compose built it (init.sql), holding one user and one document."""
    _wipe(url)
    with psycopg.connect(url, autocommit=True) as conn:
        conn.execute(LEGACY_SCHEMA.read_text())
        conn.execute(
            "INSERT INTO users (id, name, email, password_hash, role)"
            " VALUES ('legacy-1', 'Legacy Person', 'legacy@x.com', 'hash', 'firmware-lead')"
        )
        conn.execute(
            "INSERT INTO documents (id, doc_number, title, author, document_json)"
            " VALUES ('legacy-doc', 'N-1', 'Old report', 'Legacy Person', '{}')"
        )


def _assert_legacy_data_carried_through(url: str) -> None:
    with psycopg.connect(url) as conn:
        assert conn.execute("SELECT name, email, role, password FROM users").fetchall() == [
            ("Legacy Person", "legacy@x.com", "user", "hash")  # position became `user`; the old value is kept as is
        ]
        assert conn.execute("SELECT title, author, owner_id FROM documents").fetchall() == [
            ("Old report", "Legacy Person", "legacy-1")  # and the document got its owner
        ]


def test_a_database_built_by_the_old_init_sql_can_be_stamped() -> None:
    """The adoption path: a volume init.sql already built is marked as being at
    the baseline, and later migrations then apply on top of it."""
    if not DATABASE_URL:
        pytest.skip("TEST_DATABASE_URL not set")
    _build_legacy_database(DATABASE_URL)
    config = alembic_config(DATABASE_URL)
    command.stamp(config, "0001")
    command.upgrade(config, "head")  # must not try to recreate the baseline tables
    assert _tables(DATABASE_URL) == CURRENT_TABLES
    _assert_legacy_data_carried_through(DATABASE_URL)


def test_a_database_built_by_the_old_init_sql_upgrades_without_a_stamp() -> None:
    """What `docker compose up` does on an existing volume."""
    if not DATABASE_URL:
        pytest.skip("TEST_DATABASE_URL not set")
    _build_legacy_database(DATABASE_URL)
    command.upgrade(alembic_config(DATABASE_URL), "head")
    assert _tables(DATABASE_URL) == CURRENT_TABLES
    _assert_legacy_data_carried_through(DATABASE_URL)


def test_migration_0006_drops_exactly_the_seven_unused_legacy_tables() -> None:
    if not DATABASE_URL:
        pytest.skip("TEST_DATABASE_URL not set")
    _build_legacy_database(DATABASE_URL)
    config = alembic_config(DATABASE_URL)
    command.upgrade(config, "0005")
    assert UNUSED_LEGACY_TABLES <= _tables(DATABASE_URL)  # still there before 0006
    command.upgrade(config, "0006")
    assert _tables(DATABASE_URL) == BASE_TABLES


def test_migration_0006_changes_nothing_on_a_fresh_database() -> None:
    if not DATABASE_URL:
        pytest.skip("TEST_DATABASE_URL not set")
    _wipe(DATABASE_URL)
    config = alembic_config(DATABASE_URL)
    command.upgrade(config, "0005")
    before = _tables(DATABASE_URL)
    command.upgrade(config, "0006")
    assert _tables(DATABASE_URL) == before == BASE_TABLES


def test_migration_0006_downgrade_runs_and_does_not_bring_the_tables_back() -> None:
    if not DATABASE_URL:
        pytest.skip("TEST_DATABASE_URL not set")
    _build_legacy_database(DATABASE_URL)
    config = alembic_config(DATABASE_URL)
    command.upgrade(config, "head")
    command.downgrade(config, "0005")
    assert _tables(DATABASE_URL) == BASE_TABLES  # the sample data they held is gone for good


def test_create_user_rules() -> None:
    if not DATABASE_URL:
        pytest.skip("TEST_DATABASE_URL not set")
    _wipe(DATABASE_URL)
    command.upgrade(alembic_config(DATABASE_URL), "head")
    make = dict(
        name="Ada Lovelace",
        email="Ada@Example.com",
        password="pw",
        is_admin=False,
        title="Mathematician",
        department="Analytical Engines",
    )
    user_id = create_user(DATABASE_URL, **make)
    with psycopg.connect(DATABASE_URL) as conn:
        row = conn.execute(
            "SELECT email, role, initials, password, title, department FROM users WHERE id = %s", (user_id,)
        ).fetchone()
    # lower-cased email, stored as typed, role from the admin yes/no, title and department saved
    assert row == ("ada@example.com", "user", "AL", "pw", "Mathematician", "Analytical Engines")

    with pytest.raises(UserInputError, match="already exists"):
        create_user(DATABASE_URL, **{**make, "email": "ADA@example.com"})  # any casing of the same email
    with pytest.raises(UserInputError, match="valid email"):
        create_user(DATABASE_URL, **{**make, "email": "nope"})
    for field, message in (("password", "Password"), ("title", "Title"), ("department", "Department")):
        with pytest.raises(UserInputError, match=f"{message} is required"):
            create_user(DATABASE_URL, **{**make, "email": "c@example.com", field: ""})
    with pytest.raises(UserInputError, match="Title is required"):  # spaces alone are not a title
        create_user(DATABASE_URL, **{**make, "email": "c@example.com", "title": "   "})

    admin_id = create_user(DATABASE_URL, **{**make, "email": "root@example.com", "is_admin": True})
    with psycopg.connect(DATABASE_URL) as conn:
        assert conn.execute("SELECT role FROM users WHERE id = %s", (admin_id,)).fetchone() == ("admin",)


def test_the_database_itself_enforces_roles_and_a_required_profile() -> None:
    if not DATABASE_URL:
        pytest.skip("TEST_DATABASE_URL not set")
    _wipe(DATABASE_URL)
    command.upgrade(alembic_config(DATABASE_URL), "head")
    insert = (
        "INSERT INTO users (id, name, email, password, role, title, department) VALUES (%s, 'N', %s, 'p', %s, %s, %s)"
    )
    with psycopg.connect(DATABASE_URL, autocommit=True) as conn:
        conn.execute(insert, ("u1", "u1@x.com", "user", "T", "D"))  # type: ignore[call-overload]
        for args in (
            ("u2", "u2@x.com", "firmware-lead", "T", "D"),  # not one of the two roles
            ("u3", "u3@x.com", "Admin ", "T", "D"),  # a typo does not slip through
            ("u4", "u4@x.com", "user", None, "D"),  # title required
            ("u5", "u5@x.com", "user", "T", "  "),  # department required
        ):
            with pytest.raises(psycopg.errors.CheckViolation):
                conn.execute(insert, args)  # type: ignore[call-overload]
        conn.execute(
            "INSERT INTO users (id, name, email, password, title, department) VALUES ('u6','N','u6@x.com','p','T','D')"
        )
        assert conn.execute("SELECT role FROM users WHERE id = 'u6'").fetchone() == ("user",)  # the default role


def test_migration_0004_turns_positions_into_user_and_keeps_old_rows() -> None:
    if not DATABASE_URL:
        pytest.skip("TEST_DATABASE_URL not set")
    _wipe(DATABASE_URL)
    config = alembic_config(DATABASE_URL)
    command.upgrade(config, "0003")
    with psycopg.connect(DATABASE_URL, autocommit=True) as conn:
        for uid, role in (("a", "admin"), ("b", "release-manager"), ("c", "firmware-lead"), ("d", "qa-director")):
            conn.execute(  # no title or department: allowed before 0004
                "INSERT INTO users (id, name, email, password, role) VALUES (%s, %s, %s, 'x', %s)",
                (uid, uid, f"{uid}@x.com", role),
            )
    command.upgrade(config, "0004")
    with psycopg.connect(DATABASE_URL) as conn:
        roles = dict(conn.execute("SELECT id, role FROM users").fetchall())
        assert roles == {"a": "admin", "b": "user", "c": "user", "d": "user"}
        assert conn.execute("SELECT count(*) FROM users WHERE title IS NULL").fetchone() == (4,)  # not invented


def test_migration_0005_assigns_an_owner_only_when_exactly_one_user_matches() -> None:
    if not DATABASE_URL:
        pytest.skip("TEST_DATABASE_URL not set")
    _wipe(DATABASE_URL)
    config = alembic_config(DATABASE_URL)
    command.upgrade(config, "0004")
    with psycopg.connect(DATABASE_URL, autocommit=True) as conn:
        for uid, name in (("u1", "Ann Lee"), ("u2", "Bob Ray"), ("u3", "Bob Ray")):
            conn.execute(
                "INSERT INTO users (id, name, email, password, role, title, department)"
                " VALUES (%s, %s, %s, 'p', 'user', 'T', 'D')",
                (uid, name, f"{uid}@x.com"),
            )
        for doc_id, author in (("d1", " ann LEE"), ("d2", "Bob Ray"), ("d3", "Nobody"), ("d4", None)):
            conn.execute(
                "INSERT INTO documents (id, doc_number, title, author, document_json) VALUES (%s, 'n', 't', %s, '{}')",
                (doc_id, author),
            )
    command.upgrade(config, "0005")
    with psycopg.connect(DATABASE_URL, autocommit=True) as conn:
        owners = dict(conn.execute("SELECT id, owner_id FROM documents").fetchall())
        # one match (ignoring case and spaces) -> owner; two matches, none, or no author -> unowned
        assert owners == {"d1": "u1", "d2": None, "d3": None, "d4": None}
        with pytest.raises(psycopg.errors.ForeignKeyViolation):  # a user who owns documents cannot be deleted
            conn.execute("DELETE FROM users WHERE id = 'u1'")
    command.downgrade(config, "0004")
    with psycopg.connect(DATABASE_URL) as conn:
        assert conn.execute("SELECT count(*) FROM documents").fetchone() == (4,)


def test_document_ownership_in_postgres(client: TestClient) -> None:
    author = sign_in(client, AUTHOR_EMAIL)
    admin = sign_in(client, ADMIN_EMAIL)
    assert client.put("/api/documents/own-1", json=doc("own-1"), headers=author).status_code == 200
    with psycopg.connect(DATABASE_URL, autocommit=True) as conn:  # type: ignore[arg-type]
        owner, author_id = conn.execute(
            "SELECT d.owner_id, u.id FROM documents d, users u WHERE d.id = 'own-1' AND u.email = %s", (AUTHOR_EMAIL,)
        ).fetchone()  # type: ignore[misc]
        assert owner == author_id
        conn.execute("UPDATE documents SET owner_id = NULL WHERE id = 'own-1'")  # an unmatched legacy document
    assert client.put("/api/documents/own-1", json=doc("own-1", title="x"), headers=author).status_code == 403
    assert client.put("/api/documents/own-1", json=doc("own-1", title="x"), headers=admin).status_code == 200
    unknown = client.put("/api/documents/own-1", json=doc("own-1", author="Nobody"), headers=admin)
    assert unknown.status_code == 400
    reassigned = client.put("/api/documents/own-1", json=doc("own-1", author="vaishnavi aasaithambi"), headers=admin)
    assert reassigned.status_code == 200
    assert client.put("/api/documents/own-1", json=doc("own-1", title="mine"), headers=author).status_code == 200
    assert client.get("/api/admin/backup", headers=admin).json()["documents"][0]["ownerId"] == author_id


def test_session_audit_records_sign_ins_and_sign_outs(client: TestClient) -> None:
    author = sign_in(client, AUTHOR_EMAIL)
    sign_in(client, AUTHOR_EMAIL)  # a second, still-open session
    assert client.post("/api/auth/logout", headers=author).status_code == 204
    assert client.post("/api/auth/logout", headers=author).status_code == 204  # again: nothing more is recorded
    admin = sign_in(client, ADMIN_EMAIL)

    sessions = client.get("/api/audit/sessions", headers=admin).json()["sessions"]
    assert [(s["userName"], s["status"]) for s in sessions] == [
        ("Manivannan Thangavel", "active"),
        ("Vaishnavi Aasaithambi", "active"),
        ("Vaishnavi Aasaithambi", "signed-out"),
    ]
    assert sessions[0]["loginTime"].endswith("Z") and sessions[2]["logoutTime"].endswith("Z")
    assert sessions[1]["role"] == "user" and sessions[1]["logoutTime"] is None
    with psycopg.connect(DATABASE_URL) as conn:  # type: ignore[arg-type]
        stored = conn.execute("SELECT session_id_hash FROM session_audit").fetchall()
    assert all(len(h[0]) == 64 for h in stored)  # a sha256, never the session id itself
    assert author["Cookie"].split("=")[1] not in str(stored)


def test_a_non_admin_reads_only_their_own_sign_ins_from_postgres(client: TestClient) -> None:
    author = sign_in(client, AUTHOR_EMAIL)
    sign_in(client, ADMIN_EMAIL)
    assert client.post("/api/auth/logout", headers=author).status_code == 204
    author = sign_in(client, AUTHOR_EMAIL)

    res = client.get("/api/audit/sessions", headers=author)
    assert res.status_code == 200
    sessions = res.json()["sessions"]
    assert [(s["userName"], s["status"]) for s in sessions] == [
        ("Vaishnavi Aasaithambi", "active"),
        ("Vaishnavi Aasaithambi", "signed-out"),
    ]


def _indexes(url: str, table: str) -> set[str]:
    with psycopg.connect(url) as conn:
        rows = conn.execute("SELECT indexname FROM pg_indexes WHERE tablename = %s", (table,)).fetchall()
    return {r[0] for r in rows}


def test_migration_0007_indexes_sign_ins_by_user_and_downgrades_cleanly() -> None:
    if not DATABASE_URL:
        pytest.skip("TEST_DATABASE_URL not set")
    _wipe(DATABASE_URL)
    config = alembic_config(DATABASE_URL)
    command.upgrade(config, "0006")
    assert "session_audit_user_login_at_idx" not in _indexes(DATABASE_URL, "session_audit")
    command.upgrade(config, "0007")
    assert "session_audit_user_login_at_idx" in _indexes(DATABASE_URL, "session_audit")
    command.downgrade(config, "0006")
    assert "session_audit_user_login_at_idx" not in _indexes(DATABASE_URL, "session_audit")
    assert "session_audit_login_at_idx" in _indexes(DATABASE_URL, "session_audit")  # 0003's index untouched


def test_session_audit_is_append_only_in_the_database(client: TestClient) -> None:
    sign_in(client, AUTHOR_EMAIL)
    with psycopg.connect(DATABASE_URL, autocommit=True) as conn:  # type: ignore[arg-type]
        for sql in (
            "DELETE FROM session_audit",
            "TRUNCATE session_audit",
            "UPDATE session_audit SET role = 'admin'",
            "UPDATE session_audit SET user_name = 'Someone Else'",
            "UPDATE session_audit SET login_at = now() - interval '1 day'",
        ):
            with pytest.raises(psycopg.errors.RaiseException, match="append-only"):
                conn.execute(sql)  # type: ignore[call-overload]
        conn.execute("UPDATE session_audit SET logout_at = now()")  # the one allowed change...
        with pytest.raises(psycopg.errors.RaiseException, match="append-only"):
            conn.execute("UPDATE session_audit SET logout_at = now()")  # ...but only once
        assert conn.execute("SELECT count(*) FROM session_audit").fetchone() == (1,)
