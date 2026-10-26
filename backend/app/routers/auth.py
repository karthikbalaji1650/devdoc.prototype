from fastapi import APIRouter, Request
from starlette.responses import Response

from app.core.errors import ApiError
from app.core.http import JsonResponse, cleared_cookie_header, error_json, no_content, session_cookie_header
from app.core.security import SESSION_COOKIE, SESSION_TTL_MS
from app.dependencies import ServicesDep, current_user_or_none, json_body, request_session_id
from app.routers.common import get_route
from app.schemas.auth import LoginRequest, UserResponse, session_user
from app.schemas.common import ErrorResponse
from app.schemas.openapi import request_body

router = APIRouter(prefix="/api/auth", tags=["auth"])

TOO_MANY_ATTEMPTS = "Too many sign-in attempts. Try again in a few minutes."
_errors = {400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}, 429: {"model": ErrorResponse}}


@router.post("/login", response_model=UserResponse, responses=_errors, openapi_extra=request_body(LoginRequest))
async def login(request: Request, services: ServicesDep) -> Response:
    # Throttles repeated password guesses per client IP; a successful login
    # gives its hit back, so one typo doesn't count against a real sign-in.
    limit = services.login_limiter.hit(request.client.host if request.client else "")
    rate_headers = limit.headers()
    if limit.exceeded:
        return error_json(429, TOO_MANY_ATTEMPTS, rate_headers)
    try:
        session_id, user = await services.auth.login(json_body(request))
    except ApiError as exc:
        return error_json(exc.status, exc.message, rate_headers)
    services.login_limiter.refund(limit)

    response = JsonResponse({"user": session_user(user) if user else None}, headers=rate_headers)
    response.headers.append(
        "set-cookie",
        session_cookie_header(SESSION_COOKIE, session_id, SESSION_TTL_MS, services.cookie_secure),
    )
    return response


@router.post("/logout", status_code=204)
async def logout(request: Request, services: ServicesDep) -> Response:
    await services.auth.logout(request_session_id(request))
    response = no_content()
    response.headers.append("set-cookie", cleared_cookie_header(SESSION_COOKIE))
    return response


@get_route(router, "/me", response_model=UserResponse, responses={401: {"model": ErrorResponse}})
async def me(request: Request) -> Response:
    user = await current_user_or_none(request)
    if user is None:
        return error_json(401, "Not signed in.")
    return JsonResponse({"user": session_user(user)})
