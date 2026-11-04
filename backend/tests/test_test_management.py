import json
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
    return {"id": case_id, "customId": "TC-1", "title": "Clock drift", "steps": [], "priority": "Critical", **overrides}


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
        assert res.json() == {"projects": [], "suites": [], "runs": [], "milestones": [], "seeded": False}

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


class TestProjects:
    """DDS-SRS-012: Projects > Suites."""

    def test_snapshot_lists_projects(self, api: Api) -> None:
        author = api.sign_in(AUTHOR)
        assert author.get(BASE).json()["projects"] == []
        assert author.put(f"{BASE}/projects/p1", json={"name": "AST2600"}).status_code == 200
        projects = api.sign_in(OTHER).get(BASE).json()["projects"]
        assert [(p["id"], p["name"], p["createdBy"]) for p in projects] == [("p1", "AST2600", AUTHOR.name)]

    def test_name_required_and_owner_rules(self, api: Api) -> None:
        author, other = api.sign_in(AUTHOR), api.sign_in(OTHER)
        assert author.put(f"{BASE}/projects/p1", json={"name": " "}).status_code == 400
        author.put(f"{BASE}/projects/p1", json={"name": "P"})
        assert other.put(f"{BASE}/projects/p1", json={"name": "Mine now"}).status_code == 403
        assert other.delete(f"{BASE}/projects/p1").status_code == 403

    def test_anyone_can_put_their_own_suite_in_a_project(self, api: Api) -> None:
        api.sign_in(AUTHOR).put(f"{BASE}/projects/p1", json={"name": "P"})
        other = api.sign_in(OTHER)
        res = other.put(f"{BASE}/suites/s1", json=suite(projectId="p1"))
        assert res.status_code == 200
        assert res.json()["suite"]["projectId"] == "p1"

    def test_suite_project_must_exist(self, api: Api) -> None:
        res = api.sign_in(AUTHOR).put(f"{BASE}/suites/s1", json=suite(projectId="nope"))
        assert res.status_code == 400
        assert res.json() == {"error": "Project not found."}

    def test_a_project_with_suites_cannot_be_deleted(self, api: Api) -> None:
        author = api.sign_in(AUTHOR)
        author.put(f"{BASE}/projects/p1", json={"name": "P"})
        author.put(f"{BASE}/suites/s1", json=suite(projectId="p1"))
        assert author.delete(f"{BASE}/projects/p1").status_code == 409
        author.put(f"{BASE}/suites/s1", json=suite(projectId=None))
        assert author.delete(f"{BASE}/projects/p1").status_code == 204

    def test_seed_loads_projects(self, api: Api) -> None:
        sample = {
            "projects": [{"id": "p1", "name": "P"}],
            "suites": [suite("s1", projectId="p1")],
            "runs": [],
            "milestones": [],
        }
        body = api.sign_in(AUTHOR).post(f"{BASE}/seed", json=sample).json()
        assert body["projects"][0]["id"] == "p1"
        assert body["suites"][0]["projectId"] == "p1"


class TestSubSections:
    """DDS-SRS-012: Sections nest through parentId."""

    def test_a_sub_section_needs_a_parent_in_the_same_suite(self, api: Api) -> None:
        author = api.sign_in(AUTHOR)
        make_suite(author, "s1")
        make_suite(author, "s2")
        author.put(f"{BASE}/suites/s2/sections/elsewhere", json={"title": "x"})
        author.put(f"{BASE}/suites/s1/sections/a", json={"title": "A"})
        assert author.put(f"{BASE}/suites/s1/sections/b", json={"title": "B", "parentId": "a"}).status_code == 200
        res = author.put(f"{BASE}/suites/s1/sections/c", json={"title": "C", "parentId": "elsewhere"})
        assert res.json() == {"error": "Parent section not found."}

    def test_no_loops(self, api: Api) -> None:
        author = api.sign_in(AUTHOR)
        make_suite(author)
        author.put(f"{BASE}/suites/s1/sections/a", json={"title": "A"})
        author.put(f"{BASE}/suites/s1/sections/b", json={"title": "B", "parentId": "a"})
        for section_id, parent in (("a", "a"), ("a", "b")):
            res = author.put(f"{BASE}/suites/s1/sections/{section_id}", json={"title": "A", "parentId": parent})
            assert res.status_code == 400
            assert res.json() == {"error": "A section cannot be placed inside itself."}

    def test_only_an_empty_section_can_be_deleted(self, api: Api) -> None:
        author = api.sign_in(AUTHOR)
        make_suite(author)
        author.put(f"{BASE}/suites/s1/sections/a", json={"title": "A"})
        author.put(f"{BASE}/suites/s1/sections/b", json={"title": "B", "parentId": "a"})
        author.put(f"{BASE}/suites/s1/cases/c1", json=case(sectionId="b"))

        assert author.delete(f"{BASE}/suites/s1/sections/a").status_code == 409  # has a sub-section
        assert author.delete(f"{BASE}/suites/s1/sections/b").status_code == 409  # has a case
        author.put(f"{BASE}/suites/s1/cases/c1", json=case(sectionId="a"))
        assert author.delete(f"{BASE}/suites/s1/sections/b").status_code == 204


