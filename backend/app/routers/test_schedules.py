"""Scheduled test runs (DDS-SRS-028) - rules in services/schedules.py."""

from fastapi import APIRouter, Depends, Request
from starlette.responses import Response

from app.core.http import JsonResponse, no_content
from app.dependencies import CurrentUser, ServicesDep, json_body, require_user
from app.routers.common import get_route
from app.schemas.common import ErrorResponse

router = APIRouter(
    prefix="/api/test-schedules",
    tags=["test-schedules"],
    dependencies=[Depends(require_user)],
    responses={401: {"model": ErrorResponse}},
)
_write = {400: {"model": ErrorResponse}, 403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}}


@get_route(router, "")
async def list_schedules(request: Request, services: ServicesDep) -> Response:
    """All schedules, or one suite's with ?suiteId=."""
    return JsonResponse(await services.schedules.list(request.query_params.get("suiteId")))


@router.post("", responses=_write)
async def create_schedule(request: Request, user: CurrentUser, services: ServicesDep) -> Response:
    return JsonResponse({"schedule": await services.schedules.create(user, json_body(request))})


@router.put("/{schedule_id}", responses=_write)
async def update_schedule(schedule_id: str, request: Request, user: CurrentUser, services: ServicesDep) -> Response:
    return JsonResponse({"schedule": await services.schedules.update(user, schedule_id, json_body(request))})


@router.delete("/{schedule_id}", status_code=204, responses=_write)
async def delete_schedule(schedule_id: str, user: CurrentUser, services: ServicesDep) -> Response:
    await services.schedules.delete(user, schedule_id)
    return no_content()
