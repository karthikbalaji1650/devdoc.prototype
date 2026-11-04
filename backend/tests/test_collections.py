"""Shared collections that replaced per-browser storage."""

from tests.conftest import ADMIN, AUTHOR, OTHER, Api

BASE = "/api/collections"


def test_needs_a_session_and_a_known_collection(api: Api) -> None:
    assert api.anonymous().get(f"{BASE}/test-case-library").status_code == 401
    res = api.sign_in(AUTHOR).get(f"{BASE}/nope")
    assert res.status_code == 404
    assert res.json() == {"error": "No such collection."}


def test_items_are_shared_in_creation_order(api: Api) -> None:
    author = api.sign_in(AUTHOR)
    for cid in ("TC-2", "TC-1"):
        assert author.put(f"{BASE}/test-case-library/{cid}", json={"customId": cid, "title": "t"}).status_code == 200
    body = api.sign_in(OTHER).get(f"{BASE}/test-case-library").json()
    assert [i["id"] for i in body["items"]] == ["TC-2", "TC-1"]
    assert body["items"][0]["createdBy"] == AUTHOR.name
    assert body["seeded"] is False


def test_required_fields(api: Api) -> None:
    res = api.sign_in(AUTHOR).put(f"{BASE}/test-case-library/x", json={"customId": "x"})
    assert res.json() == {"error": "title is required."}


def test_only_the_creator_or_an_admin_changes_an_item(api: Api) -> None:
    api.sign_in(AUTHOR).put(f"{BASE}/test-suite-library/s", json={"title": "Suite"})
    other = api.sign_in(OTHER)
    assert other.put(f"{BASE}/test-suite-library/s", json={"title": "Mine"}).status_code == 403
    assert other.delete(f"{BASE}/test-suite-library/s").status_code == 403
    admin = api.sign_in(ADMIN)
    assert admin.put(f"{BASE}/test-suite-library/s", json={"title": "Fixed"}).json()["item"]["createdBy"] == AUTHOR.name
    assert admin.delete(f"{BASE}/test-suite-library/s").status_code == 204
    assert admin.delete(f"{BASE}/test-suite-library/s").status_code == 404


def test_the_named_reviewer_can_update_a_reviewers_log_entry(api: Api) -> None:
    entry = {"docTitle": "Spec", "reviewerName": OTHER.name, "reviewStatus": "PENDING"}
    api.sign_in(AUTHOR).put(f"{BASE}/reviewers-log/r1", json=entry)
    other = api.sign_in(OTHER)
    assert other.put(f"{BASE}/reviewers-log/r1", json={**entry, "reviewStatus": "APPROVED"}).status_code == 200
    assert other.delete(f"{BASE}/reviewers-log/r1").status_code == 403  # updating isn't deleting
    third = {"docTitle": "Spec", "reviewerName": AUTHOR.name, "reviewStatus": "PENDING"}
    api.sign_in(ADMIN).put(f"{BASE}/reviewers-log/r2", json=third)
    assert other.put(f"{BASE}/reviewers-log/r2", json=third).status_code == 403


def test_logs_are_append_only_and_keep_the_latest(api: Api) -> None:
    author = api.sign_in(AUTHOR)
    for i in range(52):
        assert author.put(f"{BASE}/drive-exports/e{i}", json={"docTitle": f"D{i}"}).status_code == 200
    items = author.get(f"{BASE}/drive-exports").json()["items"]
    assert len(items) == 50
    assert items[0]["id"] == "e2" and items[-1]["id"] == "e51"
    res = author.put(f"{BASE}/drive-exports/e51", json={"docTitle": "changed"})
    assert res.status_code == 409


def test_seed_once(api: Api) -> None:
    author = api.sign_in(AUTHOR)
    items = [{"id": "rev-01", "docTitle": "D", "reviewerName": "R", "reviewStatus": "APPROVED"}]
    assert author.post(f"{BASE}/reviewers-log/seed", json={"items": items}).json()["seeded"] is True
    assert api.sign_in(OTHER).post(f"{BASE}/reviewers-log/seed", json={"items": items}).status_code == 409
    assert author.post(f"{BASE}/reviewers-log/seed", json={}).status_code == 400
