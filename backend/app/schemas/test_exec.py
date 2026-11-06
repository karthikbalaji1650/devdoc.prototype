from typing import Literal

from pydantic import Field

from app.schemas.common import WireModel


class PushScriptRequest(WireModel):
    suiteId: str
    suiteTitle: str
    robotCode: str


class StartRunRequest(WireModel):
    suiteId: str
    serverId: str | None = None  # a registered test server; omitted -> the mock Test PC
    runId: str | None = None  # the test run the worker fills in when it finishes (remote runs)


class StartRunResponse(WireModel):
    jobId: str


class RobotResultEntry(WireModel):
    customId: str
    title: str
    status: Literal["PASS", "FAIL", "SKIP"]
    elapsedTimeMs: int
    failureMessage: str | None = None  # present only on FAIL


class RobotResultsSummary(WireModel):
    total: int
    passed: int
    failed: int
    skipped: int


class RobotResultsJson(WireModel):
    # The wire key is "_schema"; Pydantic reserves leading underscores.
    schema_: Literal["devdoc-robot-results-v1"] = Field(alias="_schema")
    suiteTitle: str
    executedAt: str
    environment: str
    summary: RobotResultsSummary
    results: list[RobotResultEntry]


class RunProgress(WireModel):
    total: int
    completed: int
    passed: int
    failed: int
    percent: float  # completed / total * 100


class RunStatusResponse(WireModel):
    status: Literal["running", "completed", "failed"]
    # Remote runs only (DDS-SRS-021), as last polled by the background worker:
    phase: Literal["QUEUED", "RUNNING", "COMPLETED", "FAILED"] | None = None
    server: str | None = None
    progress: RunProgress | None = None
    lastPolledAt: str | None = None
    pollError: str | None = None  # the last check failed; it is being retried
    results: RobotResultsJson | None = None  # present only once completed
    error: str | None = None  # present only when failed
