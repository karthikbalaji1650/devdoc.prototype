"""Server-side copy of the frontend's buildRobotSuiteText
(frontend/src/services/robotSuiteBuilder.ts), for runs the server starts
by itself - scheduled runs (DDS-SRS-028) - where no browser builds the
script. Must produce the same text: tests/test_robot_suite.py pins both
to the same expected output."""

import re
from typing import Any

from app.core.jscompat import JS_WS_CLASS

_WHITESPACE_RUN = re.compile(rf"{JS_WS_CLASS}+")


def build_robot_suite_text(suite: dict[str, Any], cases: list[dict[str, Any]]) -> str:
    automated = [c for c in cases if c.get("type") == "Automated" or c.get("automationCandidate")]
    header = f"*** Settings ***\nDocumentation     {suite.get('title', '')}\nLibrary           RequestsLibrary\n\n"
    lines = [header + "*** Test Cases ***"]
    for case in automated:
        code = case.get("robotCode") or (
            f"{case.get('customId', '')}_{_WHITESPACE_RUN.sub('_', case.get('title', ''))}\n"
            f"    [Tags]    {case.get('priority', '')}    {'    '.join(case.get('labels') or [])}\n"
            f"    Log    Test: {case.get('title', '')}"
        )
        lines.append("\n" + code)
    return "\n".join(lines)
