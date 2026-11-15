"""Documents belong to a user id, not to a display name (migration 0005)."""

from dataclasses import replace
from typing import Any

from app.models.user import User
from tests.conftest import ADMIN, AUTHOR, OTHER, Api
from tests.test_documents import doc


def add_user(api: Api, user_id: str, name: str) -> None:
    api.store.add_user(User(user_id, name, f"{user_id}@example.com", "Engineer", "Eng", "user", None, None), "pw")


def owner_of(api: Api, document_id: str) -> str | None:
    return api.store.documents[document_id].write.owner_id


def sign_in_new(api: Api, user_id: str) -> Any:
    res = api.client.post("/api/auth/login", json={"email": f"{user_id}@example.com", "password": "pw"})
    assert res.status_code == 200, res.text
    cookie = res.cookies.get("devdoc_sid")
    api.client.cookies.clear()
    from tests.conftest import Agent

    return Agent(api.client, cookie)


class TestOwnerIsAUserId:
    def test_a_saved_document_records_its_authors_id(self, api: Api) -> None:
        api.sign_in(AUTHOR).put("/api/documents/d1", json=doc("d1"))
        assert owner_of(api, "d1") == AUTHOR.id

    def test_two_users_with_the_same_name_do_not_share_edit_rights(self, api: Api) -> None:
        add_user(api, "usr-twin", AUTHOR.name)  # same display name as AUTHOR
        api.sign_in(AUTHOR).put("/api/documents/d1", json=doc("d1"))
        res = sign_in_new(api, "usr-twin").put("/api/documents/d1", json=doc("d1", title="Hijacked"))
        assert res.status_code == 403

    def test_renaming_a_user_does_not_lock_them_out(self, api: Api) -> None:
        author = api.sign_in(AUTHOR)
        author.put("/api/documents/d1", json=doc("d1"))
        stored = api.store.users[AUTHOR.id]
        api.store.users[AUTHOR.id] = replace(stored, user=replace(stored.user, name="Vaishnavi Renamed"))
        res = author.put("/api/documents/d1", json=doc("d1", title="Still mine"))
        assert res.status_code == 200
        assert res.json()["document"]["metadata"]["author"] == "Vaishnavi Renamed"  # the shown name follows

    def test_a_document_with_no_owner_can_only_be_edited_by_an_admin(self, api: Api) -> None:
        author = api.sign_in(AUTHOR)
        author.put("/api/documents/d1", json=doc("d1"))
        stored = api.store.documents["d1"]
        stored.write = replace(stored.write, owner_id=None)  # what migration 0005 leaves for an unmatched author

        assert author.put("/api/documents/d1", json=doc("d1", title="x")).status_code == 403
        assert author.delete("/api/documents/d1").status_code == 403
        admin = api.sign_in(ADMIN)
        assert admin.put("/api/documents/d1", json=doc("d1", title="Fixed by admin")).status_code == 200
        assert owner_of(api, "d1") is None  # unchanged author name: still unowned, nothing is guessed


