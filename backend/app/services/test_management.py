"""Test management: validation and the same ownership rules documents use.

Hierarchy (DDS-SRS-012): Projects > Suites > Sections (nested through
`parentId`) > Cases. A suite names its project with `projectId`, a case
its section with `sectionId`.

- A project, suite, run or milestone belongs to whoever created it
  (`createdBy`). Any signed-in user can put their own suite in any project.
- A suite's sections and test cases belong to the suite, the way a
  document's sections belong to the document: only the suite's owner can
  add, change or remove them.
- Admins can change everything. Anyone signed in can read everything.
"""

from datetime import UTC, datetime
from typing import Any

from app.core.errors import ApiError
from app.models.user import User
from app.repositories.test_management import Collection, TestManagementStore
from app.services.permissions import is_admin

_LABELS: dict[Collection, str] = {"projects": "Project", "runs": "Test run", "milestones": "Milestone"}
_REQUIRED_TEXT: dict[Collection, str] = {"projects": "name", "runs": "name", "milestones": "name"}


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _require_object(body: Any) -> dict[str, Any]:
    if not isinstance(body, dict):
        raise ApiError(400, "Body must be a JSON object.")
    return body


def _require_text(body: dict[str, Any], field: str) -> None:
    value = body.get(field)
    if not isinstance(value, str) or not value.strip():
        raise ApiError(400, f"{field} is required.")


def _can_change(user: User, item: dict[str, Any]) -> bool:
    return is_admin(user) or item.get("createdBy") == user.name


def _stamp(user: User, body: dict[str, Any], item_id: str, existing: dict[str, Any] | None) -> dict[str, Any]:
    """The item as stored: the path's id, and an owner the client cannot
    change - the original creator on an update, the caller on a create."""
    return {
        **body,
        "id": item_id,
        "createdBy": existing.get("createdBy") if existing else user.name,
        "updatedAt": _now(),
    }


