from typing import Any

from tests.conftest import ADMIN, AUTHOR, OTHER, Agent, Api

BASE = "/api/test-management"


def suite(suite_id: str = "s1", **overrides: Any) -> dict[str, Any]:
    return {
        "id": suite_id,
        "title": "RTC Suite",
        "description": "",
        "module": "Firmware",
        "createdAt": "x",
        **overrides,
    }


def case(case_id: str = "c1", **overrides: Any) -> dict[str, Any]:
    return {"id": case_id, "customId": "TC-1", "title": "Clock drift", "steps": [], "priority": "P1", **overrides}


def make_suite(agent: Agent, suite_id: str = "s1") -> None:
    assert agent.put(f"{BASE}/suites/{suite_id}", json=suite(suite_id)).status_code == 200


class TestAccess:
    def test_every_route_needs_a_session(self, api: Api) -> None:
        anon = api.anonymous()
        for res in (
            anon.get(BASE),
            anon.put(f"{BASE}/suites/s1", json=suite()),
            anon.delete(f"{BASE}/runs/r1"),
            anon.post(f"{BASE}/nope"),
        ):
            assert res.status_code == 401
            assert res.json() == {"error": "Not signed in."}


class TestSnapshot:
    def test_starts_empty_and_unseeded(self, api: Api) -> None:
        res = api.sign_in(AUTHOR).get(BASE)
        assert res.status_code == 200
        assert res.json() == {"suites": [], "runs": [], "milestones": [], "seeded": False}

    def test_nests_sections_and_cases_in_creation_order(self, api: Api) -> None:
        author = api.sign_in(AUTHOR)
        make_suite(author, "s1")
        make_suite(author, "s0")
        author.put(f"{BASE}/suites/s1/sections/sec", json={"title": "Manual", "order": 0})
        for cid in ("c2", "c1", "c3"):
            author.put(f"{BASE}/suites/s1/cases/{cid}", json=case(cid))
        author.put(f"{BASE}/suites/s1/cases/c2", json=case("c2", title="Edited"))  # keeps its place

        suites = api.sign_in(OTHER).get(BASE).json()["suites"]
        assert [s["id"] for s in suites] == ["s1", "s0"]
        assert suites[0]["sections"][0]["suiteId"] == "s1"
        assert [c["id"] for c in suites[0]["testCases"]] == ["c2", "c1", "c3"]
        assert suites[0]["testCases"][0]["title"] == "Edited"
        assert suites[1] | {"sections": [], "testCases": []} == suites[1]
        assert "_seq" not in suites[0]["testCases"][0]


class TestSuites:
    def test_server_sets_id_owner_and_drops_nested_children(self, api: Api) -> None:
        body = suite("other-id", createdBy="someone else", testCases=[case()], sections=[])
        res = api.sign_in(AUTHOR).put(f"{BASE}/suites/s1", json=body)
        saved = res.json()["suite"]
        assert saved["id"] == "s1"
        assert saved["createdBy"] == AUTHOR.name
        assert "testCases" not in saved and "sections" not in saved
        assert api.sign_in(AUTHOR).get(BASE).json()["suites"][0]["testCases"] == []

    def test_title_is_required(self, api: Api) -> None:
        author = api.sign_in(AUTHOR)
        assert author.put(f"{BASE}/suites/s1", json=suite(title="  ")).status_code == 400
        assert author.put(f"{BASE}/suites/s1", json=[1]).json() == {"error": "Body must be a JSON object."}

    def test_only_the_owner_or_an_admin_can_change_a_suite(self, api: Api) -> None:
        make_suite(api.sign_in(AUTHOR))
        other = api.sign_in(OTHER)
        assert other.put(f"{BASE}/suites/s1", json=suite(title="Hijack")).status_code == 403
        assert other.delete(f"{BASE}/suites/s1").status_code == 403

        admin = api.sign_in(ADMIN)
        res = admin.put(f"{BASE}/suites/s1", json=suite(title="Renamed"))
        assert res.status_code == 200
        assert res.json()["suite"]["createdBy"] == AUTHOR.name  # an edit doesn't change the owner

    def test_delete_removes_sections_and_cases(self, api: Api) -> None:
        author = api.sign_in(AUTHOR)
        make_suite(author)
        author.put(f"{BASE}/suites/s1/cases/c1", json=case())
        assert author.delete(f"{BASE}/suites/s1").status_code == 204
        make_suite(author)  # recreate: no leftover cases
        assert author.get(BASE).json()["suites"][0]["testCases"] == []
        assert author.delete(f"{BASE}/suites/missing").status_code == 404


