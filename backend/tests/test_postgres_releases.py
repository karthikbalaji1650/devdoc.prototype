"""Releases against a real Postgres (migration 0008).

Skipped unless TEST_DATABASE_URL points at a database this test may wipe (see
test_postgres.py). Uses the same two seeded users: the admin and the author.
"""

from concurrent.futures import ThreadPoolExecutor
from typing import Any

import psycopg
import pytest
from alembic import command
from fastapi.testclient import TestClient

from tests.test_postgres import (  # noqa: F401  (client is a fixture)
    ADMIN_EMAIL,
    AUTHOR_EMAIL,
    DATABASE_URL,
    _tables,
    _wipe,
    alembic_config,
    client,
    sign_in,
)

pytestmark = pytest.mark.postgres

SHA = "a" * 64


def body(**overrides: Any) -> dict[str, Any]:
    return {"version": "v2.4.0", "type": "Minor", "targetDate": "2026-12-01", "status": "In Progress", **overrides}


def build(**overrides: Any) -> dict[str, Any]:
    return {
        "imageName": "registry.example.com/app:rc",
        "commitSha": "abc1234",
        "artifactUrl": "https://artifactory.example.com/app",
        "repository": "Nexus",
        "sha256": SHA,
        "builtAt": "2026-11-20T10:00",
        **overrides,
    }


def people(client: TestClient, cookie: dict[str, str]) -> dict[str, str]:
    users = client.get("/api/users", headers=cookie).json()["users"]
    return {u["name"]: u["id"] for u in users}


def sql(statement: str, params: tuple[Any, ...] = ()) -> list[tuple[Any, ...]]:
    with psycopg.connect(DATABASE_URL, autocommit=True) as conn:  # type: ignore[arg-type]
        cur = conn.execute(statement, params)
        return cur.fetchall() if cur.description else []


