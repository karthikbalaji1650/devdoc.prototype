"""Connect existing code (DDS-SRS-030) - rules in services/repos.py."""

from fastapi import APIRouter, Depends, Request
from starlette.responses import Response

from app.core.http import JsonResponse, no_content
from app.dependencies import CurrentUser, ServicesDep, json_body, require_user
from app.routers.common import get_route
from app.schemas.common import ErrorResponse

router = APIRouter(
    prefix="/api/repos",
    tags=["repos"],
    dependencies=[Depends(require_user)],
    responses={401: {"model": ErrorResponse}},
)
_write = {
    400: {"model": ErrorResponse},
    403: {"model": ErrorResponse},
    404: {"model": ErrorResponse},
    409: {"model": ErrorResponse},
    502: {"model": ErrorResponse},
}


@get_route(router, "")
async def list_repos(services: ServicesDep) -> Response:
    """Connected repositories, each with its branch and last commit in the code editor's workspace."""
    return JsonResponse(await services.repos.list())


@router.post("", responses=_write)
async def connect_repo(request: Request, user: CurrentUser, services: ServicesDep) -> Response:
    """Clones into repos/<name> in the code editor's workspace."""
    return JsonResponse({"repo": await services.repos.connect(user, json_body(request))})


@router.post("/{name}/pull", responses=_write)
async def pull_repo(name: str, user: CurrentUser, services: ServicesDep) -> Response:
    return JsonResponse({"repo": await services.repos.pull(user, name)})


@router.delete("/{name}", status_code=204, responses=_write)
async def remove_repo(name: str, user: CurrentUser, services: ServicesDep) -> Response:
    """Removes the clone from the workspace and forgets the repository."""
    await services.repos.remove(user, name)
    return no_content()
