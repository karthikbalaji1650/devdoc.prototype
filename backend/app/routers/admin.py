"""Admin-only data management (DDS-SRS-008): server backup and reset."""

from fastapi import APIRouter, Depends, Request
from starlette.responses import Response

from app.core.http import FastJsonResponse, JsonResponse
from app.dependencies import CurrentUser, ServicesDep, json_body, require_user
from app.schemas.common import ErrorResponse

router = APIRouter(
    prefix="/api/admin",
    tags=["admin"],
    dependencies=[Depends(require_user)],
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)


@router.get("/backup")
async def backup(user: CurrentUser, services: ServicesDep) -> Response:
    """One JSON file with everything the server holds (documents and app data)."""
    data = await services.admin.backup(user)
    filename = f"devdoc-studio-server-backup-{data['exportedAt'][:10]}.json"
    return FastJsonResponse(data, headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.post("/reset", responses={400: {"model": ErrorResponse}})
async def reset(request: Request, user: CurrentUser, services: ServicesDep) -> Response:
    """Deletes all documents and app data; keeps users, sessions and the
    session audit log. Body: {"confirm": "DELETE ALL DATA"}."""
    return JsonResponse(await services.admin.reset(user, json_body(request)))