class TestSectionsAndCases:
    def test_belong_to_the_suite_owner(self, api: Api) -> None:
        author = api.sign_in(AUTHOR)
        make_suite(author)
        other = api.sign_in(OTHER)
        assert other.put(f"{BASE}/suites/s1/cases/c1", json=case()).status_code == 403
        assert other.put(f"{BASE}/suites/s1/sections/x", json={"title": "x"}).status_code == 403

        assert (
            author.put(f"{BASE}/suites/s1/cases/c1", json=case(suiteId="elsewhere")).json()["testCase"]["suiteId"]
            == "s1"
        )
        assert other.delete(f"{BASE}/suites/s1/cases/c1").status_code == 403
        assert api.sign_in(ADMIN).delete(f"{BASE}/suites/s1/cases/c1").status_code == 204

    def test_missing_suite_or_item_is_404(self, api: Api) -> None:
        author = api.sign_in(AUTHOR)
        assert author.put(f"{BASE}/suites/nope/cases/c1", json=case()).status_code == 404
        make_suite(author)
        assert author.delete(f"{BASE}/suites/s1/cases/nope").status_code == 404
        assert author.delete(f"{BASE}/suites/s1/sections/nope").status_code == 404

    def test_case_title_is_required(self, api: Api) -> None:
        author = api.sign_in(AUTHOR)
        make_suite(author)
        assert author.put(f"{BASE}/suites/s1/cases/c1", json=case(title=None)).status_code == 400


class TestRunsAndMilestones:
    def test_owner_rules(self, api: Api) -> None:
        author, other = api.sign_in(AUTHOR), api.sign_in(OTHER)
        run = {"name": "Regression", "suiteId": "s1", "status": "In Progress", "passedCount": 0}
        assert author.put(f"{BASE}/runs/r1", json=run).json()["run"]["createdBy"] == AUTHOR.name
        assert other.put(f"{BASE}/runs/r1", json=run).status_code == 403
        assert other.delete(f"{BASE}/runs/r1").status_code == 403
        assert author.delete(f"{BASE}/runs/r1").status_code == 204
        assert author.delete(f"{BASE}/runs/r1").status_code == 404

        assert author.put(f"{BASE}/milestones/m1", json={"name": ""}).status_code == 400
        assert author.put(f"{BASE}/milestones/m1", json={"name": "v1", "testRunIds": []}).status_code == 200
        assert api.sign_in(ADMIN).delete(f"{BASE}/milestones/m1").status_code == 204


class TestSeed:
    def test_loads_sample_data_once(self, api: Api) -> None:
        sample = {
            "suites": [suite("s1", sections=[{"id": "sec", "title": "Manual"}], testCases=[case()])],
            "runs": [{"id": "r1", "name": "Run"}],
            "milestones": [{"id": "m1", "name": "M"}],
        }
        author = api.sign_in(AUTHOR)
        res = author.post(f"{BASE}/seed", json=sample)
        assert res.status_code == 200
        body = res.json()
        assert body["seeded"] is True
        assert body["suites"][0]["testCases"][0]["createdBy"] == AUTHOR.name
        assert body["runs"][0]["id"] == "r1" and body["milestones"][0]["id"] == "m1"

        assert api.sign_in(OTHER).post(f"{BASE}/seed", json=sample).status_code == 409

    def test_rejects_a_malformed_body_without_claiming_the_seed(self, api: Api) -> None:
        author = api.sign_in(AUTHOR)
        assert author.post(f"{BASE}/seed", json={"suites": []}).status_code == 400
        assert author.get(BASE).json()["seeded"] is False
