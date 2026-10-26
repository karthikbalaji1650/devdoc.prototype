from fastapi import APIRouter, Depends, Request
from starlette.responses import Response

from app.core.http import JsonResponse, no_content
from app.dependencies import CurrentUser, ServicesDep, json_body, require_user
from app.routers.common import get_route
from app.schemas.common import ErrorResponse
from app.schemas.documents import (
    DocumentListResponse,
    DocumentModel,
    SavedDocumentResponse,
    StoredDocumentResponse,
)
from app.schemas.openapi import request_body

# Every route requires a session, checked before the route itself - an
# unknown path under this prefix is a 401 too until signed in.
router = APIRouter(
    prefix="/api/documents",
    tags=["documents"],
    dependencies=[Depends(require_user)],
    responses={401: {"model": ErrorResponse}},
)
_not_found = {404: {"model": ErrorResponse}}
_forbidden = {403: {"model": ErrorResponse}}


@get_route(router, "", response_model=DocumentListResponse)
async def list_documents(user: CurrentUser, services: ServicesDep) -> Response:
    return JsonResponse({"documents": await services.documents.list_visible(user)})


@get_route(router, "/{document_id}", response_model=StoredDocumentResponse, responses=_not_found)
async def get_document(document_id: str, user: CurrentUser, services: ServicesDep) -> Response:
    return JsonResponse({"document": await services.documents.get_visible(user, document_id)})


@router.put(
    "/{document_id}",
    response_model=SavedDocumentResponse,
    responses={400: {"model": ErrorResponse}, **_forbidden},
    openapi_extra=request_body(DocumentModel),
)
async def save_document(document_id: str, request: Request, user: CurrentUser, services: ServicesDep) -> Response:
    """Create or replace. Non-admins always save as themselves."""
    return JsonResponse({"document": await services.documents.save(user, document_id, json_body(request))})


@router.delete("/{document_id}", status_code=204, responses={**_not_found, **_forbidden})
async def delete_document(document_id: str, user: CurrentUser, services: ServicesDep) -> Response:
    """Soft delete: the document drops out of every read, the row stays."""
    await services.documents.soft_delete(user, document_id)
    return no_content()


@router.delete("/{document_id}/purge", status_code=204, responses={**_not_found, **_forbidden})
async def purge_document(document_id: str, user: CurrentUser, services: ServicesDep) -> Response:
    """Permanent delete, including an already soft-deleted document."""
    await services.documents.purge(user, document_id)
    return no_content()
