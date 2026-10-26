"""State for the mock remote Test PC.

Deliberately in-process memory, as in the Node API: this is an explicit
mock, and nothing depends on scripts or jobs surviving a restart.
"""

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