class TestAdminAssigningAnAuthor:
    def test_a_new_author_name_must_match_exactly_one_user_and_becomes_the_owner(self, api: Api) -> None:
        api.sign_in(AUTHOR).put("/api/documents/d1", json=doc("d1"))
        res = api.sign_in(ADMIN).put("/api/documents/d1", json=doc("d1", author=OTHER.name.upper()))
        assert res.status_code == 200
        assert res.json()["document"]["metadata"]["author"] == OTHER.name  # the user's real name, not the typed case
        assert owner_of(api, "d1") == OTHER.id
        assert api.sign_in(OTHER).put("/api/documents/d1", json=doc("d1", title="Mine now")).status_code == 200
        assert api.sign_in(AUTHOR).put("/api/documents/d1", json=doc("d1", title="Not any more")).status_code == 403

    def test_an_unknown_name_is_refused(self, api: Api) -> None:
        res = api.sign_in(ADMIN).put("/api/documents/d1", json=doc("d1", author="Nobody Atall"))
        assert res.status_code == 400
        assert res.json() == {"error": 'There is no user named "Nobody Atall". Choose an existing user as the author.'}
        assert "d1" not in api.store.documents

    def test_a_name_shared_by_two_users_is_refused(self, api: Api) -> None:
        add_user(api, "usr-twin", OTHER.name)
        res = api.sign_in(ADMIN).put("/api/documents/d1", json=doc("d1", author=OTHER.name))
        assert res.status_code == 409
        assert "More than one user" in res.json()["error"]

    def test_leaving_the_author_alone_keeps_the_owner_even_if_the_name_is_now_ambiguous(self, api: Api) -> None:
        api.sign_in(AUTHOR).put("/api/documents/d1", json=doc("d1"))
        add_user(api, "usr-twin", AUTHOR.name)  # now two users share the author's name
        res = api.sign_in(ADMIN).put("/api/documents/d1", json=doc("d1", title="Admin edit"))
        assert res.status_code == 200
        assert owner_of(api, "d1") == AUTHOR.id

    def test_a_regular_user_cannot_hand_a_document_to_someone_else(self, api: Api) -> None:
        author = api.sign_in(AUTHOR)
        author.put("/api/documents/d1", json=doc("d1"))
        author.put("/api/documents/d1", json=doc("d1", author=OTHER.name))
        assert owner_of(api, "d1") == AUTHOR.id


class TestRestore:
    def test_restoring_a_version_does_not_change_the_owner(self, api: Api) -> None:
        api.sign_in(AUTHOR).put("/api/documents/d1", json=doc("d1", title="v1"))
        admin = api.sign_in(ADMIN)
        admin.put("/api/documents/d1", json=doc("d1", title="v2", author=OTHER.name))  # reassigned; v1 is snapshotted
        snapshot = admin.get("/api/documents/d1/history").json()["snapshots"][0]
        assert snapshot["doc"]["metadata"]["author"] == AUTHOR.name  # the old version names the old author

        assert admin.post(f"/api/documents/d1/history/{snapshot['id']}/restore").status_code == 200
        assert owner_of(api, "d1") == OTHER.id
        assert api.store.documents["d1"].write.author == OTHER.name


class TestOwnerIdIsExposedToTheUi:
    """So the browser can decide who may edit by user id, the same way the server does."""

    def test_get_and_list_carry_the_owner_id(self, api: Api) -> None:
        author = api.sign_in(AUTHOR)
        author.put("/api/documents/d1", json=doc("d1"))
        assert author.get("/api/documents/d1").json()["document"]["ownerId"] == AUTHOR.id
        assert [d["ownerId"] for d in author.get("/api/documents").json()["documents"]] == [AUTHOR.id]

    def test_a_document_with_no_owner_says_null(self, api: Api) -> None:
        author = api.sign_in(AUTHOR)
        author.put("/api/documents/d1", json=doc("d1"))
        stored = api.store.documents["d1"]
        stored.write = replace(stored.write, owner_id=None)
        assert author.get("/api/documents/d1").json()["document"]["ownerId"] is None

    def test_a_reassigned_document_shows_its_new_owner(self, api: Api) -> None:
        api.sign_in(AUTHOR).put("/api/documents/d1", json=doc("d1"))
        api.sign_in(ADMIN).put("/api/documents/d1", json=doc("d1", author=OTHER.name))
        assert api.sign_in(OTHER).get("/api/documents/d1").json()["document"]["ownerId"] == OTHER.id

    def test_the_saved_document_is_never_stored_with_an_owner_id_inside_it(self, api: Api) -> None:
        body = doc("d1")
        body["ownerId"] = "usr-someone-else"  # a client echoing back what it read, or forging it
        res = api.sign_in(AUTHOR).put("/api/documents/d1", json=body)
        assert "ownerId" not in res.json()["document"]  # PUT echoes the saved model as before
        assert "ownerId" not in api.store.documents["d1"].write.document_json
        assert owner_of(api, "d1") == AUTHOR.id
