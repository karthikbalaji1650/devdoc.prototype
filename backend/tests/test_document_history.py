"""Server-side document version history, the documents list cache, and the
Doc Bin (all formerly kept in each browser)."""

import pytest

import app.services.documents as documents_service
from tests.conftest import ADMIN, AUTHOR, OTHER, Api
from tests.test_documents import doc


@pytest.fixture
def no_snapshot_interval(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(documents_service, "SNAPSHOT_INTERVAL_SECONDS", 0)


def history(agent, doc_id: str = "d1") -> list[dict]:  # type: ignore[no-untyped-def]
    res = agent.get(f"/api/documents/{doc_id}/history")
    assert res.status_code == 200, res.text
    return res.json()["snapshots"]


class TestHistory:
    def test_the_replaced_version_is_snapshotted_at_most_every_few_minutes(self, api: Api) -> None:
        author = api.sign_in(AUTHOR)
        author.put("/api/documents/d1", json=doc("d1", title="v1"))
        assert history(author) == []  # nothing replaced yet
        author.put("/api/documents/d1", json=doc("d1", title="v2"))
        author.put("/api/documents/d1", json=doc("d1", title="v3"))  # within the interval: no second snapshot
        snaps = history(author)
        assert [s["doc"]["metadata"]["title"] for s in snaps] == ["v1"]
        assert snaps[0]["label"] == "Auto-saved version"

    def test_an_unchanged_save_takes_no_snapshot(self, api: Api, no_snapshot_interval: None) -> None:
        author = api.sign_in(AUTHOR)
        author.put("/api/documents/d1", json=doc("d1"))
        author.put("/api/documents/d1", json=doc("d1"))
        assert history(author) == []

    def test_keeps_the_latest_ten(self, api: Api, no_snapshot_interval: None) -> None:
        author = api.sign_in(AUTHOR)
        for i in range(13):
            author.put("/api/documents/d1", json=doc("d1", title=f"v{i}"))
        titles = [s["doc"]["metadata"]["title"] for s in history(author)]
        assert titles == [f"v{i}" for i in range(11, 1, -1)]

    def test_visible_to_whoever_can_see_the_document(self, api: Api) -> None:
        api.sign_in(AUTHOR).put("/api/documents/d1", json=doc("d1", status="APPROVED"))
        assert api.sign_in(OTHER).get("/api/documents/d1/history").status_code == 404
        assert api.sign_in(ADMIN).get("/api/documents/d1/history").status_code == 200

    def test_restore_makes_a_version_current_and_can_itself_be_undone(self, api: Api) -> None:
        author = api.sign_in(AUTHOR)
        author.put("/api/documents/d1", json=doc("d1", title="Original"))
        author.put("/api/documents/d1", json=doc("d1", title="Edited"))
        original = history(author)[0]

        res = author.post(f"/api/documents/d1/history/{original['id']}/restore")
        assert res.status_code == 200
        assert res.json()["document"]["metadata"]["title"] == "Original"
        assert author.get("/api/documents/d1").json()["document"]["metadata"]["title"] == "Original"

        before_restore = history(author)[0]
        assert before_restore["label"] == "Before restore"
        assert before_restore["doc"]["metadata"]["title"] == "Edited"
        author.post(f"/api/documents/d1/history/{before_restore['id']}/restore")
        assert author.get("/api/documents/d1").json()["document"]["metadata"]["title"] == "Edited"

    def test_restore_follows_the_edit_rule(self, api: Api) -> None:
        author = api.sign_in(AUTHOR)
        author.put("/api/documents/d1", json=doc("d1", title="a"))
        author.put("/api/documents/d1", json=doc("d1", title="b"))
        snap = history(author)[0]["id"]
        assert api.sign_in(OTHER).post(f"/api/documents/d1/history/{snap}/restore").status_code == 403
        assert author.post("/api/documents/d1/history/nope/restore").status_code == 404

    def test_purge_removes_the_history(self, api: Api) -> None:
        author = api.sign_in(AUTHOR)
        author.put("/api/documents/d1", json=doc("d1", title="a"))
        author.put("/api/documents/d1", json=doc("d1", title="b"))
        author.delete("/api/documents/d1/purge")
        author.put("/api/documents/d1", json=doc("d1", title="new"))
        assert history(author) == []


class TestListCache:
    def test_every_write_is_visible_in_the_next_list(self, api: Api) -> None:
        author = api.sign_in(AUTHOR)
        ids = lambda: [d["metadata"]["id"] for d in author.get("/api/documents").json()["documents"]]  # noqa: E731
        author.put("/api/documents/a", json=doc("a"))
        assert ids() == ["a"]  # now cached
        author.put("/api/documents/b", json=doc("b"))
        assert ids() == ["b", "a"]
        author.put("/api/documents/a", json=doc("a", title="changed"))
        assert author.get("/api/documents").json()["documents"][0]["metadata"]["title"] == "changed"
        author.delete("/api/documents/a")
        assert ids() == ["b"]
        author.delete("/api/documents/b/purge")
        assert ids() == []

    def test_the_cached_list_still_applies_visibility(self, api: Api) -> None:
        api.sign_in(AUTHOR).put("/api/documents/a", json=doc("a", status="APPROVED"))
        api.sign_in(ADMIN).get("/api/documents")  # cache filled by an admin
        assert api.sign_in(OTHER).get("/api/documents").json()["documents"] == []


class TestDocBin:
    def entry(self, entry_id: str) -> dict:
        return {"id": entry_id, "documentId": "d1", "documentTitle": "D", "itemType": "document", "deletedAt": "x"}

    def test_each_user_sees_their_own_bin_and_admins_see_all(self, api: Api) -> None:
        author, other = api.sign_in(AUTHOR), api.sign_in(OTHER)
        author.put("/api/collections/doc-bin/e1", json=self.entry("e1"))
        other.put("/api/collections/doc-bin/e2", json=self.entry("e2"))
        ids = lambda agent: [i["id"] for i in agent.get("/api/collections/doc-bin").json()["items"]]  # noqa: E731
        assert ids(author) == ["e1"]
        assert ids(other) == ["e2"]
        assert ids(api.sign_in(ADMIN)) == ["e1", "e2"]
        assert other.delete("/api/collections/doc-bin/e1").status_code == 404  # not even told it exists
        assert other.put("/api/collections/doc-bin/e1", json=self.entry("e1")).status_code == 404
