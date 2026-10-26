from datetime import datetime
from typing import Any

from tests.conftest import ADMIN, AUTHOR, OTHER, Api


def doc(doc_id: str, **overrides: Any) -> dict[str, Any]:
    return {
        "metadata": {
            "id": doc_id,
            "title": "Firmware Report",
            "docNumber": "FW-1",
            "author": AUTHOR.name,
            "date": "2026-09-28",
            "version": "1.0",
            "classification": "INTERNAL ONLY",
            "status": "DRAFT",
            "templateType": "technical-analysis",
            **overrides,
        },
        "sections": [{"id": "s1", "title": "Purpose", "level": 1, "type": "richText", "content": "x"}],
    }


class TestAuthenticationRequired:
    def test_every_documents_route_is_401_without_a_session(self, api: Api) -> None:
        anon = api.anonymous()
        for res in (
            anon.get("/api/documents"),
            anon.get("/api/documents/d1"),
            anon.put("/api/documents/d1", json=doc("d1")),
            anon.delete("/api/documents/d1"),
            anon.delete("/api/documents/d1/purge"),
            anon.post("/api/documents/d1"),  # no such route: still 401 first
        ):
            assert res.status_code == 401
            assert res.json() == {"error": "Not signed in."}

    def test_unknown_route_under_the_prefix_is_express_404_once_signed_in(self, api: Api) -> None:
        res = api.sign_in(AUTHOR).post("/api/documents/d1")
        assert res.status_code == 404
        assert "<pre>Cannot POST /api/documents/d1</pre>" in res.text


class TestPut:
    def test_creates_a_document_forcing_the_author_to_the_signed_in_user(self, api: Api) -> None:
        res = api.sign_in(AUTHOR).put("/api/documents/d1", json=doc("d1", author="Someone Else"))
        assert res.status_code == 200
        assert res.json()["document"]["metadata"]["author"] == AUTHOR.name

    def test_echoes_the_document_with_id_and_author_in_place_and_no_updated_at(self, api: Api) -> None:
        body = doc("ignored", extra=1)
        body["unknownTopLevel"] = True
        saved = api.sign_in(AUTHOR).put("/api/documents/d1", json=body).json()["document"]
        assert list(saved) == ["metadata", "sections"]
        assert saved["metadata"]["id"] == "d1"
        assert list(saved["metadata"])[:4] == ["id", "title", "docNumber", "author"]

    def test_lets_the_author_update_their_own_document(self, api: Api) -> None:
        agent = api.sign_in(AUTHOR)
        agent.put("/api/documents/d1", json=doc("d1"))
        res = agent.put("/api/documents/d1", json=doc("d1", title="Updated title"))
        assert res.status_code == 200
        assert res.json()["document"]["metadata"]["title"] == "Updated title"

    def test_refuses_to_let_someone_else_edit_it(self, api: Api) -> None:
        api.sign_in(AUTHOR).put("/api/documents/d1", json=doc("d1"))
        res = api.sign_in(OTHER).put("/api/documents/d1", json=doc("d1", title="Hijacked"))
        assert res.status_code == 403
        assert res.json() == {"error": "You can only edit documents you authored."}

    def test_lets_an_admin_edit_any_document_and_keep_its_author(self, api: Api) -> None:
        api.sign_in(AUTHOR).put("/api/documents/d1", json=doc("d1"))
        res = api.sign_in(ADMIN).put("/api/documents/d1", json=doc("d1", title="Admin edit"))
        assert res.status_code == 200
        assert res.json()["document"]["metadata"]["title"] == "Admin edit"
        assert res.json()["document"]["metadata"]["author"] == AUTHOR.name

    def test_rejects_a_malformed_body(self, api: Api) -> None:
        agent = api.sign_in(AUTHOR)
        for body in ({"title": "not a real document"}, {"metadata": "x", "sections": []}, {"metadata": {}}):
            res = agent.put("/api/documents/d1", json=body)
            assert res.status_code == 400
            assert res.json() == {"error": "Body must be a document with metadata and sections."}

    def test_rejects_an_invalid_status(self, api: Api) -> None:
        res = api.sign_in(AUTHOR).put("/api/documents/d1", json=doc("d1", status="MADE_UP"))
        assert res.status_code == 400
        assert res.json() == {"error": "status must be one of DRAFT, IN_REVIEW, APPROVED, PUBLISHED."}

    def test_an_empty_array_status_is_truthy_and_so_invalid_like_in_js(self, api: Api) -> None:
        assert api.sign_in(AUTHOR).put("/api/documents/d1", json=doc("d1", status=[])).status_code == 400

    def test_a_missing_required_column_is_a_500_not_a_hang(self, api: Api) -> None:
        body = doc("d1")
        del body["metadata"]["title"]
        assert api.sign_in(AUTHOR).put("/api/documents/d1", json=body).status_code == 500


