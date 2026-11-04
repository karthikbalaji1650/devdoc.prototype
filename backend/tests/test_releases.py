"""Release management (DDS-SRS-033 - 046)."""

import json
from typing import Any

from tests.conftest import ADMIN, AUTHOR, OTHER, Agent, Api

# AUTHOR is a release manager, OTHER a firmware lead, ADMIN an admin.
MANAGER = AUTHOR
BASE = "/api/releases"
SHA = "a" * 64


def release(**overrides: Any) -> dict[str, Any]:
    return {
        "version": "v2.4.0",
        "type": "Minor",
        "targetDate": "2026-12-01",
        "segment": "Enterprise",
        "status": "In Progress",
        "signoffRoles": [
            {"role": "QA Lead", "userName": OTHER.name},
            {"role": "Dev Lead", "userName": MANAGER.name},
        ],
        **overrides,
    }


def build_body(**overrides: Any) -> dict[str, Any]:
    return {
        "imageName": "registry.example.com/app:v2.4.0-rc",
        "commitSha": "abc1234",
        "branchTag": "release/2.4",
        "artifactUrl": "https://artifactory.example.com/app/2.4.0",
        "repository": "Artifactory",
        "sha256": SHA,
        "builtAt": "2026-11-20T10:00:00Z",
        "pipelineBuildId": "jenkins-482",
        **overrides,
    }


def run(statuses: list[str], suite_id: str = "s1") -> dict[str, Any]:
    return {
        "name": "Regression",
        "suiteId": suite_id,
        "caseResults": [
            {"caseId": f"c{i}", "customId": f"TC-{i}", "title": "t", "status": s} for i, s in enumerate(statuses)
        ],
    }


def setup_release(api: Api) -> Agent:
    manager = api.sign_in(MANAGER)
    assert manager.put(f"{BASE}/r1", json=release()).status_code == 200
    return manager


def get_release(agent: Agent, release_id: str = "r1") -> dict[str, Any]:
    return next(r for r in agent.get(BASE).json()["releases"] if r["id"] == release_id)


class TestReleases:
    def test_create_with_all_attributes_and_default_milestones(self, api: Api) -> None:
        manager = setup_release(api)
        r = get_release(manager)
        assert (r["version"], r["type"], r["targetDate"], r["segment"], r["status"]) == (
            "v2.4.0",
            "Minor",
            "2026-12-01",
            "Enterprise",
            "In Progress",
        )
        assert [m["name"] for m in r["milestones"]] == [
            "Code Freeze",
            "RC Build Generation",
            "QA Regression Window",
            "Final Sign-off",
            "General Availability (GA)",
        ]
        assert r["gateRules"] == {"minPassRate": 98, "requireNoOpenBlockers": True, "mandatorySuiteIds": []}

    def test_validation(self, api: Api) -> None:
        manager = api.sign_in(MANAGER)
        assert manager.put(f"{BASE}/r1", json=release(type="Big")).json() == {
            "error": "type must be one of Major, Minor, Patch, Hotfix."
        }
        assert manager.put(f"{BASE}/r1", json=release(status="Done")).status_code == 400
        assert manager.put(f"{BASE}/r1", json=release(version=" ")).json() == {"error": "version is required."}
        assert manager.put(f"{BASE}/r1", json=release(gateRules={"minPassRate": 120})).status_code == 400

    def test_only_release_managers_and_admins_change_releases(self, api: Api) -> None:
        assert api.sign_in(OTHER).put(f"{BASE}/r1", json=release()).status_code == 403
        assert api.sign_in(ADMIN).put(f"{BASE}/r1", json=release()).status_code == 200
        body = api.sign_in(OTHER).get(BASE).json()
        assert body["canManage"] is False and len(body["releases"]) == 1  # but anyone can read

    def test_milestones_keep_their_dates(self, api: Api) -> None:
        manager = setup_release(api)
        manager.put(
            f"{BASE}/r1",
            json=release(milestones=[{"key": "code-freeze", "plannedDate": "2026-11-10", "actualDate": "2026-11-11"}]),
        )
        r = get_release(manager)
        assert r["milestones"][0] == {
            "key": "code-freeze",
            "name": "Code Freeze",
            "plannedDate": "2026-11-10",
            "actualDate": "2026-11-11",
        }
        assert r["metrics"]["milestonesDone"] == 1


