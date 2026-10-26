from dataclasses import dataclass
from typing import Any, Literal


@dataclass(frozen=True)
class PushedScript:
    suite_id: str
    suite_title: str
    robot_code: str


@dataclass
class Job:
    suite_id: str
    status: Literal["running", "completed"]
    # RobotResultsJson, already in its wire shape (camelCase keys).
    results: dict[str, Any] | None = None
