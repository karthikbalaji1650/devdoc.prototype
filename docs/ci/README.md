# Running DevDoc Studio tests from CI/CD

DDS-SRS-026 (run tests locally and in CI/CD) and DDS-SRS-027 (Jenkins and
Bitbucket). A pipeline talks to DevDoc Studio's API with a **CI token**, in
one of two ways:

| | What happens | Command |
|---|---|---|
| **A. Run on the lab's test server** | DevDoc Studio sends the suite's Robot script to a registered remote test server, follows the run, and the step passes or fails with it. | `ci/devdoc-ci.sh run <suiteId> <serverId> [name]` |
| **B. Record tests the pipeline ran** | The pipeline runs Robot Framework itself (on the CI agent, or on a developer's machine) and uploads `output.xml`. | `ci/devdoc-ci.sh upload <suiteId> <output.xml> [name]` |

Either way the result appears as a test run in **Test Management → Test
Runs**, with the build it came from: pipeline, build number and link,
repository, branch and commit. Exit codes: `0` passed, `1` tests failed,
`2` bad setup or unreachable, `3` timed out waiting.

## Setup

1. **CI token.** An admin creates one under **Data Management → CI tokens**,
   named after the pipeline (e.g. "Jenkins – firmware"). It is shown once;
   store it as a secret in the CI system:
   - Jenkins: *Manage Jenkins → Credentials*, kind **Secret text**, used
     with `credentials('devdoc-ci-token')`.
   - Bitbucket: *Repository settings → Repository variables*,
     `DEVDOC_CI_TOKEN`, marked **Secured**.

   Revoke a token there to cut a pipeline off at once. Runs a token creates
   belong to the admin who made it.
2. **Commands.** Under **Data Management → CI tokens → Pipeline
   commands**, pick the suite (and, for A, the test server) and copy the
   ready-made command and `DEVDOC_URL`.
3. **The script.** Copy `ci/devdoc-ci.sh` into the repository that runs the
   pipeline. It needs `curl` and `python3`.
4. **The pipeline.** Start from [`Jenkinsfile`](Jenkinsfile) or
   [`bitbucket-pipelines.yml`](bitbucket-pipelines.yml).

The CI agent must be able to reach the DevDoc Studio API (`DEVDOC_URL`).
For A, the DevDoc Studio server must be able to reach the test server.

## Running locally

The same script works on a developer machine; build details then come from
`git`, and the run is labelled "Local" (override with `DEVDOC_PIPELINE`):

```sh
export DEVDOC_URL=http://localhost:8000 DEVDOC_CI_TOKEN=ddsci_…
robot --outputdir results tests/
ci/devdoc-ci.sh upload suite-123 results/output.xml "My local run"
```

## The API underneath

All with `Authorization: Bearer <CI token>`:

- `POST /api/ci/runs` — `{"suiteId", "serverId", "name"?, "build"?: {pipeline, buildUrl, buildNumber, repository, branch, commit}}` → `{"runId", "jobId"}`
- `GET /api/ci/runs/{jobId}` — status, progress and `outcome`: `pending`, `passed` or `failed`
- `POST /api/ci/results?suiteId=…&name=…&pipeline=…&buildUrl=…&buildNumber=…&repository=…&branch=…&commit=…` — body: `output.xml` as `application/xml` (gzip allowed, up to 50 MB), or `application/json` `{"results": [...]}` in the format of [the Test PC API](../test-pc-api.md) → `{"runId", "summary", "outcome"}`

`output.xml` from Robot Framework 4 to 7 is read using each test's own
status and elapsed time; test IDs come from the test name
(`TC_RTC_001 Drift check` → `TC-RTC-001`).
