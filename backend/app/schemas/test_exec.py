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


class RunStatusResponse(WireModel):
    status: Literal["running", "completed", "failed"]
    results: RobotResultsJson | None = None  # present only once completed
    error: str | None = None  # present only when failed
