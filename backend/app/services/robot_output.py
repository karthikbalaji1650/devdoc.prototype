"""Reads a Robot Framework output.xml (RF 4 - 7) into the result entries
the rest of the app uses ({customId, title, status, elapsedTimeMs,
failureMessage}) - for results a CI pipeline uploads after running the
tests itself (DDS-SRS-026).

- A test's outcome is its own <status> (the last direct child), not the
  first nested keyword's.
- Elapsed time comes from `elapsed` (RF 7, seconds) or starttime/endtime
  (RF 4 - 6); 0 when neither is there.
- The ID is read from the test name the way the frontend's import does
  ("TC_HPM_001 Title" -> "TC-HPM-001"); otherwise TC-<position>.
- Parsed with defusedxml: entity expansion and external entities are refused.
"""

import re
from datetime import datetime
from typing import Any
from xml.etree.ElementTree import Element

from defusedxml import ElementTree
from defusedxml.common import DefusedXmlException

from app.core.errors import ApiError

_ID = re.compile(r"^(TC[_\-A-Z0-9]+)[\s_-]", re.IGNORECASE)
_RF6_TIME = "%Y%m%d %H:%M:%S.%f"


def _elapsed_ms(status: Element) -> int:
    elapsed = status.get("elapsed")
    if elapsed is not None:
        try:
            return max(0, round(float(elapsed) * 1000))
        except ValueError:
            return 0
    start, end = status.get("starttime"), status.get("endtime")
    if start and end and start != "N/A" and end != "N/A":
        try:
            delta = datetime.strptime(end, _RF6_TIME) - datetime.strptime(start, _RF6_TIME)
            return max(0, round(delta.total_seconds() * 1000))
        except ValueError:
            return 0
    return 0


def parse_robot_output(xml_text: bytes | str) -> dict[str, Any]:
    """{"suiteTitle", "results": [...]}; raises ApiError(400) if unreadable."""
    try:
        root = ElementTree.fromstring(xml_text)
    except (ElementTree.ParseError, DefusedXmlException) as exc:
        raise ApiError(400, "The file is not a readable Robot Framework output.xml.") from exc
    if root.tag != "robot":
        raise ApiError(400, "The file is not a Robot Framework output.xml (no <robot> root).")
    top = root.find("suite")
    results: list[dict[str, Any]] = []
    for i, test in enumerate(root.iter("test")):
        title = (test.get("name") or "").strip() or f"Test Case {i + 1}"
        statuses = test.findall("status")
        status_el = statuses[-1] if statuses else None
        raw = status_el.get("status") if status_el is not None else "FAIL"
        status = raw if raw in ("PASS", "SKIP") else "FAIL"  # FAIL and NOT RUN count as failed
        match = _ID.match(title)
        result: dict[str, Any] = {
            "customId": match.group(1).replace("_", "-") if match else f"TC-{i + 1}",
            "title": title,
            "status": status,
            "elapsedTimeMs": _elapsed_ms(status_el) if status_el is not None else 0,
        }
        if status == "FAIL":
            message = (status_el.text or "").strip() if status_el is not None else ""
            result["failureMessage"] = message[:2000] or "Failed."
        results.append(result)
    if not results:
        raise ApiError(400, "The output.xml contains no test results.")
    return {"suiteTitle": (top.get("name") if top is not None else None) or "Robot Framework suite", "results": results}