class TestManagementService:
    __test__ = False

    def __init__(self, store: TestManagementStore) -> None:
        self._store = store

    async def snapshot(self) -> dict[str, Any]:
        return {**await self._store.snapshot(), "seeded": await self._store.is_seeded()}

    # ── suites ─────────────────────────────────────────────────────────
    async def _owned_suite(self, user: User, suite_id: str, action: str) -> dict[str, Any]:
        suite = await self._store.get_suite(suite_id)
        if suite is None:
            raise ApiError(404, "Test suite not found.")
        if not _can_change(user, suite):
            raise ApiError(403, f"You can only {action} test suites you created.")
        return suite

    async def save_suite(self, user: User, suite_id: str, body: Any) -> dict[str, Any]:
        body = _require_object(body)
        _require_text(body, "title")
        existing = await self._store.get_suite(suite_id)
        if existing is not None and not _can_change(user, existing):
            raise ApiError(403, "You can only edit test suites you created.")
        project_id = body.get("projectId")
        if project_id is not None and (
            not isinstance(project_id, str) or await self._store.get_item("projects", project_id) is None
        ):
            raise ApiError(400, "Project not found.")
        # Sections and cases are saved through their own routes.
        fields = {k: v for k, v in body.items() if k not in ("sections", "testCases")}
        suite = _stamp(user, fields, suite_id, existing)
        await self._store.put_suite(suite)
        return suite

    async def delete_suite(self, user: User, suite_id: str) -> None:
        await self._owned_suite(user, suite_id, "delete")
        await self._store.delete_suite(suite_id)

    # ── sections and cases ─────────────────────────────────────────────
    async def save_section(self, user: User, suite_id: str, section_id: str, body: Any) -> dict[str, Any]:
        body = _require_object(body)
        _require_text(body, "title")
        await self._owned_suite(user, suite_id, "edit sections of")
        await self._check_parent(suite_id, section_id, body.get("parentId"))
        existing = await self._store.get_section(suite_id, section_id)
        section = {**_stamp(user, body, section_id, existing), "suiteId": suite_id}
        await self._store.put_section(suite_id, section)
        return section

    async def _check_parent(self, suite_id: str, section_id: str, parent_id: Any) -> None:
        """A sub-section's parent must be a section of the same suite, and
        not the section itself or one of its own sub-sections."""
        if parent_id is None:
            return
        if not isinstance(parent_id, str):
            raise ApiError(400, "parentId must be a section id.")
        parents = {s["id"]: s.get("parentId") for s in await self._store.list_sections(suite_id)}
        if parent_id not in parents:
            raise ApiError(400, "Parent section not found.")
        seen: set[str] = set()
        current: Any = parent_id
        while isinstance(current, str) and current not in seen:
            if current == section_id:
                raise ApiError(400, "A section cannot be placed inside itself.")
            seen.add(current)
            current = parents.get(current)

    async def delete_section(self, user: User, suite_id: str, section_id: str) -> None:
        await self._owned_suite(user, suite_id, "edit sections of")
        if await self._store.get_section(suite_id, section_id) is None:
            raise ApiError(404, "Section not found.")
        if any(s.get("parentId") == section_id for s in await self._store.list_sections(suite_id)):
            raise ApiError(409, "Delete or move this section's sub-sections first.")
        if any(c.get("sectionId") == section_id for c in await self._store.list_cases(suite_id)):
            raise ApiError(409, "Move or delete this section's test cases first.")
        await self._store.delete_section(suite_id, section_id)

    async def save_case(self, user: User, suite_id: str, case_id: str, body: Any) -> dict[str, Any]:
        body = _require_object(body)
        _require_text(body, "title")
        await self._owned_suite(user, suite_id, "edit test cases of")
        existing = await self._store.get_case(suite_id, case_id)
        case = {**_stamp(user, body, case_id, existing), "suiteId": suite_id}
        await self._store.put_case(suite_id, case)
        return case

    async def delete_case(self, user: User, suite_id: str, case_id: str) -> None:
        await self._owned_suite(user, suite_id, "edit test cases of")
        if await self._store.get_case(suite_id, case_id) is None:
            raise ApiError(404, "Test case not found.")
        await self._store.delete_case(suite_id, case_id)

    # ── projects, runs and milestones ────────────────────────────────────────────
    async def save_item(self, user: User, collection: Collection, item_id: str, body: Any) -> dict[str, Any]:
        body = _require_object(body)
        _require_text(body, _REQUIRED_TEXT[collection])
        existing = await self._store.get_item(collection, item_id)
        if existing is not None and not _can_change(user, existing):
            raise ApiError(403, f"You can only edit {_LABELS[collection].lower()}s you created.")
        item = _stamp(user, body, item_id, existing)
        await self._store.put_item(collection, item)
        return item

    async def delete_item(self, user: User, collection: Collection, item_id: str) -> None:
        existing = await self._store.get_item(collection, item_id)
        if existing is None:
            raise ApiError(404, f"{_LABELS[collection]} not found.")
        if not _can_change(user, existing):
            raise ApiError(403, f"You can only delete {_LABELS[collection].lower()}s you created.")
        if collection == "projects" and any(s.get("projectId") == item_id for s in await self._store.list_suites()):
            raise ApiError(409, "Move or delete this project's test suites first.")
        await self._store.delete_item(collection, item_id)

    # ── sample data ────────────────────────────────────────────────────
    async def seed(self, user: User, body: Any) -> dict[str, Any]:
        """Loads the screen's sample data the first time anyone opens it,
        owned by that user. Later calls change nothing (409)."""
        body = _require_object(body)
        suites, runs, milestones = body.get("suites"), body.get("runs"), body.get("milestones")
        projects = body.get("projects", [])
        if not all(isinstance(x, list) for x in (projects, suites, runs, milestones)):
            raise ApiError(400, "Body must have suites, runs and milestones arrays.")
        if not await self._store.claim_seed():
            raise ApiError(409, "Sample data has already been loaded.")
        for project in projects:
            if isinstance(project, dict) and isinstance(project.get("id"), str):
                await self._store.put_item("projects", _stamp(user, project, project["id"], None))
        for suite in suites:
            if not isinstance(suite, dict) or not isinstance(suite.get("id"), str):
                continue
            suite_id = suite["id"]
            fields = {k: v for k, v in suite.items() if k not in ("sections", "testCases")}
            await self._store.put_suite(_stamp(user, fields, suite_id, None))
            for section in suite.get("sections") or []:
                if isinstance(section, dict) and isinstance(section.get("id"), str):
                    stamped = {**_stamp(user, section, section["id"], None), "suiteId": suite_id}
                    await self._store.put_section(suite_id, stamped)
            for case in suite.get("testCases") or []:
                if isinstance(case, dict) and isinstance(case.get("id"), str):
                    await self._store.put_case(suite_id, {**_stamp(user, case, case["id"], None), "suiteId": suite_id})
        for collection, items in (("runs", runs), ("milestones", milestones)):
            for item in items:
                if isinstance(item, dict) and isinstance(item.get("id"), str):
                    await self._store.put_item(collection, _stamp(user, item, item["id"], None))  # type: ignore[arg-type]
        return await self.snapshot()
