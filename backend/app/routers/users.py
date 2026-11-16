"""People search for pickers (e.g. choosing who signs off a release)."""

from fastapi import APIRouter, Depends, Query
from starlette.responses import Response

from app.core.http import JsonResponse
from app.dependencies import ServicesDep, require_user
from app.routers.common import get_route
from app.schemas.common import ErrorResponse, WireModel

router = APIRouter(
    prefix="/api/users",
    tags=["users"],
    dependencies=[Depends(require_user)],
    responses={401: {"model": ErrorResponse}},
)

LIMIT = 20
MAX_QUERY = 100


class PickerUser(WireModel):
    id: str
    name: str
    designation: str | None
    department: str | None


class PickerUsersResponse(WireModel):
    users: list[PickerUser]


@get_route(router, "", response_model=PickerUsersResponse)
async def search_users(services: ServicesDep, q: str = Query("")) -> Response:
    """Up to 20 people whose name, designation or department contains `q`, by name.
    Only what a picker shows: no email, role or password."""
    found = await services.users.search(q[:MAX_QUERY], LIMIT)
    return JsonResponse(
        {
            "users": [
                {"id": u.id, "name": u.name, "designation": u.designation, "department": u.department} for u in found
            ]
        }
    )