class TestGet:
    def test_list_includes_an_iso_updated_at_per_document(self, api: Api) -> None:
        agent = api.sign_in(AUTHOR)
        agent.put("/api/documents/a", json=doc("a"))
        updated_at = agent.get("/api/documents").json()["documents"][0]["updatedAt"]
        assert updated_at.endswith("Z") and len(updated_at) == 24
        datetime.fromisoformat(updated_at)

    def test_get_one_includes_updated_at_last(self, api: Api) -> None:
        agent = api.sign_in(AUTHOR)
        agent.put("/api/documents/a", json=doc("a"))
        document = agent.get("/api/documents/a").json()["document"]
        assert list(document) == ["metadata", "sections", "updatedAt"]

    def test_most_recently_updated_first(self, api: Api) -> None:
        agent = api.sign_in(AUTHOR)
        for doc_id in ("a", "b", "c"):
            agent.put(f"/api/documents/{doc_id}", json=doc(doc_id))
        agent.put("/api/documents/a", json=doc("a"))
        ids = [d["metadata"]["id"] for d in agent.get("/api/documents").json()["documents"]]
        assert ids == ["a", "c", "b"]

    def test_a_non_admin_only_sees_in_progress_documents(self, api: Api) -> None:
        agent = api.sign_in(AUTHOR)
        agent.put("/api/documents/a", json=doc("a", status="DRAFT"))
        agent.put("/api/documents/b", json=doc("b", status="APPROVED"))
        agent.put("/api/documents/c", json=doc("c", status="IN_REVIEW"))
        ids = sorted(d["metadata"]["id"] for d in agent.get("/api/documents").json()["documents"])
        assert ids == ["a", "c"]

    def test_an_admin_sees_every_document(self, api: Api) -> None:
        agent = api.sign_in(AUTHOR)
        agent.put("/api/documents/a", json=doc("a", status="DRAFT"))
        agent.put("/api/documents/b", json=doc("b", status="APPROVED"))
        assert len(api.sign_in(ADMIN).get("/api/documents").json()["documents"]) == 2

    def test_an_invisible_document_404s_on_direct_fetch_too(self, api: Api) -> None:
        api.sign_in(AUTHOR).put("/api/documents/a", json=doc("a", status="APPROVED"))
        res = api.sign_in(OTHER).get("/api/documents/a")
        assert res.status_code == 404
        assert res.json() == {"error": "Document not found."}

    def test_numbers_round_trip_the_way_javascript_sees_them(self, api: Api) -> None:
        agent = api.sign_in(AUTHOR)
        agent.put(
            "/api/documents/a",
            content=b'{"metadata":{"id":"a","title":"t","docNumber":"1","status":"DRAFT","n":1.0,"big":1e20},'
            b'"sections":[{"2":"b","1":"a","x":0.5}]}',
            headers={"Content-Type": "application/json"},
        )
        raw = agent.get("/api/documents/a").text
        assert '"n":1,' in raw and '"big":100000000000000000000' in raw
        assert '[{"1":"a","2":"b","x":0.5}]' in raw


class TestDelete:
    def test_soft_deletes(self, api: Api) -> None:
        agent = api.sign_in(AUTHOR)
        agent.put("/api/documents/a", json=doc("a"))
        res = agent.delete("/api/documents/a")
        assert res.status_code == 204
        assert agent.get("/api/documents/a").status_code == 404
        assert api.store.document_deleted_at("a") is not None

    def test_refuses_to_let_a_non_author_delete_it(self, api: Api) -> None:
        api.sign_in(AUTHOR).put("/api/documents/a", json=doc("a"))
        res = api.sign_in(OTHER).delete("/api/documents/a")
        assert res.status_code == 403
        assert res.json() == {"error": "You can only delete documents you authored."}

    def test_404s_for_an_id_that_was_never_created(self, api: Api) -> None:
        assert api.sign_in(AUTHOR).delete("/api/documents/does-not-exist").status_code == 404

    def test_saving_again_restores_a_soft_deleted_document(self, api: Api) -> None:
        agent = api.sign_in(AUTHOR)
        agent.put("/api/documents/a", json=doc("a"))
        agent.delete("/api/documents/a")
        agent.put("/api/documents/a", json=doc("a"))
        assert agent.get("/api/documents/a").status_code == 200


class TestPurge:
    def test_removes_the_row_even_one_already_soft_deleted(self, api: Api) -> None:
        agent = api.sign_in(AUTHOR)
        agent.put("/api/documents/a", json=doc("a"))
        agent.delete("/api/documents/a")
        assert agent.delete("/api/documents/a/purge").status_code == 204
        assert "a" not in api.store.documents

    def test_works_on_a_document_never_soft_deleted(self, api: Api) -> None:
        agent = api.sign_in(AUTHOR)
        agent.put("/api/documents/a", json=doc("a"))
        assert agent.delete("/api/documents/a/purge").status_code == 204
        assert "a" not in api.store.documents

    def test_refuses_to_let_a_non_author_purge_it(self, api: Api) -> None:
        api.sign_in(AUTHOR).put("/api/documents/a", json=doc("a"))
        assert api.sign_in(OTHER).delete("/api/documents/a/purge").status_code == 403
        assert "a" in api.store.documents

    def test_lets_an_admin_purge_any_document(self, api: Api) -> None:
        api.sign_in(AUTHOR).put("/api/documents/a", json=doc("a"))
        assert api.sign_in(ADMIN).delete("/api/documents/a/purge").status_code == 204

    def test_404s_for_an_id_that_was_never_created(self, api: Api) -> None:
        assert api.sign_in(AUTHOR).delete("/api/documents/does-not-exist/purge").status_code == 404
