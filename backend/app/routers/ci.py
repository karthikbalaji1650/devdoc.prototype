"""CI/CD integration (DDS-SRS-026, 027) - rules in services/ci.py.

/api/ci/tokens*    signed-in admins manage CI tokens
/api/ci/runs*      pipelines, with Authorization: Bearer <CI token>
/api/ci/results    pipelines upload results of tests they ran themselves
"""

import zlib
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from starlette.responses import Response

from app.core.errors import ApiError
from app.core.http import JsonResponse, no_content
from app.dependencies import CurrentUser, ServicesDep, json_body, require_user
from app.routers.common import get_route
from app.schemas.common import ErrorResponse

router = APIRouter(prefix="/api/ci", tags=["ci"])
_errors = {400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}}
MAX_UPLOAD_BYTES = 50 * 1024 * 1024


async def ci_token(request: Request, services: ServicesDep) -> dict[str, Any]:
    return await services.ci.authenticate(request.headers.get("authorization"))


CiToken = Annotated[dict[str, Any], Depends(ci_token)]


# ── tokens: signed-in admins ──────────────────────────────────────────


@get_route(router, "/tokens", dependencies=[Depends(require_user)], responses=_errors)
async def list_tokens(user: CurrentUser, services: ServicesDep) -> Response:
    return JsonResponse(await services.ci.list_tokens(user))


@router.post("/tokens", dependencies=[Depends(require_user)], responses=_errors)
async def create_token(request: Request, user: CurrentUser, services: ServicesDep) -> Response:
    """The token is in this response only; it cannot be shown again."""
    return JsonResponse(await services.ci.create_token(user, json_body(request)))


@router.delete("/tokens/{token_id}", status_code=204, dependencies=[Depends(require_user)], responses=_errors)
async def revoke_token(token_id: str, user: CurrentUser, services: ServicesDep) -> Response:
    await services.ci.revoke_token(user, token_id)
    return no_content()


# ── pipelines: CI token ───────────────────────────────────────────────


@router.post("/runs", responses={**_errors, 502: {"model": ErrorResponse}})
async def trigger_run(request: Request, token: CiToken, services: ServicesDep) -> Response:
    """Runs a stored suite on a registered test server; poll GET /api/ci/runs/{jobId}."""
    return JsonResponse(await services.ci.trigger(token, json_body(request)))


@get_route(router, "/runs/{job_id}", responses=_errors)
async def run_status(job_id: str, token: CiToken, services: ServicesDep) -> Response:
    """Status, progress and `outcome` (pending / passed / failed)."""
    return JsonResponse(await services.ci.status(job_id))


async def _read_body(request: Request) -> bytes:
    chunks: list[bytes] = []
    size = 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > MAX_UPLOAD_BYTES:
            raise ApiError(413, f"The upload is larger than {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.")
        chunks.append(chunk)
    raw = b"".join(chunks)
    if request.headers.get("content-encoding", "").lower() == "gzip":
        inflater = zlib.decompressobj(wbits=31)
        try:
            raw = inflater.decompress(raw, MAX_UPLOAD_BYTES + 1)
        except zlib.error as exc:
            raise ApiError(400, "The gzip body could not be decompressed.") from exc
        if len(raw) > MAX_UPLOAD_BYTES:
            raise ApiError(413, f"The upload is larger than {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.")
    return raw


@router.post("/results", responses={**_errors, 413: {"model": ErrorResponse}, 415: {"model": ErrorResponse}})
async def upload_results(request: Request, token: CiToken, services: ServicesDep) -> Response:
    """Body: a Robot Framework output.xml (application/xml, optionally gzip)
    or JSON {"results": [...]}. Query: suiteId, and optionally name,
    pipeline, buildUrl, buildNumber, repository, branch, commit."""
    body = await _read_body(request)
    params = dict(request.query_params)
    return JsonResponse(await services.ci.upload(token, params, request.headers.get("content-type", ""), body))
