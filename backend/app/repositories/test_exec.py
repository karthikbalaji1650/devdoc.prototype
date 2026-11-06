"""State for the mock remote Test PC.

Deliberately in-process memory, as in the Node API: this is an explicit
mock, and nothing depends on scripts or jobs surviving a restart.
"""

import json
from typing import Any

from redis.asyncio import Redis

from app.models.test_exec import Job, PushedScript


class TestExecRepository:
    __test__ = False  # not a pytest test class, despite the name

    def __init__(self) -> None:
        self._scripts: dict[str, PushedScript] = {}
        self._jobs: dict[str, Job] = {}

    def save_script(self, script: PushedScript) -> None:
        self._scripts[script.suite_id] = script

    def get_script(self, suite_id: str) -> PushedScript | None:
        return self._scripts.get(suite_id)

    def save_job(self, job_id: str, job: Job) -> None:
        self._jobs[job_id] = job

    def get_job(self, job_id: str) -> Job | None:
        return self._jobs.get(job_id)


class RemoteJobStore:
    """Runs sent to a registered remote test server (DDS-SRS-020, 021), in
    Redis so they survive a restart, unlike the mock's jobs:

        dds:texec:remote          hash  job id -> job JSON (status, progress, results, ...)
        dds:texec:active          set   job ids still QUEUED or RUNNING (the poller's work list)
        dds:texec:lock:{job id}   short-lived lock held while one API instance polls the job
    """

    KEY = "dds:texec:remote"
    ACTIVE = "dds:texec:active"

    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    async def put(self, job_id: str, job: dict[str, Any]) -> None:
        await self._redis.hset(self.KEY, job_id, json.dumps(job))

    async def get(self, job_id: str) -> dict[str, Any] | None:
        raw = await self._redis.hget(self.KEY, job_id)
        return json.loads(raw) if raw else None

    async def get_many(self, job_ids: list[str]) -> dict[str, dict[str, Any] | None]:
        raws = await self._redis.hmget(self.KEY, job_ids)
        return {i: (json.loads(r) if r else None) for i, r in zip(job_ids, raws, strict=True)}

    async def activate(self, job_id: str) -> None:
        await self._redis.sadd(self.ACTIVE, job_id)

    async def deactivate(self, job_id: str) -> None:
        await self._redis.srem(self.ACTIVE, job_id)

    async def active_ids(self) -> list[str]:
        return sorted(await self._redis.smembers(self.ACTIVE))

    async def lock(self, job_id: str, ttl_s: int) -> bool:
        return bool(await self._redis.set(f"dds:texec:lock:{job_id}", "1", nx=True, ex=ttl_s))
