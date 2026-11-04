"""Admin server backup and reset (DDS-SRS-008)."""

from tests.conftest import ADMIN, AUTHOR, Api
from tests.test_documents import doc


def fill(api: Api) -> None:
    author = api.sign_in(AUTHOR)
    author.put("/api/documents/d1", json=doc("d1", title="Kept"))
    author.put("/api/documents/d2", json=doc("d2"))
    author.delete("/api/documents/d2")  # soft-deleted: still in the backup
    author.put("/api/test-management/suites/s1", json={"title": "Suite"})
    author.put("/api/collections/test-case-library/c1", json={"customId": "C1", "title": "T"})


def test_admins_only(api: Api) -> None:
    author = api.sign_in(AUTHOR)
    assert author.get("/api/admin/backup").status_code == 403
    res = author.post("/api/admin/reset", json={"confirm": "DELETE ALL DATA"})
    assert res.status_code == 403
    assert res.json() == {"error": "Only admins can manage the application's data."}
    assert api.anonymous().get("/api/admin/backup").status_code == 401


def test_backup_holds_every_document_and_all_app_data(api: Api) -> None:
    fill(api)
    api.sign_in(AUTHOR).get("/api/documents")  # fills the read cache, which is left out
    res = api.sign_in(ADMIN).get("/api/admin/backup")
    assert res.status_code == 200
    assert res.headers["content-disposition"].startswith('attachment; filename="devdoc-studio-server-backup-')
    backup = res.json()
    assert backup["format"] == "devdoc-studio-backup-v1"
    assert backup["exportedBy"] == ADMIN.name
    docs = {d["id"]: d for d in backup["documents"]}
    assert docs["d1"]["document"]["metadata"]["title"] == "Kept" and docs["d1"]["deletedAt"] is None
    assert docs["d2"]["deletedAt"] is not None
    redis = backup["redis"]
    assert redis["dds:tm:suites"]["type"] == "hash" and "s1" in redis["dds:tm:suites"]["value"]
    assert "c1" in redis["dds:col:test-case-library"]["value"]
    assert any(k.startswith("dds:audit:") for k in redis)  # the sign-ins above
    assert not any(k.startswith("dds:cache:") for k in redis)


def test_reset_needs_the_exact_confirmation(api: Api) -> None:
    fill(api)
    admin = api.sign_in(ADMIN)
    res = admin.post("/api/admin/reset", json={"confirm": "delete all data"})
    assert res.status_code == 400
    assert res.json() == {"error": 'Type "DELETE ALL DATA" to confirm.'}
    assert admin.get("/api/documents").json()["documents"] != []


def test_reset_clears_data_but_keeps_users_sessions_and_the_audit_log(api: Api) -> None:
    fill(api)
    admin = api.sign_in(ADMIN)
    res = admin.post("/api/admin/reset", json={"confirm": "DELETE ALL DATA"})
    assert res.status_code == 200 and res.json()["ok"] is True
    assert admin.get("/api/documents").json()["documents"] == []  # cache dropped too
    assert admin.get("/api/test-management").json()["suites"] == []
    assert admin.get("/api/collections/test-case-library").json()["items"] == []
    assert len(admin.get("/api/audit/sessions").json()["sessions"]) == 2  # still signed in, log kept
    assert [d["id"] for d in admin.get("/api/admin/backup").json()["documents"]] == []
