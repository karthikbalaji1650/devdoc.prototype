"""Remote test execution servers (DDS-SRS-019, 075) - rules in services/test_servers.py."""

from fastapi import APIRouter, Depends, Request
from starlette.responses import Response

from app.core.http import JsonResponse, no_content
from app.dependencies import CurrentUser, ServicesDep, json_body, require_user
from app.routers.common import get_route
from app.schemas.common import ErrorResponse

router = APIRouter(
    prefix="/api/test-servers",
    tags=["test-servers"],
    dependencies=[Depends(require_user)],
    responses={401: {"model": ErrorResponse}},
)
_write = {
    400: {"model": ErrorResponse},
    403: {"model": ErrorResponse},
    404: {"model": ErrorResponse},
    503: {"model": ErrorResponse},
}


@get_route(router, "")
async def list_servers(user: CurrentUser, services: ServicesDep) -> Response:
    """Registered servers, without credentials. Non-admins get id, name and URL only."""
    return JsonResponse(await services.test_servers.list(user))


@router.post("", responses=_write)
async def create_server(request: Request, user: CurrentUser, services: ServicesDep) -> Response:
    return JsonResponse({"server": await services.test_servers.create(user, json_body(request))})


@router.put("/{server_id}", responses=_write)
async def update_server(server_id: str, request: Request, user: CurrentUser, services: ServicesDep) -> Response:
    """Leaving the secret out keeps the stored one."""
    return JsonResponse({"server": await services.test_servers.update(user, server_id, json_body(request))})


@router.delete("/{server_id}", status_code=204, responses=_write)
async def delete_server(server_id: str, user: CurrentUser, services: ServicesDep) -> Response:
    await services.test_servers.delete(user, server_id)
    return no_content()


@router.post("/{server_id}/check", responses=_write)
async def check_server(server_id: str, user: CurrentUser, services: ServicesDep) -> Response:
    """Authenticates and sends GET to the endpoint; reports status and timing only."""
    return JsonResponse(await services.test_servers.check(user, server_id))