class TestBuilds:
    def test_sequential_rc_builds_with_image_details(self, api: Api) -> None:
        manager = setup_release(api)
        first = manager.post(f"{BASE}/r1/builds", json=build_body()).json()["build"]
        second = manager.post(f"{BASE}/r1/builds", json=build_body(sha256="B" * 64)).json()["build"]
        assert (first["label"], second["label"]) == ("v2.4.0-RC100", "v2.4.0-RC101")
        assert second["sha256"] == "b" * 64 and second["kind"] == "RC"
        assert first["pipelineBuildId"] == "jenkins-482" and first["repository"] == "Artifactory"

    def test_checksum_commit_and_url_are_checked(self, api: Api) -> None:
        manager = setup_release(api)
        assert manager.post(f"{BASE}/r1/builds", json=build_body(sha256="123")).json() == {
            "error": "sha256 must be a 64-character hex SHA-256 checksum."
        }
        assert manager.post(f"{BASE}/r1/builds", json=build_body(commitSha="zzz")).status_code == 400
        assert manager.post(f"{BASE}/r1/builds", json=build_body(artifactUrl="ftp://x")).status_code == 400
        assert api.sign_in(OTHER).post(f"{BASE}/r1/builds", json=build_body()).status_code == 403


class TestGatesSignoffsAndPromotion:
    def prepare(self, api: Api, statuses: list[str]) -> Agent:
        manager = setup_release(api)
        manager.put("/api/test-management/runs/run1", json=run(statuses))
        manager.post(f"{BASE}/r1/builds", json=build_body())
        assert manager.put(f"{BASE}/r1/builds/rc100/runs", json={"testRunIds": ["run1"]}).status_code == 200
        return manager

    def gates(self, agent: Agent) -> dict[str, Any]:
        return get_release(agent)["builds"][0]["gates"]

    def test_gates_are_evaluated_from_linked_runs_and_blockers(self, api: Api) -> None:
        manager = self.prepare(api, ["Passed"] * 49 + ["Failed"])  # 98%
        g = self.gates(manager)
        assert g["passRate"] == 98.0 and g["passed"] and g["verification"] == "Verified" and g["coverage"] == 100.0

        manager.put(
            f"{BASE}/r1/blockers/b1",
            json={"key": "WH3-1300", "severity": "Critical", "url": "https://jira.example.com/WH3-1300"},
        )
        g = self.gates(manager)
        assert not g["passed"] and g["verification"] == "Failed"
        assert next(c for c in g["checks"] if c["id"] == "blockers")["detail"] == "WH3-1300"

        manager.put(f"{BASE}/r1/blockers/b1", json={"key": "WH3-1300", "severity": "Critical", "status": "Closed"})
        assert self.gates(manager)["passed"]

    def test_pass_rate_and_mandatory_suites(self, api: Api) -> None:
        manager = self.prepare(api, ["Passed", "Failed", "Untested"])
        g = self.gates(manager)
        assert g["passRate"] == 50.0 and not g["passed"]
        manager.put(f"{BASE}/r1", json=release(gateRules={"minPassRate": 50, "mandatorySuiteIds": ["s1"]}))
        g = self.gates(manager)
        assert [c["passed"] for c in g["checks"]] == [True, True, False]  # s1 has an untested case

    def test_linked_runs_must_exist(self, api: Api) -> None:
        manager = self.prepare(api, ["Passed"])
        res = manager.put(f"{BASE}/r1/builds/rc100/runs", json={"testRunIds": ["nope"]})
        assert res.json() == {"error": "Test run not found: nope."}

    def test_only_the_assigned_user_signs_off_a_role(self, api: Api) -> None:
        manager = self.prepare(api, ["Passed"])
        assert (
            manager.post(
                f"{BASE}/r1/builds/rc100/signoffs", json={"role": "QA Lead", "decision": "Approved"}
            ).status_code
            == 403
        )
        assert (
            api.sign_in(ADMIN)
            .post(f"{BASE}/r1/builds/rc100/signoffs", json={"role": "QA Lead", "decision": "Approved"})
            .status_code
            == 403
        )
        qa = api.sign_in(OTHER)
        assert (
            qa.post(f"{BASE}/r1/builds/rc100/signoffs", json={"role": "Nope", "decision": "Approved"}).status_code
            == 400
        )
        assert qa.post(f"{BASE}/r1/builds/rc100/signoffs", json={"role": "QA Lead", "decision": "Rejected"}).json() == {
            "error": "comment is required."
        }
        assert (
            qa.post(f"{BASE}/r1/builds/rc100/signoffs", json={"role": "QA Lead", "decision": "Approved"}).status_code
            == 200
        )
        status = get_release(qa)["builds"][0]["signoffStatus"]
        assert status == {"required": 2, "approved": 1, "complete": False}

    def test_promotion_needs_gates_and_every_signoff(self, api: Api) -> None:
        manager = self.prepare(api, ["Passed", "Failed"])  # 50%: gates fail
        promote = lambda: manager.post(f"{BASE}/r1/builds/rc100/promote")  # noqa: E731
        assert "Exit criteria not met: Pass rate at least 98%" in promote().json()["error"]

        manager.post(f"{BASE}/r1/builds/rc100/override", json={"reason": "Known flaky test, waived by QA"})
        assert promote().json() == {"error": "Sign-offs incomplete: 0 of 2 roles approved."}

        api.sign_in(OTHER).post(f"{BASE}/r1/builds/rc100/signoffs", json={"role": "QA Lead", "decision": "Approved"})
        manager.post(f"{BASE}/r1/builds/rc100/signoffs", json={"role": "Dev Lead", "decision": "Approved"})
        assert api.sign_in(OTHER).post(f"{BASE}/r1/builds/rc100/promote").status_code == 403
        res = promote()
        assert res.status_code == 200 and res.json()["build"]["kind"] == "Final"

        r = get_release(manager)
        assert r["status"] == "Approved" and r["metrics"]["finalBuild"] == "v2.4.0-RC100"
        assert r["builds"][0]["gates"]["overridden"] is True
        assert promote().json() == {"error": "This build is already Final."}

    def test_override_needs_a_reason_and_a_manager(self, api: Api) -> None:
        manager = self.prepare(api, ["Failed"])
        assert manager.post(f"{BASE}/r1/builds/rc100/override", json={}).json() == {"error": "reason is required."}
        assert api.sign_in(OTHER).post(f"{BASE}/r1/builds/rc100/override", json={"reason": "x"}).status_code == 403