def test_a_release_goes_from_creation_to_final_and_back_out_of_postgres(client: TestClient) -> None:
    author = sign_in(client, AUTHOR_EMAIL)
    admin = sign_in(client, ADMIN_EMAIL)
    ids = people(client, author)
    admin_id, author_id = ids["Manivannan Thangavel"], ids["Vaishnavi Aasaithambi"]

    created = client.post("/api/releases", json=body(signerIds=[admin_id], segment="Enterprise"), headers=author)
    assert created.status_code == 200, created.text
    release = created.json()["release"]
    rid = release["id"]
    assert [s["name"] for s in release["signers"]] == ["Vaishnavi Aasaithambi", "Manivannan Thangavel"]
    assert release["signers"][0]["title"] == "Technical lead"
    assert release["targetDate"] == "2026-12-01" and release["gateRules"]["minPassRate"] == 98
    assert [m["key"] for m in release["milestones"]] == [
        "code-freeze",
        "rc-build",
        "qa-regression",
        "final-signoff",
        "ga",
    ]

    # The version is unique ignoring case and spaces - the database itself says so.
    assert (
        client.post("/api/releases", json=body(version=" V2.4.0 ", signerIds=[admin_id]), headers=author).status_code
        == 409
    )
    with pytest.raises(psycopg.errors.UniqueViolation):
        sql(
            "INSERT INTO releases (id, version, type, target_date, created_by) VALUES ('x', 'V2.4.0', 'Minor', now(), %s)",
            (author_id,),
        )

    # Only the creator edits.
    assert client.patch(f"/api/releases/{rid}", json={"title": "x"}, headers=admin).status_code == 403
    patched = client.patch(
        f"/api/releases/{rid}",
        json={
            "title": "Security patch",
            "gateRules": {"minPassRate": 95.0, "mandatorySuiteIds": ["s1", "s2"]},
            "milestones": [{"key": "code-freeze", "plannedDate": "2026-11-10", "actualDate": "2026-11-11"}],
            "blockerQuery": {"github": {"repo": "acme/fw"}},
        },
        headers=author,
    ).json()["release"]
    assert patched["title"] == "Security patch" and patched["gateRules"]["minPassRate"] == 95
    assert patched["gateRules"]["mandatorySuiteIds"] == ["s1", "s2"]
    assert patched["milestones"][0] == {
        "key": "code-freeze",
        "name": "Code Freeze",
        "plannedDate": "2026-11-10",
        "actualDate": "2026-11-11",
    }
    assert patched["blockerQuery"] == {"github": {"repo": "acme/fw", "label": "release-blocker"}}
    client.patch(
        f"/api/releases/{rid}", json={"gateRules": {"minPassRate": 50, "mandatorySuiteIds": []}}, headers=author
    )

    # Builds: sequential numbers, details read back as written.
    first = client.post(f"/api/releases/{rid}/builds", json=build(), headers=author).json()["build"]
    second = client.post(f"/api/releases/{rid}/builds", json=build(sha256="B" * 64), headers=author).json()["build"]
    assert (first["label"], second["label"]) == ("v2.4.0-RC100", "v2.4.0-RC101")
    assert second["sha256"] == "b" * 64 and first["builtAt"] == "2026-11-20T10:00" and first["kind"] == "RC"
    runs = {
        "name": "R",
        "suiteId": "s1",
        "caseResults": [{"caseId": "c1", "customId": "T1", "title": "t", "status": "Passed"}],
    }
    client.put("/api/test-management/runs/run1", json=runs, headers=author)
    linked = client.put(f"/api/releases/{rid}/builds/rc101/runs", json={"testRunIds": ["run1"]}, headers=author)
    assert linked.json()["build"]["testRunIds"] == ["run1"]

    # Blockers: unique per tracker + key, closed ones don't hold the gate.
    blocker = client.post(f"/api/releases/{rid}/blockers", json={"key": "WH3-9", "severity": "Blocker"}, headers=author)
    assert blocker.status_code == 200
    assert client.post(f"/api/releases/{rid}/blockers", json={"key": "WH3-9"}, headers=author).status_code == 409
    detail = client.get(f"/api/releases/{rid}", headers=admin).json()["release"]
    assert detail["builds"][1]["gates"]["checks"][1]["passed"] is False
    bid = blocker.json()["blocker"]["id"]
    client.patch(f"/api/releases/{rid}/blockers/{bid}", json={"status": "Closed"}, headers=author)

    # Sign-offs: both signers, per build, by user id. A rejection needs a comment.
    path = f"/api/releases/{rid}/builds/rc101"
    assert client.post(f"{path}/signoffs", json={"decision": "Rejected"}, headers=admin).status_code == 400
    assert client.post(f"{path}/signoffs", json={"decision": "Approved"}, headers=author).status_code == 200
    assert "Manivannan Thangavel" in client.post(f"{path}/promote", headers=author).json()["error"]
    client.post(f"{path}/signoffs", json={"decision": "Rejected", "comment": "Boot loop"}, headers=admin)
    client.post(f"{path}/signoffs", json={"decision": "Approved", "comment": "Fixed"}, headers=admin)
    promoted = client.post(f"{path}/promote", headers=admin)
    assert promoted.status_code == 200 and promoted.json()["build"]["promotedBy"] == "Manivannan Thangavel"

    final = client.get(f"/api/releases/{rid}", headers=author).json()["release"]
    assert final["status"] == "Approved" and final["metrics"]["finalBuild"] == "v2.4.0-RC101"
    assert final["signersLocked"] is True
    assert client.put(f"/api/releases/{rid}/signers", json={"userIds": [admin_id]}, headers=author).status_code == 409
    assert client.post(f"/api/releases/{rid}/builds", json=build(), headers=author).status_code == 409

    # The audit log is complete, chained, and still verifies after a trip through JSONB.
    log = client.get(f"/api/releases/{rid}/audit", headers=admin).json()
    assert log["intact"] is True
    actions = [e["action"] for e in log["entries"]]
    assert actions[0] == "release-created" and actions[-1] == "status-changed"
    assert actions.count("signed-off") == 3 and "promoted-to-final" in actions
    assert [e["seq"] for e in log["entries"]] == list(range(1, len(actions) + 1))

    # Cancelling keeps everything.
    other = client.post("/api/releases", json=body(version="v3.0.0", signerIds=[author_id]), headers=admin).json()[
        "release"
    ]
    cancelled = client.post(f"/api/releases/{other['id']}/cancel", json={"reason": "Postponed"}, headers=admin)
    assert cancelled.json()["release"]["status"] == "Cancelled"
    assert client.patch(f"/api/releases/{other['id']}", json={"title": "x"}, headers=admin).status_code == 409
    lines = {r["version"]: r for r in client.get("/api/releases", headers=author).json()["releases"]}
    assert set(lines) == {"v2.4.0", "v3.0.0"} and lines["v3.0.0"]["status"] == "Cancelled"

    backup = client.get("/api/admin/backup", headers=admin).json()
    assert {r["version"] for r in backup["releases"]} == {"v2.4.0", "v3.0.0"}
    assert len(next(r for r in backup["releases"] if r["id"] == rid)["builds"]) == 2
    client.post("/api/admin/reset", json={"confirm": "DELETE ALL DATA"}, headers=admin)
    assert client.get(f"/api/releases/{rid}", headers=author).status_code == 200  # a reset leaves releases alone


