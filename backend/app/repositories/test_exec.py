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
    """Runs sent to a registered remote test server (DDS-SRS-020), in Redis
    so they survive a restart, unlike the mock's jobs:

        dds:texec:remote    hash  job id -> {serverId, remoteJobId, suiteId, ...}
    """

    KEY = "dds:texec:remote"

    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    async def put(self, job_id: str, job: dict[str, Any]) -> None:
        await self._redis.hset(self.KEY, job_id, json.dumps(job))

    async def get(self, job_id: str) -> dict[str, Any] | None:
        raw = await self._redis.hget(self.KEY, job_id)
        return json.loads(raw) if raw else None
