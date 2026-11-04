"""Release management (DDS-SRS-033 - 046) - rules in services/releases.py."""

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
async def snapshot(user: CurrentUser, services: ServicesDep) -> Response:
    """Every release with builds (gates evaluated), blockers and metrics."""
    return JsonResponse(await services.releases.snapshot(user))


@router.post("/seed", responses={400: {"model": ErrorResponse}, 409: {"model": ErrorResponse}})
async def seed(request: Request, user: CurrentUser, services: ServicesDep) -> Response:
    return JsonResponse(await services.releases.seed(user, json_body(request)))


@router.put("/{release_id}", responses=_write)
async def save_release(release_id: str, request: Request, user: CurrentUser, services: ServicesDep) -> Response:
    return JsonResponse({"release": await services.releases.save_release(user, release_id, json_body(request))})


@router.delete("/{release_id}", status_code=204, responses=_write)
async def delete_release(release_id: str, user: CurrentUser, services: ServicesDep) -> Response:
    """Removes the release; its audit log is kept."""
    await services.releases.delete_release(user, release_id)
    return no_content()


@get_route(router, "/{release_id}/audit", responses={404: {"model": ErrorResponse}})
async def audit_log(release_id: str, services: ServicesDep) -> Response:
    """Append-only, hash-chained; `intact` is false if a stored entry was altered."""
    return JsonResponse(await services.releases.audit_log(release_id))


@router.post("/{release_id}/builds", responses=_write)
async def register_build(release_id: str, request: Request, user: CurrentUser, services: ServicesDep) -> Response:
    """Registers the next RC build (v{version}-RC100, -RC101, ...)."""
    return JsonResponse({"build": await services.releases.register_build(user, release_id, json_body(request))})


@router.put("/{release_id}/builds/{build_id}/runs", responses=_write)
async def link_runs(
    release_id: str, build_id: str, request: Request, user: CurrentUser, services: ServicesDep
) -> Response:
    build = await services.releases.link_runs(user, release_id, build_id, json_body(request))
    return JsonResponse({"build": build})


@router.post("/{release_id}/builds/{build_id}/override", responses=_write)
async def override_gates(
    release_id: str, build_id: str, request: Request, user: CurrentUser, services: ServicesDep
) -> Response:
    build = await services.releases.override_gates(user, release_id, build_id, json_body(request))
    return JsonResponse({"build": build})


@router.post("/{release_id}/builds/{build_id}/signoffs", responses=_gated)
async def sign_off(
    release_id: str, build_id: str, request: Request, user: CurrentUser, services: ServicesDep
) -> Response:
    build = await services.releases.sign_off(user, release_id, build_id, json_body(request))
    return JsonResponse({"build": build})


@router.post("/{release_id}/builds/{build_id}/promote", responses=_gated)
async def promote(release_id: str, build_id: str, user: CurrentUser, services: ServicesDep) -> Response:
    """RC -> Final once gates pass (or are overridden) and all sign-offs approve."""
    return JsonResponse({"build": await services.releases.promote(user, release_id, build_id)})


@router.put("/{release_id}/blockers/{blocker_id}", responses=_write)
async def save_blocker(
    release_id: str, blocker_id: str, request: Request, user: CurrentUser, services: ServicesDep
) -> Response:
    blocker = await services.releases.save_blocker(user, release_id, blocker_id, json_body(request))
    return JsonResponse({"blocker": blocker})


@router.delete("/{release_id}/blockers/{blocker_id}", status_code=204, responses=_write)
async def delete_blocker(release_id: str, blocker_id: str, user: CurrentUser, services: ServicesDep) -> Response:
    await services.releases.delete_blocker(user, release_id, blocker_id)
    return no_content()
