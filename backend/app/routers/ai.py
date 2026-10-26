from fastapi import APIRouter, Depends, Request
from starlette.responses import Response

from app.core.http import JsonResponse
from app.dependencies import ServicesDep, json_body, require_user
from app.routers.common import get_route
from app.schemas.ai import (
    GeneratedTestSuite,
    GenerateTestCasesRequest,
    ProvidersResponse,
    RephraseRequest,
    RephraseResponse,
)
from app.schemas.common import ErrorResponse
from app.schemas.openapi import request_body

router = APIRouter(
    prefix="/api/ai",
    tags=["ai"],
    dependencies=[Depends(require_user)],
    responses={401: {"model": ErrorResponse}},
)
_proxy_errors = {code: {"model": ErrorResponse} for code in (400, 501, 502)}


@get_route(router, "/providers", response_model=ProvidersResponse)
async def providers(services: ServicesDep) -> Response:
    """Lets the frontend ask, without guessing, whether it can skip asking
    the user for their own API key."""
    return JsonResponse({"providers": services.ai.configured_providers()})


@router.post(
    "/rephrase", response_model=RephraseResponse, responses=_proxy_errors, openapi_extra=request_body(RephraseRequest)
)
async def rephrase(request: Request, services: ServicesDep) -> Response:
    return JsonResponse(await services.ai.handle_rephrase(json_body(request)))


@router.post(
    "/generate-test-cases",
    response_model=GeneratedTestSuite,
    responses=_proxy_errors,
    openapi_extra=request_body(GenerateTestCasesRequest),
)
async def generate_test_cases(request: Request, services: ServicesDep) -> Response:
    return JsonResponse(await services.ai.handle_generate_test_cases(json_body(request)))