class TestCaseRevisions:
    """DDS-SRS-014."""

    def revisions(self, agent: Agent, case_id: str = "c1") -> list[dict[str, Any]]:
        res = agent.get(f"{BASE}/suites/s1/cases/{case_id}/revisions")
        assert res.status_code == 200, res.text
        return res.json()["revisions"]

    def test_every_change_is_a_revision_newest_first(self, api: Api) -> None:
        author = api.sign_in(AUTHOR)
        make_suite(author)
        author.put(f"{BASE}/suites/s1/cases/c1", json=case())
        author.put(f"{BASE}/suites/s1/cases/c1", json=case())  # nothing changed: no revision
        author.put(f"{BASE}/suites/s1/cases/c1", json=case(title="Drift under load", priority="P2"))
        api.sign_in(ADMIN).put(f"{BASE}/suites/s1/cases/c1", json=case(title="Drift under load", priority="P3"))

        revs = self.revisions(api.sign_in(OTHER))  # readable by anyone signed in
        assert [r["revision"] for r in revs] == [3, 2, 1]
        assert [r["changes"] for r in revs] == [["priority"], ["priority", "title"], []]
        assert [r["savedBy"] for r in revs] == [ADMIN.name, AUTHOR.name, AUTHOR.name]
        assert revs[2]["case"]["title"] == "Clock drift"
        assert "createdBy" not in revs[0]["case"] and "updatedAt" not in revs[0]["case"]

    def test_files_are_fingerprinted_not_copied(self, api: Api) -> None:
        author = api.sign_in(AUTHOR)
        make_suite(author)
        att = {"id": "a1", "name": "boot.log", "size": 3, "dataUrl": "data:text/plain;base64,QUJD"}
        author.put(f"{BASE}/suites/s1/cases/c1", json=case(attachments=[att], evidenceImage="data:image/png;base64,AA"))
        author.put(
            f"{BASE}/suites/s1/cases/c1",
            json=case(
                attachments=[{**att, "dataUrl": "data:text/plain;base64,WFla"}],
                evidenceImage="data:image/png;base64,AA",
            ),
        )
        latest, first = self.revisions(author)
        assert latest["changes"] == ["attachments"]
        assert "dataUrl" not in latest["case"]["attachments"][0]
        assert latest["case"]["attachments"][0]["hash"] != first["case"]["attachments"][0]["hash"]
        assert "evidenceImage" not in latest["case"] and len(latest["case"]["evidenceImageHash"]) == 12

    def test_history_is_capped(self, api: Api) -> None:
        author = api.sign_in(AUTHOR)
        make_suite(author)
        for i in range(55):
            author.put(f"{BASE}/suites/s1/cases/c1", json=case(title=f"v{i}"))
        revs = self.revisions(author)
        assert len(revs) == 50
        assert revs[0]["revision"] == 55 and revs[-1]["revision"] == 6

    def test_history_goes_with_the_case_or_suite(self, api: Api) -> None:
        author = api.sign_in(AUTHOR)
        make_suite(author)
        author.put(f"{BASE}/suites/s1/cases/c1", json=case())
        author.delete(f"{BASE}/suites/s1/cases/c1")
        assert author.get(f"{BASE}/suites/s1/cases/c1/revisions").status_code == 404
        author.put(f"{BASE}/suites/s1/cases/c1", json=case())
        assert [r["revision"] for r in self.revisions(author)] == [1]  # starts over

        author.delete(f"{BASE}/suites/s1")
        make_suite(author)
        author.put(f"{BASE}/suites/s1/cases/c1", json=case(title="new"))
        assert [r["revision"] for r in self.revisions(author)] == [1]

    def test_seeded_cases_start_with_a_revision(self, api: Api) -> None:
        author = api.sign_in(AUTHOR)
        author.post(f"{BASE}/seed", json={"suites": [suite("s1", testCases=[case()])], "runs": [], "milestones": []})
        assert [r["revision"] for r in self.revisions(author)] == [1]


class TestPriorities:
    """DDS-SRS-013: Critical / High / Medium / Low, renamed from P1-P4."""

    def test_saved_under_the_new_names_and_old_ones_are_converted(self, api: Api) -> None:
        author = api.sign_in(AUTHOR)
        make_suite(author)
        for case_id, given, stored in (
            ("a", "P1", "Critical"),
            ("b", "high", "High"),
            ("c", "Low", "Low"),
            ("d", "??", "Medium"),
        ):
            res = author.put(f"{BASE}/suites/s1/cases/{case_id}", json=case(case_id, priority=given))
            assert res.json()["testCase"]["priority"] == stored

    def test_cases_stored_before_the_rename_load_with_the_new_names(self, api: Api) -> None:
        author = api.sign_in(AUTHOR)
        make_suite(author)
        author.put(f"{BASE}/suites/s1/cases/c1", json=case())
        redis = api.client.app.state.services.test_management._store._redis  # type: ignore[attr-defined]

        async def make_legacy() -> None:
            raw = json.loads(await redis.hget("dds:tm:suite:s1:cases", "c1"))
            await redis.hset("dds:tm:suite:s1:cases", "c1", json.dumps({**raw, "priority": "P4"}))

        api.client.portal.call(make_legacy)  # type: ignore[union-attr]
        assert author.get(BASE).json()["suites"][0]["testCases"][0]["priority"] == "Low"