def test_the_audit_log_cannot_be_changed_in_the_database(client: TestClient) -> None:
    author = sign_in(client, AUTHOR_EMAIL)
    admin_id = people(client, author)["Manivannan Thangavel"]
    client.post("/api/releases", json=body(signerIds=[admin_id]), headers=author)
    for statement in (
        "UPDATE release_audit SET actor = 'someone else'",
        "DELETE FROM release_audit",
        "TRUNCATE release_audit",
    ):
        with pytest.raises(psycopg.errors.RaiseException, match="append-only"):
            sql(statement)
    assert sql("SELECT count(*) FROM release_audit")[0][0] == 1


def test_the_database_enforces_the_release_rules_itself(client: TestClient) -> None:
    author = sign_in(client, AUTHOR_EMAIL)
    admin_id = people(client, author)["Manivannan Thangavel"]
    rid = client.post("/api/releases", json=body(signerIds=[admin_id]), headers=author).json()["release"]["id"]
    for n in (1, 2):
        client.post(f"/api/releases/{rid}/builds", json=build(sha256=str(n) * 64), headers=author)
    with pytest.raises(psycopg.errors.CheckViolation):  # a rejection without a comment
        sql(
            "INSERT INTO release_signoffs (release_id, build_id, user_id, decision) VALUES (%s, 'rc100', %s, 'Rejected')",
            (rid, admin_id),
        )
    with pytest.raises(psycopg.errors.CheckViolation):  # Cancelled needs a reason, and only Cancelled has one
        sql("UPDATE releases SET status = 'Cancelled' WHERE id = %s", (rid,))
    with pytest.raises(psycopg.errors.CheckViolation):  # a Final build is a promoted build
        sql("UPDATE release_builds SET kind = 'Final' WHERE release_id = %s AND id = 'rc100'", (rid,))
    sql(
        "UPDATE release_builds SET kind = 'Final', promoted_by = %s, promoted_at = now() WHERE release_id = %s AND id = 'rc100'",
        (admin_id, rid),
    )
    with pytest.raises(psycopg.errors.UniqueViolation):  # never two Final builds
        sql(
            "UPDATE release_builds SET kind = 'Final', promoted_by = %s, promoted_at = now() WHERE release_id = %s AND id = 'rc101'",
            (admin_id, rid),
        )
    with pytest.raises(psycopg.errors.UniqueViolation):  # build numbers are unique per release
        sql("UPDATE release_builds SET number = 100 WHERE release_id = %s AND id = 'rc101'", (rid,))
    with pytest.raises(psycopg.errors.ForeignKeyViolation):  # a release is never deleted out from under its builds
        sql("DELETE FROM releases WHERE id = %s", (rid,))


def test_simultaneous_changes_never_break_the_audit_chain(client: TestClient) -> None:
    author = sign_in(client, AUTHOR_EMAIL)
    admin_id = people(client, author)["Manivannan Thangavel"]
    rid = client.post("/api/releases", json=body(signerIds=[admin_id]), headers=author).json()["release"]["id"]

    def change(i: int) -> int:
        return client.patch(f"/api/releases/{rid}", json={"title": f"Title {i}"}, headers=author).status_code

    with ThreadPoolExecutor(max_workers=8) as pool:
        codes = list(pool.map(change, range(16)))
    assert codes == [200] * 16
    log = client.get(f"/api/releases/{rid}/audit", headers=author).json()
    assert log["intact"] is True
    assert [e["seq"] for e in log["entries"]] == list(range(1, len(log["entries"]) + 1))


def test_migration_0008_adds_and_removes_the_release_tables_cleanly() -> None:
    if not DATABASE_URL:
        pytest.skip("TEST_DATABASE_URL not set")
    _wipe(DATABASE_URL)
    config = alembic_config(DATABASE_URL)
    command.upgrade(config, "0007")
    assert "releases" not in _tables(DATABASE_URL)
    command.upgrade(config, "0008")
    assert {"releases", "release_audit", "release_signers", "release_signoffs"} <= _tables(DATABASE_URL)
    command.downgrade(config, "0007")
    assert not any(t.startswith("release") for t in _tables(DATABASE_URL))
    assert sql("SELECT count(*) FROM pg_proc WHERE proname = 'release_audit_guard'")[0][0] == 0
    command.upgrade(config, "head")
    assert "release_builds" in _tables(DATABASE_URL)
