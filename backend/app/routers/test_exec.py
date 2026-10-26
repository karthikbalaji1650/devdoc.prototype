from fastapi import APIRouter, Depends, Request
from starlette.responses import Response

from app.core.http import JsonResponse
from app.dependencies import ServicesDep, json_body, require_user
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
_bad_request = {400: {"model": ErrorResponse}}


@router.post(
    "/scripts", response_model=OkResponse, responses=_bad_request, openapi_extra=request_body(PushScriptRequest)
)
async def push_script(request: Request, services: ServicesDep) -> Response:
    return JsonResponse(services.test_exec.push_script(json_body(request)))


@router.post(
    "/runs", response_model=StartRunResponse, responses=_bad_request, openapi_extra=request_body(StartRunRequest)
)
async def start_run(request: Request, services: ServicesDep) -> Response:
    return JsonResponse(services.test_exec.start_run(json_body(request)))


@get_route(
    router,
    "/runs/{job_id}",
    response_model=RunStatusResponse,
    response_model_exclude_none=True,
    responses={404: {"model": ErrorResponse}},
)
async def run_status(job_id: str, services: ServicesDep) -> Response:
    return JsonResponse(services.test_exec.run_status(job_id))
