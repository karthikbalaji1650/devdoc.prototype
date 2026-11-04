"""Admin-only audit views (DDS-SRS-011)."""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from starlette.responses import Response

from app.core.errors import ApiError
from app.core.http import JsonResponse
from app.dependencies import CurrentUser, ServicesDep, require_user
from app.routers.common import get_route
from app.schemas.common import ErrorResponse, WireModel
from app.services.permissions import is_admin

router = APIRouter(
    prefix="/api/audit",
    tags=["audit"],
    dependencies=[Depends(require_user)],
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)


class SessionAuditEntry(WireModel):
    id: str
    userId: str
    userName: str
    role: str
    loginTime: str
    logoutTime: str | None
    expiresAt: str
    status: str  # active | signed-out | expired


class SessionAuditResponse(WireModel):
    sessions: list[SessionAuditEntry]


@get_route(router, "/sessions", response_model=SessionAuditResponse)
async def sessions(user: CurrentUser, services: ServicesDep) -> Response:
    """The latest 200 sign-ins, newest first. Admins only."""
    if not is_admin(user):
        raise ApiError(403, "Only admins can view the session audit log.")
    now = datetime.now(UTC)
    entries = await services.session_audit.recent()
    for e in entries:
        expired = datetime.fromisoformat(e["expiresAt"].replace("Z", "+00:00")) <= now
        e["status"] = "signed-out" if e["logoutTime"] else "expired" if expired else "active"
    return JsonResponse({"sessions": entries})
