import time

from app.services.test_exec import extract_test_names
from tests.conftest import ADMIN, Api

ROBOT_SCRIPT = (
    "*** Settings ***\nDocumentation     RTC Suite\n\n*** Test Cases ***\nTC-001_Drift_Check\n    Log    hi\n"
)


class TestPushScript:
    def test_requires_auth(self, api: Api) -> None:
        body = {"suiteId": "s1", "suiteTitle": "Suite", "robotCode": ROBOT_SCRIPT}
        assert api.anonymous().post("/api/test-exec/scripts", json=body).status_code == 401

    def test_rejects_a_missing_field_with_its_own_message(self, api: Api) -> None:
        agent = api.sign_in(ADMIN)
        cases = [
            ({"suiteTitle": "Suite", "robotCode": "x"}, "suiteId is required."),
            ({"suiteId": "s1", "robotCode": "x"}, "suiteTitle is required."),
            ({"suiteId": "s1", "suiteTitle": "Suite"}, "robotCode is required."),
        ]
        for body, message in cases:
            res = agent.post("/api/test-exec/scripts", json=body)
            assert res.status_code == 400
            assert res.json() == {"error": message}

    def test_accepts_a_valid_push(self, api: Api) -> None:
        body = {"suiteId": "s1", "suiteTitle": "Suite", "robotCode": ROBOT_SCRIPT}
        res = api.sign_in(ADMIN).post("/api/test-exec/scripts", json=body)
        assert res.status_code == 200
        assert res.json() == {"ok": True}


class TestStartRun:
    def test_requires_auth(self, api: Api) -> None:
        assert api.anonymous().post("/api/test-exec/runs", json={"suiteId": "s1"}).status_code == 401

    def test_rejects_a_run_for_a_suite_with_no_pushed_script(self, api: Api) -> None:
        res = api.sign_in(ADMIN).post("/api/test-exec/runs", json={"suiteId": "never-pushed"})
        assert res.status_code == 400
        assert res.json() == {"error": "No script has been pushed for this suite yet."}

    def test_starts_a_run_and_returns_a_job_id(self, api: Api) -> None:
        agent = api.sign_in(ADMIN)
        agent.post("/api/test-exec/scripts", json={"suiteId": "s1", "suiteTitle": "Suite", "robotCode": ROBOT_SCRIPT})
        res = agent.post("/api/test-exec/runs", json={"suiteId": "s1"})
        assert res.status_code == 200
        assert res.json()["jobId"].startswith("job-")


class TestRunStatus:
    def test_requires_auth(self, api: Api) -> None:
        assert api.anonymous().get("/api/test-exec/runs/job-nonexistent").status_code == 401

    def test_404s_for_an_unknown_job_id(self, api: Api) -> None:
        res = api.sign_in(ADMIN).get("/api/test-exec/runs/job-nonexistent")
        assert res.status_code == 404
        assert res.json() == {"error": "No run found with that id."}

    def test_reports_running_then_completed_results(self, api: Api) -> None:
        agent = api.sign_in(ADMIN)
        agent.post(
            "/api/test-exec/scripts", json={"suiteId": "s1", "suiteTitle": "RTC Suite", "robotCode": ROBOT_SCRIPT}
        )
        job_id = agent.post("/api/test-exec/runs", json={"suiteId": "s1"}).json()["jobId"]

        assert agent.get(f"/api/test-exec/runs/{job_id}").json() == {"status": "running"}
        time.sleep(0.5)
        done = agent.get(f"/api/test-exec/runs/{job_id}").json()
        assert done["status"] == "completed"
        results = done["results"]
        assert list(results) == ["_schema", "suiteTitle", "executedAt", "environment", "summary", "results"]
        assert results["_schema"] == "devdoc-robot-results-v1"
        assert results["suiteTitle"] == "RTC Suite"
        assert results["environment"] == "Mock Remote Test PC"
        # Greedy underscore matching, kept from the client's parser.
        assert results["results"][0]["customId"] == "TC-001-Drift"
        assert results["summary"]["total"] == len(results["results"])
        entry = results["results"][0]
        assert ("failureMessage" in entry) == (entry["status"] == "FAIL")


def test_extracts_names_only_from_the_test_cases_section() -> None:
    code = "*** Test Cases ***\nTC_12 Boot\n  step\nPlain name\n*** Keywords ***\nTC-9 Not a test\n"
    assert extract_test_names(code) == [("TC-12", "TC_12 Boot"), ("TC-2", "Plain name")]


def test_a_script_without_test_cases_still_yields_one_result(api: Api) -> None:
    agent = api.sign_in(ADMIN)
    agent.post("/api/test-exec/scripts", json={"suiteId": "s2", "suiteTitle": "S", "robotCode": "*** Settings ***\n"})
    job_id = agent.post("/api/test-exec/runs", json={"suiteId": "s2"}).json()["jobId"]
    time.sleep(0.5)
    results = agent.get(f"/api/test-exec/runs/{job_id}").json()["results"]["results"]
    assert [(r["customId"], r["title"]) for r in results] == [("TC-1", "Automated test")]