class TestAuditLog:
    def test_records_every_release_action_in_order(self, api: Api) -> None:
        manager = setup_release(api)
        manager.put(f"{BASE}/r1", json=release(status="RC Frozen"))
        manager.post(f"{BASE}/r1/builds", json=build_body())
        manager.post(f"{BASE}/r1/builds/rc100/override", json={"reason": "waiver"})
        api.sign_in(OTHER).post(f"{BASE}/r1/builds/rc100/signoffs", json={"role": "QA Lead", "decision": "Approved"})
        log = api.sign_in(OTHER).get(f"{BASE}/r1/audit").json()
        assert log["intact"] is True
        assert [e["action"] for e in log["entries"]] == [
            "release-created",
            "status-changed",
            "build-registered",
            "gates-overridden",
            "signed-off",
        ]
        assert log["entries"][1]["details"] == {"from": "In Progress", "to": "RC Frozen"}
        assert log["entries"][4]["actor"] == OTHER.name

    def test_tampering_is_detected(self, api: Api) -> None:
        manager = setup_release(api)
        manager.put(f"{BASE}/r1", json=release(status="RC Frozen"))
        redis = api.client.app.state.services.releases._store._redis  # type: ignore[attr-defined]

        async def tamper() -> None:
            entry = json.loads(await redis.lindex("dds:audit:releases:r1", 1))
            entry["details"]["to"] = "Deployed"
            await redis.lset("dds:audit:releases:r1", 1, json.dumps(entry))

        api.client.portal.call(tamper)  # type: ignore[union-attr]
        assert manager.get(f"{BASE}/r1/audit").json()["intact"] is False

    def test_kept_when_the_release_is_deleted_and_by_the_admin_reset(self, api: Api) -> None:
        manager = setup_release(api)
        manager.delete(f"{BASE}/r1")
        assert get_release_ids(manager) == []
        admin = api.sign_in(ADMIN)
        admin.post("/api/admin/reset", json={"confirm": "DELETE ALL DATA"})
        actions = [e["action"] for e in admin.get(f"{BASE}/r1/audit").json()["entries"]]
        assert actions == ["release-created", "release-deleted"]


def get_release_ids(agent: Agent) -> list[str]:
    return [r["id"] for r in agent.get(BASE).json()["releases"]]


class TestBlockersAndSeed:
    def test_blocker_validation_and_permissions(self, api: Api) -> None:
        manager = setup_release(api)
        assert manager.put(f"{BASE}/r1/blockers/b1", json={"key": "X-1", "severity": "Huge"}).status_code == 400
        assert manager.put(f"{BASE}/r1/blockers/b1", json={"key": "X-1", "url": "nope"}).status_code == 400
        assert api.sign_in(OTHER).put(f"{BASE}/r1/blockers/b1", json={"key": "X-1"}).status_code == 403
        assert manager.put(f"{BASE}/r1/blockers/b1", json={"key": "#42", "tracker": "GitHub"}).status_code == 200
        assert get_release(manager)["metrics"]["openBlockers"] == 1
        assert manager.delete(f"{BASE}/r1/blockers/b1").status_code == 204

    def test_seed_once_even_by_a_non_manager(self, api: Api) -> None:
        other = api.sign_in(OTHER)
        sample = {
            "releases": [
                {**release(), "id": "rel-1", "blockers": [{"id": "b1", "key": "WH3-1", "severity": "Blocker"}]}
            ]
        }
        body = other.post(f"{BASE}/seed", json=sample).json()
        assert body["seeded"] is True and body["releases"][0]["blockers"][0]["key"] == "WH3-1"
        assert other.post(f"{BASE}/seed", json=sample).status_code == 409
