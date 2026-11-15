"""Release management (DDS-SRS-033 - 046).

Admins and regular users are treated the same. AUTHOR creates releases in
most tests; OTHER and ADMIN are the other signers. Only the creator edits a
release; any signer signs off, overrides gates and promotes.
"""

from typing import Any

from app.models.user import User
from tests.conftest import ADMIN, AUTHOR, OTHER, Agent, Api

CREATOR = AUTHOR
BASE = "/api/releases"
SHA = "a" * 64


def release_body(**overrides: Any) -> dict[str, Any]:
    return {
        "version": "v2.4.0",
        "type": "Minor",
        "targetDate": "2026-12-01",
        "segment": "Enterprise",
        "status": "In Progress",
        "signerIds": [OTHER.id, ADMIN.id],
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


def make_release(api: Api, **overrides: Any) -> tuple[Agent, str]:
    """The creator signed in, and the id the server gave the new release."""
    creator = api.sign_in(CREATOR)
    res = creator.post(BASE, json=release_body(**overrides))
    assert res.status_code == 200, res.text
    return creator, res.json()["release"]["id"]


def get(agent: Agent, release_id: str) -> dict[str, Any]:
    return agent.get(f"{BASE}/{release_id}").json()["release"]


def add_users(api: Api, count: int) -> list[str]:
    ids = []
    for i in range(count):
        uid = f"usr-x{i}"
        api.store.add_user(
            User(uid, f"Extra Person {i}", f"x{i}@sanmina.com", "Engineer", "R&D", "user", None, None), "pw"
        )
        ids.append(uid)
    return ids


class TestCreate:
    def test_any_signed_in_user_can_create_with_all_attributes(self, api: Api) -> None:
        creator, rid = make_release(api)
        r = get(creator, rid)
        assert rid.startswith("rel-") and r["createdBy"] == CREATOR.id and r["createdByName"] == CREATOR.name
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
        # an admin creates exactly the same way
        assert (
            api.sign_in(ADMIN).post(BASE, json=release_body(version="v2.5.0", signerIds=[OTHER.id])).status_code == 200
        )

    def test_the_creator_is_the_first_signer(self, api: Api) -> None:
        creator, rid = make_release(api)
        assert [s["name"] for s in get(creator, rid)["signers"]] == [CREATOR.name, OTHER.name, ADMIN.name]
        first = get(creator, rid)["signers"][0]
        assert first == {"userId": CREATOR.id, "name": CREATOR.name, "title": None, "department": None}

    def test_two_to_five_signers_in_all(self, api: Api) -> None:
        creator = api.sign_in(CREATOR)
        extra = add_users(api, 5)
        no_others = creator.post(BASE, json=release_body(signerIds=[]))
        assert no_others.status_code == 400
        assert "2 to 5 signers" in no_others.json()["error"]
        assert creator.post(BASE, json=release_body(signerIds=[CREATOR.id])).status_code == 400  # only themselves
        assert creator.post(BASE, json=release_body(signerIds=extra)).status_code == 400  # five others = six
        assert (
            creator.post(BASE, json=release_body(version="v1", signerIds=extra[:4])).status_code == 200
        )  # five in all
        assert creator.post(BASE, json=release_body(version="v2", signerIds=["nobody"])).json() == {
            "error": "Unknown user: nobody."
        }
        assert creator.post(BASE, json=release_body(version="v3", signerIds="x")).status_code == 400

    def test_the_creator_in_the_list_and_duplicates_are_ignored(self, api: Api) -> None:
        creator, rid = make_release(api, signerIds=[CREATOR.id, OTHER.id, OTHER.id])
        assert [s["name"] for s in get(creator, rid)["signers"]] == [CREATOR.name, OTHER.name]

    def test_validation(self, api: Api) -> None:
        creator = api.sign_in(CREATOR)
        post = lambda **kw: creator.post(BASE, json=release_body(**kw))  # noqa: E731
        assert post(type="Big").json() == {"error": "type must be one of Major, Minor, Patch, Hotfix."}
        assert post(status="Done").status_code == 400
        assert post(status="Cancelled").status_code == 400  # cancelling is its own action
        assert post(version=" ").json() == {"error": "version is required."}
        assert post(targetDate="01/12/2026").json() == {"error": "targetDate must be a date like 2026-12-01."}
        assert post(targetDate="2026-13-45").status_code == 400
        assert post(targetDate=None).json() == {"error": "targetDate is required."}
        assert post(gateRules={"minPassRate": 120}).status_code == 400
        assert creator.post(BASE, json=[]).status_code == 400

    def test_a_version_can_only_be_used_once_ignoring_case_and_spaces(self, api: Api) -> None:
        creator, _ = make_release(api)
        for clash in ("v2.4.0", "V2.4.0", "  v2.4.0 "):
            res = creator.post(BASE, json=release_body(version=clash))
            assert res.status_code == 409, clash
            assert res.json() == {"error": f"A release with version {clash.strip()} already exists."}
        assert creator.post(BASE, json=release_body(version="v2.4.1")).status_code == 200

    def test_everyone_signed_in_reads_the_list_and_each_release(self, api: Api) -> None:
        creator, rid = make_release(api)
        assert api.anonymous().get(BASE).status_code == 401
        assert api.anonymous().get(f"{BASE}/{rid}").status_code == 401
        stranger = api.sign_in(ADMIN)  # admin, but neither creator nor... (ADMIN is a signer here)
        line = stranger.get(BASE).json()["releases"][0]
        assert line["id"] == rid and line["signerCount"] == 3 and line["createdByName"] == CREATOR.name
        assert line["metrics"] == {"builds": 0, "latestBuild": None, "finalBuild": None, "openBlockers": 0}
        assert (line["canEdit"], line["isSigner"]) == (False, True)
        mine = creator.get(BASE).json()["releases"][0]
        assert (mine["canEdit"], mine["isSigner"]) == (True, True)
        assert creator.get(f"{BASE}/nope").json() == {"error": "Release not found."}

    def test_a_non_signer_can_read_but_is_neither_creator_nor_signer(self, api: Api) -> None:
        _, rid = make_release(api, signerIds=[OTHER.id])
        admin = api.sign_in(ADMIN)
        r = get(admin, rid)
        assert (r["canEdit"], r["isSigner"]) == (False, False)


class TestEditing:
    def test_only_the_creator_edits_not_even_signers_or_admins(self, api: Api) -> None:
        creator, rid = make_release(api)
        for who in (OTHER, ADMIN):  # a signer, and an admin who is also a signer
            res = api.sign_in(who).patch(f"{BASE}/{rid}", json={"title": "x"})
            assert res.status_code == 403
            assert res.json() == {"error": f"Only {CREATOR.name}, who created this release, can change it."}
        assert creator.patch(f"{BASE}/{rid}", json={"title": "Security patch"}).status_code == 200

    def test_only_the_fields_sent_change(self, api: Api) -> None:
        creator, rid = make_release(api, title="Original", notes="keep me")
        res = creator.patch(f"{BASE}/{rid}", json={"segment": "All customers", "status": "RC Frozen"})
        r = res.json()["release"]
        assert (r["segment"], r["status"], r["title"], r["notes"], r["version"]) == (
            "All customers",
            "RC Frozen",
            "Original",
            "keep me",
            "v2.4.0",
        )
        assert [s["name"] for s in r["signers"]] == [CREATOR.name, OTHER.name, ADMIN.name]

    def test_milestones_keep_their_dates(self, api: Api) -> None:
        creator, rid = make_release(api)
        creator.patch(
            f"{BASE}/{rid}",
            json={"milestones": [{"key": "code-freeze", "plannedDate": "2026-11-10", "actualDate": "2026-11-11"}]},
        )
        creator.patch(f"{BASE}/{rid}", json={"milestones": [{"key": "ga", "plannedDate": "2026-12-01"}]})
        r = get(creator, rid)
        assert r["milestones"][0] == {
            "key": "code-freeze",
            "name": "Code Freeze",
            "plannedDate": "2026-11-10",
            "actualDate": "2026-11-11",
        }
        assert r["milestones"][4]["plannedDate"] == "2026-12-01"
        assert r["metrics"]["milestonesDone"] == 1
        assert (
            creator.patch(f"{BASE}/{rid}", json={"milestones": [{"key": "ga", "plannedDate": "soon"}]}).status_code
            == 400
        )

    def test_changing_the_version_keeps_it_unique_and_stops_once_a_build_exists(self, api: Api) -> None:
        creator, rid = make_release(api)
        creator.post(BASE, json=release_body(version="v9.9.9"))
        assert creator.patch(f"{BASE}/{rid}", json={"version": "V9.9.9"}).status_code == 409
        assert creator.patch(f"{BASE}/{rid}", json={"version": "v2.4.1"}).status_code == 200
        assert creator.patch(f"{BASE}/{rid}", json={"version": "v2.4.1"}).status_code == 200  # same value is fine
        creator.post(f"{BASE}/{rid}/builds", json=build_body())
        res = creator.patch(f"{BASE}/{rid}", json={"version": "v2.4.2"})
        assert res.status_code == 409 and "once a build is registered" in res.json()["error"]

    def test_status_cannot_be_set_to_cancelled_here(self, api: Api) -> None:
        creator, rid = make_release(api)
        res = creator.patch(f"{BASE}/{rid}", json={"status": "Cancelled"})
        assert res.json() == {"error": "Use the cancel action to cancel a release."}

    def test_there_is_no_way_to_delete_a_release(self, api: Api) -> None:
        creator, rid = make_release(api)
        assert creator.delete(f"{BASE}/{rid}").status_code in (404, 405)
        assert get(creator, rid)["id"] == rid


class TestSigners:
    def test_the_creator_replaces_the_other_signers_and_stays_one(self, api: Api) -> None:
        creator, rid = make_release(api)
        extra = add_users(api, 1)
        res = creator.put(f"{BASE}/{rid}/signers", json={"userIds": [extra[0], OTHER.id]})
        assert [s["name"] for s in res.json()["release"]["signers"]] == [CREATOR.name, "Extra Person 0", OTHER.name]
        assert creator.put(f"{BASE}/{rid}/signers", json={"userIds": []}).status_code == 400
        assert api.sign_in(OTHER).put(f"{BASE}/{rid}/signers", json={"userIds": [OTHER.id]}).status_code == 403
        only_creator = creator.put(f"{BASE}/{rid}/signers", json={"userIds": [CREATOR.id]})
        assert only_creator.status_code == 400  # the creator cannot be the only signer, nor be removed
        assert next(s["name"] for s in get(creator, rid)["signers"]) == CREATOR.name

    def test_changes_are_logged(self, api: Api) -> None:
        creator, rid = make_release(api)
        creator.put(f"{BASE}/{rid}/signers", json={"userIds": [OTHER.id]})
        creator.put(f"{BASE}/{rid}/signers", json={"userIds": [OTHER.id]})  # unchanged: nothing logged
        entries = creator.get(f"{BASE}/{rid}/audit").json()["entries"]
        assert [e["action"] for e in entries] == ["release-created", "signers-changed"]
        assert entries[1]["details"] == {
            "added": [],
            "removed": [ADMIN.name],
            "signers": [CREATOR.name, OTHER.name],
        }

    def test_a_removed_signers_approval_stops_counting_and_a_new_one_must_approve(self, api: Api) -> None:
        creator, rid = make_release(api)
        creator.post(f"{BASE}/{rid}/builds", json=build_body())
        for who in (CREATOR, OTHER, ADMIN):
            api.sign_in(who).post(f"{BASE}/{rid}/builds/rc100/signoffs", json={"decision": "Approved"})
        assert get(creator, rid)["builds"][0]["signoffStatus"]["complete"] is True

        creator.put(f"{BASE}/{rid}/signers", json={"userIds": [OTHER.id]})  # ADMIN removed
        status = get(creator, rid)["builds"][0]["signoffStatus"]
        assert (status["required"], status["approved"], status["complete"]) == (2, 2, True)
        assert ADMIN.id in get(creator, rid)["builds"][0]["signoffs"]  # the decision is still on record

        extra = add_users(api, 1)
        creator.put(f"{BASE}/{rid}/signers", json={"userIds": [OTHER.id, extra[0]]})
        status = get(creator, rid)["builds"][0]["signoffStatus"]
        assert (status["required"], status["approved"], status["complete"]) == (3, 2, False)
        assert status["waitingFor"] == ["Extra Person 0"]

    def test_signers_are_locked_once_a_build_is_final(self, api: Api) -> None:
        creator, rid = make_release(api)
        creator.post(f"{BASE}/{rid}/builds", json=build_body())
        creator.put("/api/test-management/runs/run1", json=run(["Passed"]))
        creator.put(f"{BASE}/{rid}/builds/rc100/runs", json={"testRunIds": ["run1"]})
        for who in (CREATOR, OTHER, ADMIN):
            api.sign_in(who).post(f"{BASE}/{rid}/builds/rc100/signoffs", json={"decision": "Approved"})
        assert api.sign_in(OTHER).post(f"{BASE}/{rid}/builds/rc100/promote").status_code == 200
        res = creator.put(f"{BASE}/{rid}/signers", json={"userIds": [OTHER.id]})
        assert res.status_code == 409 and "once a build is Final" in res.json()["error"]
        assert get(creator, rid)["signersLocked"] is True


class TestCancel:
    def test_the_creator_cancels_with_a_reason_and_nothing_is_lost(self, api: Api) -> None:
        creator, rid = make_release(api)
        creator.post(f"{BASE}/{rid}/builds", json=build_body())
        assert api.sign_in(OTHER).post(f"{BASE}/{rid}/cancel", json={"reason": "x"}).status_code == 403
        assert creator.post(f"{BASE}/{rid}/cancel", json={}).json() == {"error": "reason is required."}
        res = creator.post(f"{BASE}/{rid}/cancel", json={"reason": "Customer postponed"})
        r = res.json()["release"]
        assert r["status"] == "Cancelled" and r["cancelledReason"] == "Customer postponed"
        assert len(r["builds"]) == 1 and r["canEdit"] is False
        log = creator.get(f"{BASE}/{rid}/audit").json()
        assert log["intact"] and log["entries"][-1]["action"] == "release-cancelled"
        assert log["entries"][-1]["details"] == {"reason": "Customer postponed", "from": "In Progress"}

    def test_a_cancelled_release_can_no_longer_change(self, api: Api) -> None:
        creator, rid = make_release(api)
        creator.post(f"{BASE}/{rid}/builds", json=build_body())
        creator.post(f"{BASE}/{rid}/cancel", json={"reason": "stopped"})
        calls = [
            creator.patch(f"{BASE}/{rid}", json={"title": "x"}),
            creator.post(f"{BASE}/{rid}/builds", json=build_body()),
            creator.put(f"{BASE}/{rid}/signers", json={"userIds": [OTHER.id]}),
            creator.post(f"{BASE}/{rid}/blockers", json={"key": "X-1"}),
            api.sign_in(OTHER).post(f"{BASE}/{rid}/builds/rc100/signoffs", json={"decision": "Approved"}),
            api.sign_in(OTHER).post(f"{BASE}/{rid}/builds/rc100/promote"),
            creator.post(f"{BASE}/{rid}/cancel", json={"reason": "again"}),
        ]
        assert [c.status_code for c in calls] == [409] * 7
        assert get(creator, rid)["status"] == "Cancelled"  # still readable

    def test_a_deployed_release_cannot_be_cancelled(self, api: Api) -> None:
        creator, rid = make_release(api, status="Deployed")
        assert creator.post(f"{BASE}/{rid}/cancel", json={"reason": "x"}).status_code == 409


class TestBuilds:
    def test_sequential_rc_builds_with_image_details(self, api: Api) -> None:
        creator, rid = make_release(api)
        first = creator.post(f"{BASE}/{rid}/builds", json=build_body()).json()["build"]
        second = creator.post(f"{BASE}/{rid}/builds", json=build_body(sha256="B" * 64)).json()["build"]
        assert (first["label"], second["label"]) == ("v2.4.0-RC100", "v2.4.0-RC101")
        assert second["sha256"] == "b" * 64 and second["kind"] == "RC"
        assert first["pipelineBuildId"] == "jenkins-482" and first["repository"] == "Artifactory"
        assert first["createdByName"] == CREATOR.name

    def test_checksum_commit_and_url_are_checked(self, api: Api) -> None:
        creator, rid = make_release(api)
        assert creator.post(f"{BASE}/{rid}/builds", json=build_body(sha256="123")).json() == {
            "error": "sha256 must be a 64-character hex SHA-256 checksum."
        }
        assert creator.post(f"{BASE}/{rid}/builds", json=build_body(commitSha="zzz")).status_code == 400
        assert creator.post(f"{BASE}/{rid}/builds", json=build_body(artifactUrl="ftp://x")).status_code == 400

    def test_only_the_creator_registers_builds_and_links_runs(self, api: Api) -> None:
        creator, rid = make_release(api)
        creator.post(f"{BASE}/{rid}/builds", json=build_body())
        creator.put("/api/test-management/runs/run1", json=run(["Passed"]))
        for who in (OTHER, ADMIN):  # signers, but not the creator
            agent = api.sign_in(who)
            assert agent.post(f"{BASE}/{rid}/builds", json=build_body()).status_code == 403
            assert agent.put(f"{BASE}/{rid}/builds/rc100/runs", json={"testRunIds": ["run1"]}).status_code == 403

    def test_linked_runs_must_exist(self, api: Api) -> None:
        creator, rid = make_release(api)
        creator.post(f"{BASE}/{rid}/builds", json=build_body())
        res = creator.put(f"{BASE}/{rid}/builds/rc100/runs", json={"testRunIds": ["nope"]})
        assert res.json() == {"error": "Test run not found: nope."}


class TestGatesSignoffsAndPromotion:
    def prepare(self, api: Api, statuses: list[str]) -> tuple[Agent, str]:
        creator, rid = make_release(api)
        creator.put("/api/test-management/runs/run1", json=run(statuses))
        creator.post(f"{BASE}/{rid}/builds", json=build_body())
        assert creator.put(f"{BASE}/{rid}/builds/rc100/runs", json={"testRunIds": ["run1"]}).status_code == 200
        return creator, rid

    def gates(self, agent: Agent, rid: str) -> dict[str, Any]:
        return get(agent, rid)["builds"][0]["gates"]

    def approve_all(self, api: Api, rid: str, *who: Any) -> None:
        for person in who or (CREATOR, OTHER, ADMIN):
            res = api.sign_in(person).post(f"{BASE}/{rid}/builds/rc100/signoffs", json={"decision": "Approved"})
            assert res.status_code == 200, res.text

    def test_gates_are_evaluated_from_linked_runs_and_blockers(self, api: Api) -> None:
        creator, rid = self.prepare(api, ["Passed"] * 49 + ["Failed"])  # 98%
        g = self.gates(creator, rid)
        assert g["passRate"] == 98.0 and g["passed"] and g["verification"] == "Verified" and g["coverage"] == 100.0

        blocker = creator.post(
            f"{BASE}/{rid}/blockers",
            json={"key": "WH3-1300", "severity": "Critical", "url": "https://jira.example.com/WH3-1300"},
        ).json()["blocker"]
        g = self.gates(creator, rid)
        assert not g["passed"] and g["verification"] == "Failed"
        assert next(c for c in g["checks"] if c["id"] == "blockers")["detail"] == "WH3-1300"

        creator.patch(f"{BASE}/{rid}/blockers/{blocker['id']}", json={"status": "Closed"})
        assert self.gates(creator, rid)["passed"]

    def test_pass_rate_and_mandatory_suites(self, api: Api) -> None:
        creator, rid = self.prepare(api, ["Passed", "Failed", "Untested"])
        g = self.gates(creator, rid)
        assert g["passRate"] == 50.0 and not g["passed"]
        creator.patch(f"{BASE}/{rid}", json={"gateRules": {"minPassRate": 50, "mandatorySuiteIds": ["s1"]}})
        g = self.gates(creator, rid)
        assert [c["passed"] for c in g["checks"]] == [True, True, False]  # s1 has an untested case

    def test_only_a_signer_signs_off_and_it_is_in_their_own_name(self, api: Api) -> None:
        creator, rid = make_release(api, signerIds=[OTHER.id])
        creator.post(f"{BASE}/{rid}/builds", json=build_body())
        outsider = api.sign_in(ADMIN)  # an admin, but not a signer of this release
        res = outsider.post(f"{BASE}/{rid}/builds/rc100/signoffs", json={"decision": "Approved"})
        assert res.status_code == 403
        assert res.json() == {"error": "Only the signers of this release can sign off."}
        other = api.sign_in(OTHER)
        assert other.post(f"{BASE}/{rid}/builds/rc100/signoffs", json={"decision": "Rejected"}).json() == {
            "error": "comment is required."
        }
        assert other.post(f"{BASE}/{rid}/builds/rc100/signoffs", json={"decision": "Maybe"}).status_code == 400
        build = other.post(f"{BASE}/{rid}/builds/rc100/signoffs", json={"decision": "Approved"}).json()["build"]
        assert build["signoffs"][OTHER.id]["userName"] == OTHER.name
        assert get(other, rid)["builds"][0]["signoffStatus"] == {
            "required": 2,
            "approved": 1,
            "rejected": 0,
            "waitingFor": [CREATOR.name],
            "complete": False,
        }

    def test_a_signer_can_change_their_mind_and_the_log_keeps_both(self, api: Api) -> None:
        creator, rid = make_release(api)
        creator.post(f"{BASE}/{rid}/builds", json=build_body())
        other = api.sign_in(OTHER)
        other.post(f"{BASE}/{rid}/builds/rc100/signoffs", json={"decision": "Rejected", "comment": "Crash on boot"})
        s = get(other, rid)["builds"][0]["signoffStatus"]
        assert s["rejected"] == 1 and s["complete"] is False
        other.post(f"{BASE}/{rid}/builds/rc100/signoffs", json={"decision": "Approved", "comment": "Fixed in config"})
        decisions = [
            (e["details"]["decision"], e["details"]["comment"])
            for e in other.get(f"{BASE}/{rid}/audit").json()["entries"]
            if e["action"] == "signed-off"
        ]
        assert decisions == [("Rejected", "Crash on boot"), ("Approved", "Fixed in config")]

    def test_signoffs_are_per_build(self, api: Api) -> None:
        creator, rid = make_release(api, signerIds=[OTHER.id])
        creator.post(f"{BASE}/{rid}/builds", json=build_body())
        creator.post(f"{BASE}/{rid}/builds", json=build_body(sha256="c" * 64))
        for who in (CREATOR, OTHER):
            api.sign_in(who).post(f"{BASE}/{rid}/builds/rc100/signoffs", json={"decision": "Approved"})
        first, second = get(creator, rid)["builds"]
        assert first["signoffStatus"]["complete"] is True
        assert second["signoffStatus"]["approved"] == 0  # RC101 needs everyone again

    def test_promotion_needs_gates_and_every_signers_approval(self, api: Api) -> None:
        creator, rid = self.prepare(api, ["Passed", "Failed"])  # 50%: gates fail
        promote = lambda who=OTHER: api.sign_in(who).post(f"{BASE}/{rid}/builds/rc100/promote")  # noqa: E731
        assert "Exit criteria not met: Pass rate at least 98%" in promote().json()["error"]

        override = api.sign_in(ADMIN).post(
            f"{BASE}/{rid}/builds/rc100/override", json={"reason": "Known flaky test, waived by QA"}
        )
        assert override.status_code == 200 and override.json()["build"]["gateOverride"]["by"] == ADMIN.name
        incomplete = promote().json()["error"]
        assert incomplete.startswith("Sign-offs incomplete: 0 of 3 signers approved (waiting for ")

        self.approve_all(api, rid, OTHER, ADMIN)
        assert "1 of" not in promote().json()["error"] and "waiting for" in promote().json()["error"]
        self.approve_all(api, rid, CREATOR)
        res = promote()
        assert res.status_code == 200 and res.json()["build"]["kind"] == "Final"
        assert res.json()["build"]["promotedBy"] == OTHER.name

        r = get(creator, rid)
        assert r["status"] == "Approved" and r["metrics"]["finalBuild"] == "v2.4.0-RC100"
        assert r["builds"][0]["gates"]["overridden"] is True
        assert promote().json() == {"error": "This build is already Final."}

    def test_one_rejection_blocks_promotion(self, api: Api) -> None:
        _, rid = self.prepare(api, ["Passed"])
        self.approve_all(api, rid, CREATOR, ADMIN)
        api.sign_in(OTHER).post(f"{BASE}/{rid}/builds/rc100/signoffs", json={"decision": "Rejected", "comment": "no"})
        res = api.sign_in(ADMIN).post(f"{BASE}/{rid}/builds/rc100/promote")
        assert res.status_code == 409 and "waiting for Vaishnavi" not in res.json()["error"]
        assert OTHER.name in res.json()["error"]

    def test_only_a_signer_promotes_or_overrides(self, api: Api) -> None:
        creator, rid = make_release(api, signerIds=[OTHER.id])
        creator.post(f"{BASE}/{rid}/builds", json=build_body())
        outsider = api.sign_in(ADMIN)
        assert outsider.post(f"{BASE}/{rid}/builds/rc100/promote").status_code == 403
        assert outsider.post(f"{BASE}/{rid}/builds/rc100/override", json={"reason": "x"}).status_code == 403

    def test_override_needs_a_reason_and_happens_once(self, api: Api) -> None:
        creator, rid = self.prepare(api, ["Failed"])
        assert creator.post(f"{BASE}/{rid}/builds/rc100/override", json={}).json() == {"error": "reason is required."}
        assert creator.post(f"{BASE}/{rid}/builds/rc100/override", json={"reason": "waiver"}).status_code == 200
        assert creator.post(f"{BASE}/{rid}/builds/rc100/override", json={"reason": "again"}).status_code == 409

    def test_a_final_release_takes_no_more_builds_or_signoffs(self, api: Api) -> None:
        creator, rid = self.prepare(api, ["Passed"])
        self.approve_all(api, rid)
        assert api.sign_in(OTHER).post(f"{BASE}/{rid}/builds/rc100/promote").status_code == 200
        assert creator.post(f"{BASE}/{rid}/builds", json=build_body()).status_code == 409
        late = api.sign_in(OTHER).post(
            f"{BASE}/{rid}/builds/rc100/signoffs", json={"decision": "Rejected", "comment": "x"}
        )
        assert late.status_code == 409
        assert creator.patch(f"{BASE}/{rid}", json={"gateRules": {"minPassRate": 10}}).status_code == 409
        assert creator.patch(f"{BASE}/{rid}", json={"status": "Deployed"}).status_code == 200  # but it can ship


class TestAuditLog:
    def test_records_every_release_action_in_order_naming_who_did_it(self, api: Api) -> None:
        creator, rid = make_release(api)
        creator.patch(f"{BASE}/{rid}", json={"status": "RC Frozen"})
        creator.post(f"{BASE}/{rid}/builds", json=build_body())
        api.sign_in(OTHER).post(f"{BASE}/{rid}/builds/rc100/override", json={"reason": "waiver"})
        api.sign_in(OTHER).post(f"{BASE}/{rid}/builds/rc100/signoffs", json={"decision": "Approved"})
        log = api.sign_in(ADMIN).get(f"{BASE}/{rid}/audit").json()
        assert log["intact"] is True
        assert [e["action"] for e in log["entries"]] == [
            "release-created",
            "status-changed",
            "build-registered",
            "gates-overridden",
            "signed-off",
        ]
        assert log["entries"][0]["details"]["signers"] == [CREATOR.name, OTHER.name, ADMIN.name]
        assert log["entries"][1]["details"] == {"from": "In Progress", "to": "RC Frozen"}
        assert (log["entries"][4]["actor"], log["entries"][4]["actorId"]) == (OTHER.name, OTHER.id)

    def test_rule_changes_with_whole_numbers_still_verify(self, api: Api) -> None:
        creator, rid = make_release(api)
        creator.patch(f"{BASE}/{rid}", json={"gateRules": {"minPassRate": 95.0}})
        creator.patch(f"{BASE}/{rid}", json={"gateRules": {"minPassRate": 91.5}})
        assert creator.get(f"{BASE}/{rid}/audit").json()["intact"] is True

    def test_tampering_is_detected(self, api: Api) -> None:
        creator, rid = make_release(api)
        creator.patch(f"{BASE}/{rid}", json={"status": "RC Frozen"})
        repo = api.client.app.state.services.releases._repo  # type: ignore[attr-defined]
        repo._audit[rid][1]["details"]["to"] = "Deployed"
        assert creator.get(f"{BASE}/{rid}/audit").json()["intact"] is False

    def test_kept_by_the_admin_reset_and_included_in_the_backup(self, api: Api) -> None:
        creator, rid = make_release(api)
        admin = api.sign_in(ADMIN)
        backup = admin.get("/api/admin/backup").json()
        assert [r["id"] for r in backup["releases"]] == [rid]
        assert backup["releases"][0]["audit"][0]["action"] == "release-created"
        admin.post("/api/admin/reset", json={"confirm": "DELETE ALL DATA"})
        assert [e["action"] for e in admin.get(f"{BASE}/{rid}/audit").json()["entries"]] == ["release-created"]
        assert get(creator, rid)["version"] == "v2.4.0"


class TestBlockers:
    def test_validation_permissions_and_duplicates(self, api: Api) -> None:
        creator, rid = make_release(api)
        post = lambda body, agent=creator: agent.post(f"{BASE}/{rid}/blockers", json=body)  # noqa: E731
        assert post({"key": "X-1", "severity": "Huge"}).status_code == 400
        assert post({"key": "X-1", "url": "nope"}).status_code == 400
        assert post({"key": "X-1"}, api.sign_in(OTHER)).status_code == 403
        assert post({"key": "#42", "tracker": "GitHub"}).status_code == 200
        assert post({"key": "#42", "tracker": "GitHub"}).json() == {"error": "#42 is already listed on this release."}
        assert post({"key": "#42", "tracker": "Jira"}).status_code == 200  # another tracker, another issue
        assert get(creator, rid)["metrics"]["openBlockers"] == 2

    def test_close_reopen_and_remove(self, api: Api) -> None:
        creator, rid = make_release(api)
        b = creator.post(f"{BASE}/{rid}/blockers", json={"key": "WH3-1", "title": "Boot loop"}).json()["blocker"]
        assert (b["source"], b["severity"], b["status"]) == ("manual", "Major", "Open")
        closed = creator.patch(f"{BASE}/{rid}/blockers/{b['id']}", json={"status": "Closed"}).json()["blocker"]
        assert closed["status"] == "Closed" and closed["title"] == "Boot loop"
        assert creator.patch(f"{BASE}/{rid}/blockers/nope", json={"status": "Open"}).status_code == 404
        assert api.sign_in(OTHER).delete(f"{BASE}/{rid}/blockers/{b['id']}").status_code == 403
        assert creator.delete(f"{BASE}/{rid}/blockers/{b['id']}").status_code == 204
        actions = [e["action"] for e in creator.get(f"{BASE}/{rid}/audit").json()["entries"]]
        assert actions == ["release-created", "blocker-logged", "blocker-closed", "blocker-removed"]


class TestRecordedValues:
    """Every value the SRS names, read back exactly (DDS-SRS-034, 036, 040, 042)."""

    def test_040_every_image_detail_is_stored(self, api: Api) -> None:
        creator, rid = make_release(api)
        build = creator.post(f"{BASE}/{rid}/builds", json=build_body()).json()["build"]
        stored = get(creator, rid)["builds"][0]
        for field, value in build_body().items():
            assert build[field] == value and stored[field] == value, field

    def test_034_a_build_without_linked_runs_is_pending(self, api: Api) -> None:
        creator, rid = make_release(api)
        creator.post(f"{BASE}/{rid}/builds", json=build_body())
        gates = get(creator, rid)["builds"][0]["gates"]
        assert gates["verification"] == "Pending" and gates["linkedRuns"] == 0
        assert gates["passRate"] is None and gates["coverage"] is None

    def test_042_coverage_is_the_share_of_linked_results_executed(self, api: Api) -> None:
        creator, rid = make_release(api)
        creator.put("/api/test-management/runs/run1", json=run(["Passed", "Failed", "Untested", "Untested"]))
        creator.put("/api/test-management/runs/run2", json=run(["Passed", "Passed"]))
        creator.post(f"{BASE}/{rid}/builds", json=build_body())
        creator.put(f"{BASE}/{rid}/builds/rc100/runs", json={"testRunIds": ["run1", "run2"]})
        gates = get(creator, rid)["builds"][0]["gates"]
        assert gates["linkedRuns"] == 2
        assert gates["coverage"] == round(4 / 6 * 100, 1)  # 4 of 6 results executed
        assert gates["passRate"] == 75.0  # 3 passed of 4 executed

    def test_036_metrics_follow_the_release(self, api: Api) -> None:
        creator, rid = make_release(api)
        metrics = get(creator, rid)["metrics"]
        assert (metrics["builds"], metrics["latestBuild"], metrics["latestPassRate"], metrics["openBlockers"]) == (
            0,
            None,
            None,
            0,
        )
        creator.put("/api/test-management/runs/run1", json=run(["Passed", "Failed"]))
        creator.post(f"{BASE}/{rid}/builds", json=build_body())
        creator.post(f"{BASE}/{rid}/builds", json=build_body(sha256="c" * 64))
        creator.put(f"{BASE}/{rid}/builds/rc101/runs", json={"testRunIds": ["run1"]})
        creator.post(f"{BASE}/{rid}/blockers", json={"key": "WH3-1", "severity": "Major"})
        metrics = get(creator, rid)["metrics"]
        assert metrics["builds"] == 2 and metrics["latestBuild"] == "v2.4.0-RC101"
        assert metrics["latestPassRate"] == 50.0 and metrics["latestCoverage"] == 100.0
        assert metrics["openBlockers"] == 1 and metrics["finalBuild"] is None
        assert metrics["milestonesTotal"] == 5
