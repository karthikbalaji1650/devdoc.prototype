"""Rules for the shared collections (see repositories/collections.py).

Each collection is declared here; an unknown name is a 404. Every item
records who created it (`createdBy`). Changing or deleting an item is
limited to its creator and admins, plus - for the reviewers log - the
reviewer the entry names, who records their own decision on it.
"""

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from app.core.errors import ApiError
from app.models.user import User
from app.repositories.collections import CollectionStore
from app.services.permissions import is_admin


@dataclass(frozen=True)
class CollectionRules:
    label: str
    required: tuple[str, ...]
    max_items: int
    # Logs drop their oldest entry when full; libraries refuse new items.
    evict_oldest: bool = False
    # Logs are append-only: entries cannot be changed once written.
    append_only: bool = False
    extra_editor: Callable[[User, dict[str, Any]], bool] = field(default=lambda _u, _i: False)
    # Who can see an item; by default everyone signed in.
    private: bool = False


COLLECTIONS: dict[str, CollectionRules] = {
    "test-case-library": CollectionRules("library test case", ("customId", "title"), 5000),
    "test-suite-library": CollectionRules("library suite", ("title",), 1000),
    "reviewers-log": CollectionRules(
        "reviewers log entry",
        ("docTitle", "reviewerName", "reviewStatus"),
        5000,
        extra_editor=lambda user, item: item.get("reviewerName") == user.name,
    ),
    "drive-exports": CollectionRules("Drive export record", ("docTitle",), 50, evict_oldest=True, append_only=True),
    # The Doc Bin: deleted documents and sections. Each user sees what they
    # deleted; admins see everything. Holds a copy of what was deleted.
    "doc-bin": CollectionRules("Doc Bin entry", ("documentId", "itemType"), 1000, evict_oldest=True, private=True),
}


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class CollectionService:
    def __init__(self, store: CollectionStore) -> None:
        self._store = store

    def _rules(self, name: str) -> CollectionRules:
        rules = COLLECTIONS.get(name)
        if rules is None:
            raise ApiError(404, "No such collection.")
        return rules

    def _can_change(self, user: User, rules: CollectionRules, item: dict[str, Any]) -> bool:
        return is_admin(user) or item.get("createdBy") == user.name or rules.extra_editor(user, item)

    async def list(self, user: User, name: str) -> dict[str, Any]:
        rules = self._rules(name)
        items = await self._store.list(name)
        if rules.private and not is_admin(user):
            items = [i for i in items if i.get("createdBy") == user.name]
        return {"items": items, "seeded": await self._store.is_seeded(name)}

    async def save(self, user: User, name: str, item_id: str, body: Any) -> dict[str, Any]:
        rules = self._rules(name)
        if not isinstance(body, dict):
            raise ApiError(400, "Body must be a JSON object.")
        for f in rules.required:
            value = body.get(f)
            if not isinstance(value, str) or not value.strip():
                raise ApiError(400, f"{f} is required.")
        existing = await self._store.get(name, item_id)
        if existing is not None:
            if rules.private and not self._can_change(user, rules, existing):
                raise ApiError(404, "Item not found.")
            if rules.append_only:
                raise ApiError(409, f"A {rules.label} cannot be changed once recorded.")
            if not self._can_change(user, rules, existing):
                raise ApiError(403, f"You can only edit a {rules.label} you created.")
        elif await self._store.count(name) >= rules.max_items:
            if not rules.evict_oldest:
                raise ApiError(409, f"The collection is full ({rules.max_items} items).")
            oldest = (await self._store.list(name))[0]
            await self._store.delete(name, oldest["id"])
        item = {
            **body,
            "id": item_id,
            "createdBy": existing.get("createdBy") if existing else user.name,
            "updatedAt": _now(),
        }
        await self._store.put(name, item)
        return item

    async def delete(self, user: User, name: str, item_id: str) -> None:
        rules = self._rules(name)
        existing = await self._store.get(name, item_id)
        if existing is None or (rules.private and not self._can_change(user, rules, existing)):
            raise ApiError(404, "Item not found.")
        if not (is_admin(user) or existing.get("createdBy") == user.name):
            raise ApiError(403, f"You can only delete a {rules.label} you created.")
        await self._store.delete(name, item_id)

    async def seed(self, user: User, name: str, body: Any) -> dict[str, Any]:
        """Sample data, loaded once by the first user to open the screen."""
        self._rules(name)
        items = body.get("items") if isinstance(body, dict) else None
        if not isinstance(items, list):
            raise ApiError(400, "Body must have an items array.")
        if not await self._store.claim_seed(name):
            raise ApiError(409, "Sample data has already been loaded.")
        for item in items:
            if isinstance(item, dict) and isinstance(item.get("id"), str):
                await self._store.put(name, {**item, "createdBy": user.name, "updatedAt": _now()})
        return await self.list(user, name)
