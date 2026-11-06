from fastapi import APIRouter, Depends, Request
from starlette.responses import Response, StreamingResponse

from app.core.errors import ApiError
from app.core.http import JsonResponse
from app.dependencies import CurrentUser, ServicesDep, json_body, require_user
from app.routers.common import get_route
from app.schemas.common import ErrorResponse, OkResponse
from app.schemas.openapi import request_body
from app.schemas.test_exec import PushScriptRequest, RunStatusResponse, StartRunRequest, StartRunResponse

router = APIRouter(
    prefix="/api/test-exec",
    tags=["test-exec"],
    dependencies=[Depends(require_user)],
    responses={401: {"model": ErrorResponse}},
)
_bad_request = {400: {"model": ErrorResponse}, 404: {"model": ErrorResponse}, 502: {"model": ErrorResponse}}


@router.post(
    "/scripts", response_model=OkResponse, responses=_bad_request, openapi_extra=request_body(PushScriptRequest)
)
async def push_script(request: Request, services: ServicesDep) -> Response:
    return JsonResponse(services.test_exec.push_script(json_body(request)))


@router.post(
    "/runs", response_model=StartRunResponse, responses=_bad_request, openapi_extra=request_body(StartRunRequest)
)
async def start_run(request: Request, user: CurrentUser, services: ServicesDep) -> Response:
    """Without serverId, the mock Test PC; with one, that registered server (DDS-SRS-020)."""
    return JsonResponse(await services.test_exec.start_run(json_body(request), user.name))


@get_route(
    router,
    "/runs/{job_id}",
    response_model=RunStatusResponse,
    response_model_exclude_none=True,
    responses={404: {"model": ErrorResponse}},
)
async def run_status(job_id: str, services: ServicesDep) -> Response:
    return JsonResponse(await services.test_exec.run_status(job_id))


@get_route(router, "/runs/{job_id}/events", responses={404: {"model": ErrorResponse}})
async def run_events(job_id: str, services: ServicesDep) -> Response:
    """Server-sent events for a run on a registered test server (DDS-SRS-022):
    `event: status` with the same JSON as GET /runs/{job_id}, sent at once and
    on every change, until the run finishes."""
    remote = services.test_exec.remote
    stream = await remote.events(job_id) if remote is not None else None
    if stream is None:
        raise ApiError(404, "No remote run found with that id.")
    return StreamingResponse(
        stream,
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
