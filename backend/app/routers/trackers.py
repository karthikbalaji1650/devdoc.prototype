"""Jira / GitHub connections for release blockers (DDS-SRS-044) - rules in services/trackers.py."""

from fastapi import APIRouter, Depends, Request
from starlette.responses import Response

from app.core.http import JsonResponse, no_content
from app.dependencies import CurrentUser, ServicesDep, json_body, require_user
from app.routers.common import get_route
from app.schemas.common import ErrorResponse

router = APIRouter(
    prefix="/api/trackers",
    tags=["trackers"],
    dependencies=[Depends(require_user)],
    responses={401: {"model": ErrorResponse}},
)
_write = {400: {"model": ErrorResponse}, 403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}}


@get_route(router, "")
async def get_trackers(user: CurrentUser, services: ServicesDep) -> Response:
    """Admins see the connection settings (never the token); others only whether each is connected."""
    return JsonResponse(await services.trackers.get_config(user))


@router.put("/{kind}", responses={**_write, 503: {"model": ErrorResponse}})
async def save_tracker(kind: str, request: Request, user: CurrentUser, services: ServicesDep) -> Response:
    """kind is jira or github. Leaving the token out keeps the stored one."""
    return JsonResponse({"tracker": await services.trackers.save_config(user, kind, json_body(request))})


@router.delete("/{kind}", status_code=204, responses=_write)
async def delete_tracker(kind: str, user: CurrentUser, services: ServicesDep) -> Response:
    await services.trackers.delete_config(user, kind)
    return no_content()


@router.post("/{kind}/check", responses=_write)
async def check_tracker(kind: str, user: CurrentUser, services: ServicesDep) -> Response:
    return JsonResponse(await services.trackers.check(user, kind))
