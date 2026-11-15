"""Release management (DDS-SRS-033 - 046) - rules in services/releases.py.

Anyone signed in can read and create. The creator changes their release;
its signers sign off, override gates and promote. Releases are cancelled,
never deleted.
"""

from fastapi import APIRouter, Depends, Request
from starlette.responses import Response

from app.core.http import JsonResponse, no_content
from app.dependencies import CurrentUser, ServicesDep, json_body, require_user
from app.routers.common import get_route
from app.schemas.common import ErrorResponse

router = APIRouter(
    prefix="/api/releases",
    tags=["releases"],
    dependencies=[Depends(require_user)],
    responses={401: {"model": ErrorResponse}},
)
_write = {400: {"model": ErrorResponse}, 403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}}
_gated = {**_write, 409: {"model": ErrorResponse}}


@get_route(router, "")
async def list_releases(user: CurrentUser, services: ServicesDep) -> Response:
    """A light line per release: version, status, signers, build and blocker counts."""
    return JsonResponse(await services.releases.list_releases(user))


@router.post("", responses=_gated)
async def create_release(request: Request, user: CurrentUser, services: ServicesDep) -> Response:
    """Creates a release. The caller is the first signer; `signerIds` adds 1 to 4 more."""
    return JsonResponse({"release": await services.releases.create_release(user, json_body(request))})


@get_route(router, "/{release_id}", responses={404: {"model": ErrorResponse}})
async def get_release(release_id: str, user: CurrentUser, services: ServicesDep) -> Response:
    """One release with its signers, builds (gates evaluated), blockers and metrics."""
    return JsonResponse({"release": await services.releases.get_release(user, release_id)})


@router.patch("/{release_id}", responses=_gated)
async def update_release(release_id: str, request: Request, user: CurrentUser, services: ServicesDep) -> Response:
    """Changes only the fields sent. Creator only."""
    release = await services.releases.update_release(user, release_id, json_body(request))
    return JsonResponse({"release": release})


@router.put("/{release_id}/signers", responses=_gated)
async def set_signers(release_id: str, request: Request, user: CurrentUser, services: ServicesDep) -> Response:
    """`userIds`: the 1 to 4 people besides the creator. Allowed until a build is Final."""
    release = await services.releases.set_signers(user, release_id, json_body(request))
    return JsonResponse({"release": release})


@router.post("/{release_id}/cancel", responses=_gated)
async def cancel_release(release_id: str, request: Request, user: CurrentUser, services: ServicesDep) -> Response:
    """Cancels the release with a reason. Nothing is deleted; the audit log is kept."""
    release = await services.releases.cancel_release(user, release_id, json_body(request))
    return JsonResponse({"release": release})


@get_route(router, "/{release_id}/audit", responses={404: {"model": ErrorResponse}})
async def audit_log(release_id: str, services: ServicesDep) -> Response:
    """Append-only, hash-chained; `intact` is false if a stored entry was altered."""
    return JsonResponse(await services.releases.audit_log(release_id))


@router.post("/{release_id}/builds", responses=_gated)
async def register_build(release_id: str, request: Request, user: CurrentUser, services: ServicesDep) -> Response:
    """Registers the next RC build (v{version}-RC100, -RC101, ...). Creator only."""
    return JsonResponse({"build": await services.releases.register_build(user, release_id, json_body(request))})


@router.put("/{release_id}/builds/{build_id}/runs", responses=_gated)
async def link_runs(
    release_id: str, build_id: str, request: Request, user: CurrentUser, services: ServicesDep
) -> Response:
    build = await services.releases.link_runs(user, release_id, build_id, json_body(request))
    return JsonResponse({"build": build})


@router.post("/{release_id}/builds/{build_id}/override", responses=_gated)
async def override_gates(
    release_id: str, build_id: str, request: Request, user: CurrentUser, services: ServicesDep
) -> Response:
    """Any signer; needs a reason."""
    build = await services.releases.override_gates(user, release_id, build_id, json_body(request))
    return JsonResponse({"build": build})


@router.post("/{release_id}/builds/{build_id}/signoffs", responses=_gated)
async def sign_off(
    release_id: str, build_id: str, request: Request, user: CurrentUser, services: ServicesDep
) -> Response:
    """The signed-in signer approves or rejects (a rejection needs a comment)."""
    build = await services.releases.sign_off(user, release_id, build_id, json_body(request))
    return JsonResponse({"build": build})


@router.post("/{release_id}/builds/{build_id}/promote", responses=_gated)
async def promote(release_id: str, build_id: str, user: CurrentUser, services: ServicesDep) -> Response:
    """RC -> Final once gates pass (or are overridden) and every signer approved. Any signer."""
    return JsonResponse({"build": await services.releases.promote(user, release_id, build_id)})


@router.post("/{release_id}/blockers", responses=_gated)
async def add_blocker(release_id: str, request: Request, user: CurrentUser, services: ServicesDep) -> Response:
    """A blocker entered by hand."""
    return JsonResponse({"blocker": await services.releases.add_blocker(user, release_id, json_body(request))})


@router.patch("/{release_id}/blockers/{blocker_id}", responses=_gated)
async def update_blocker(
    release_id: str, blocker_id: str, request: Request, user: CurrentUser, services: ServicesDep
) -> Response:
    blocker = await services.releases.update_blocker(user, release_id, blocker_id, json_body(request))
    return JsonResponse({"blocker": blocker})


@router.delete("/{release_id}/blockers/{blocker_id}", status_code=204, responses=_write)
async def delete_blocker(release_id: str, blocker_id: str, user: CurrentUser, services: ServicesDep) -> Response:
    await services.releases.delete_blocker(user, release_id, blocker_id)
    return no_content()


@router.post("/{release_id}/blockers/lookup", responses={**_gated, 502: {"model": ErrorResponse}})
async def lookup_blocker(release_id: str, request: Request, user: CurrentUser, services: ServicesDep) -> Response:
    """Links a Jira (PROJ-123) or GitHub (owner/repo#123) issue as a blocker, read from the tracker (044)."""
    return JsonResponse({"blocker": await services.releases.lookup_blocker(user, release_id, json_body(request))})


@router.post("/{release_id}/blockers/sync", responses=_gated)
async def sync_blockers(release_id: str, user: CurrentUser, services: ServicesDep) -> Response:
    """Syncs blockers from the release's Jira / GitHub query now; the worker also does every 5 minutes."""
    return JsonResponse(await services.releases.sync_blockers_now(user, release_id))
