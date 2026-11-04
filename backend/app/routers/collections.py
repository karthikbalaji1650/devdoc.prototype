"""Shared collections (libraries, logs) - rules in services/collections.py."""

from typing import Any

from fastapi import APIRouter, Depends, Request
from starlette.responses import Response

from app.core.http import FastJsonResponse, JsonResponse, no_content
from app.dependencies import CurrentUser, ServicesDep, json_body, require_user
from app.routers.common import get_route
from app.schemas.common import ErrorResponse, WireModel

router = APIRouter(
    prefix="/api/collections",
    tags=["collections"],
    dependencies=[Depends(require_user)],
    responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
_write = {400: {"model": ErrorResponse}, 403: {"model": ErrorResponse}, 409: {"model": ErrorResponse}}


class CollectionResponse(WireModel):
    items: list[dict[str, Any]]
    seeded: bool


class ItemResponse(WireModel):
    item: dict[str, Any]


@get_route(router, "/{name}", response_model=CollectionResponse)
async def list_items(name: str, user: CurrentUser, services: ServicesDep) -> Response:
    """Every item the caller may see, oldest first."""
    return FastJsonResponse(await services.collections.list(user, name))


@router.post("/{name}/seed", response_model=CollectionResponse, responses=_write)
async def seed(name: str, request: Request, user: CurrentUser, services: ServicesDep) -> Response:
    return JsonResponse(await services.collections.seed(user, name, json_body(request)))


@router.put("/{name}/{item_id}", response_model=ItemResponse, responses=_write)
async def save_item(name: str, item_id: str, request: Request, user: CurrentUser, services: ServicesDep) -> Response:
    return JsonResponse({"item": await services.collections.save(user, name, item_id, json_body(request))})


@router.delete("/{name}/{item_id}", status_code=204, responses={403: {"model": ErrorResponse}})
async def delete_item(name: str, item_id: str, user: CurrentUser, services: ServicesDep) -> Response:
    await services.collections.delete(user, name, item_id)
    return no_content()
