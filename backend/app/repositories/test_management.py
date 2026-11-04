"""Test management data in Redis: suites, their sections and cases, runs
and milestones. Before this it lived only in each user's browser.

Keys (all under `dds:tm:`):

    suites                      hash  suite id   -> suite JSON (no sections/cases)
    suite:{id}:sections         hash  section id -> section JSON
    suite:{id}:cases            hash  case id    -> case JSON
    runs                        hash  run id     -> run JSON
    milestones                  hash  milestone id -> milestone JSON
    seq                         counter for each item's insertion order
    seeded                      set once sample data has been loaded

Every stored item carries `_seq` (its insertion order, so lists come back
in the order they were created - hashes are unordered) and `createdBy`
(who created it, for permission checks). `_seq` never leaves this module.
"""

import json
from typing import Any, Literal

from redis.asyncio import Redis

PREFIX = "dds:tm:"
Collection = Literal["runs", "milestones"]


def _suites_key() -> str:
    return f"{PREFIX}suites"


def _sections_key(suite_id: str) -> str:
    return f"{PREFIX}suite:{suite_id}:sections"


def _cases_key(suite_id: str) -> str:
    return f"{PREFIX}suite:{suite_id}:cases"


def _collection_key(name: Collection) -> str:
    return f"{PREFIX}{name}"


def _ordered(raw: dict[str, str]) -> list[dict[str, Any]]:
    items = [json.loads(v) for v in raw.values()]
    items.sort(key=lambda item: item.get("_seq", 0))
    for item in items:
        item.pop("_seq", None)
    return items


def _load(raw: str | None) -> dict[str, Any] | None:
    if raw is None:
        return None
    item = json.loads(raw)
    item.pop("_seq", None)
    return item


class TestManagementStore:
    __test__ = False  # not a pytest test class, despite the name

    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    async def _put(self, key: str, item_id: str, item: dict[str, Any]) -> None:
        """Insert or replace, keeping the original insertion order on replace."""
        existing = await self._redis.hget(key, item_id)
        seq = json.loads(existing).get("_seq") if existing else None
        if seq is None:
            seq = await self._redis.incr(f"{PREFIX}seq")
        await self._redis.hset(key, item_id, json.dumps({**item, "_seq": seq}))

    # ── whole snapshot ─────────────────────────────────────────────────
    async def snapshot(self) -> dict[str, Any]:
        """Everything, in the nested shape the Test Management screen uses:
        suites carry their `sections` and `testCases`."""
        suites = _ordered(await self._redis.hgetall(_suites_key()))
        if suites:
            async with self._redis.pipeline(transaction=False) as pipe:
                for suite in suites:
                    pipe.hgetall(_sections_key(suite["id"]))
                    pipe.hgetall(_cases_key(suite["id"]))
                results = await pipe.execute()
            for i, suite in enumerate(suites):
                suite["sections"] = _ordered(results[2 * i])
                suite["testCases"] = _ordered(results[2 * i + 1])
        return {
            "suites": suites,
            "runs": _ordered(await self._redis.hgetall(_collection_key("runs"))),
            "milestones": _ordered(await self._redis.hgetall(_collection_key("milestones"))),
        }

    # ── suites ─────────────────────────────────────────────────────────
    async def get_suite(self, suite_id: str) -> dict[str, Any] | None:
        return _load(await self._redis.hget(_suites_key(), suite_id))

    async def put_suite(self, suite: dict[str, Any]) -> None:
        await self._put(_suites_key(), suite["id"], suite)

    async def delete_suite(self, suite_id: str) -> None:
        """Removes the suite with all of its sections and cases."""
        async with self._redis.pipeline(transaction=True) as pipe:
            pipe.hdel(_suites_key(), suite_id)
            pipe.delete(_sections_key(suite_id), _cases_key(suite_id))
            await pipe.execute()

    # ── sections and cases (children of a suite) ───────────────────────
    async def get_section(self, suite_id: str, section_id: str) -> dict[str, Any] | None:
        return _load(await self._redis.hget(_sections_key(suite_id), section_id))

    async def put_section(self, suite_id: str, section: dict[str, Any]) -> None:
        await self._put(_sections_key(suite_id), section["id"], section)

    async def delete_section(self, suite_id: str, section_id: str) -> None:
        await self._redis.hdel(_sections_key(suite_id), section_id)

    async def get_case(self, suite_id: str, case_id: str) -> dict[str, Any] | None:
        return _load(await self._redis.hget(_cases_key(suite_id), case_id))

    async def put_case(self, suite_id: str, case: dict[str, Any]) -> None:
        await self._put(_cases_key(suite_id), case["id"], case)

    async def delete_case(self, suite_id: str, case_id: str) -> None:
        await self._redis.hdel(_cases_key(suite_id), case_id)

    # ── runs and milestones ────────────────────────────────────────────
    async def get_item(self, collection: Collection, item_id: str) -> dict[str, Any] | None:
        return _load(await self._redis.hget(_collection_key(collection), item_id))

    async def put_item(self, collection: Collection, item: dict[str, Any]) -> None:
        await self._put(_collection_key(collection), item["id"], item)

    async def delete_item(self, collection: Collection, item_id: str) -> None:
        await self._redis.hdel(_collection_key(collection), item_id)

    # ── sample data ────────────────────────────────────────────────────
    async def claim_seed(self) -> bool:
        """True exactly once: for the first caller to load sample data."""
        return bool(await self._redis.set(f"{PREFIX}seeded", "1", nx=True))

    async def is_seeded(self) -> bool:
        return bool(await self._redis.exists(f"{PREFIX}seeded"))
