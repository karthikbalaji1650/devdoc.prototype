from fastapi import APIRouter

from app.core.http import JsonResponse
from app.routers.common import get_route
from app.schemas.common import OkResponse

router = APIRouter(tags=["health"])


@get_route(router, "/api/health", response_model=OkResponse)
async def health() -> JsonResponse:
    return JsonResponse({"ok": True})
