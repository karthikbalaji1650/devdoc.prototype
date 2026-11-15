"""Release management storage (DDS-SRS-033 - 046).

The service (services/releases.py) holds every rule; this is only where the
data lives. Two implementations: Postgres (releases_postgres.py, production)
and in memory (releases_memory.py, tests and the browser-test harness).

Everything crosses this boundary as plain dicts in the API's own camelCase
shape, so the service reads and writes the same structure the frontend sees:

release   id, version, title, type, targetDate, segment, status, notes,
          milestones [{key, name, plannedDate, actualDate}],
          signers [{userId, name, title, department}] (creator first),
          gateRules {minPassRate, requireNoOpenBlockers, mandatorySuiteIds},
          blockerQuery, blockerSync, createdBy (user id), createdByName,
          createdAt, updatedAt, cancelledReason, cancelledAt
build     id, number, label, kind, imageName, commitSha, branchTag,
          artifactUrl, repository, sha256, builtAt, pipelineBuildId,
          testRunIds, gateOverride {by, byId, reason, at} | None,
          promotedBy, promotedById, promotedAt, createdBy, createdAt,
          signoffs {userId: {userId, userName, decision, comment, at}}
blocker   id, key, tracker, title, url, severity, status, source, syncNote,
          syncedAt, createdBy, updatedAt
audit     seq, at, actorId, actor, actorRole, action, details, prevHash, hash
"""

from collections.abc import Callable
from typing import Any, Protocol


class DuplicateVersion(Exception):
    """Another release already has this version (ignoring case and spaces)."""


class DuplicateBuild(Exception):
    """A build with this number was registered at the same moment."""


class DuplicateBlocker(Exception):
    """This issue is already listed on the release."""


class ReleaseRepository(Protocol):
    async def create(self, release: dict[str, Any], signer_ids: list[str]) -> None:
        """Stores the release with its five milestones and its signers (the
        creator first). Raises DuplicateVersion."""
        ...

    async def get(self, release_id: str) -> dict[str, Any] | None: ...

    async def list_all(self) -> list[dict[str, Any]]:
        """Oldest first."""
        ...

    async def update(self, release: dict[str, Any]) -> None:
        """Writes the release's own fields, milestones and blocker query (not
        its signers, builds or blockers). Raises DuplicateVersion."""
        ...

    async def cancel(self, release_id: str, reason: str) -> None: ...

    async def set_signers(self, release_id: str, signer_ids: list[str], added_by: str) -> None:
        """Replaces the signers (creator first). A removed person's earlier
        sign-offs stay stored."""
        ...

    async def set_blocker_sync(self, release_id: str, result: dict[str, Any]) -> None: ...

    async def claim_sync(self, release_id: str, slot: int) -> bool:
        """True once per release per slot, across API instances (044)."""
        ...

    # builds
    async def list_builds(self, release_id: str) -> list[dict[str, Any]]:
        """By number, with linked run ids and sign-offs."""
        ...

    async def get_build(self, release_id: str, build_id: str) -> dict[str, Any] | None: ...

    async def add_build(self, release_id: str, build: dict[str, Any]) -> None:
        """Raises DuplicateBuild."""
        ...

    async def set_gate_override(self, release_id: str, build_id: str, by_id: str, reason: str, at: str) -> None: ...

    async def set_build_runs(self, release_id: str, build_id: str, run_ids: list[str]) -> None: ...

    async def put_signoff(
        self, release_id: str, build_id: str, user_id: str, decision: str, comment: str | None, at: str
    ) -> None:
        """One decision per person per build; a new one replaces the old."""
        ...

    async def promote(self, release_id: str, build_id: str, by_id: str, at: str, release_status: str) -> None:
        """Makes the build Final and sets the release status, together."""
        ...

    # blockers
    async def list_blockers(self, release_id: str) -> list[dict[str, Any]]: ...

    async def get_blocker(self, release_id: str, blocker_id: str) -> dict[str, Any] | None: ...

    async def put_blocker(self, release_id: str, blocker: dict[str, Any]) -> None:
        """Inserts or replaces. Raises DuplicateBlocker."""
        ...

    async def delete_blocker(self, release_id: str, blocker_id: str) -> None: ...

    # audit (append-only)
    async def append_audit(
        self, release_id: str, make_entry: Callable[[dict[str, Any] | None], dict[str, Any]]
    ) -> None:
        """Builds the next entry from the current last one and stores it, with
        no other entry added in between."""
        ...

    async def audit(self, release_id: str) -> list[dict[str, Any]]: ...

    async def export_all(self) -> list[dict[str, Any]]:
        """Every release with builds, blockers and audit - for the admin backup."""
        ...
