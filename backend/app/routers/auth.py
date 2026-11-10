from urllib.parse import urlencode

from fastapi import APIRouter, Request
from starlette.responses import Response

from app.core.cookies import parse_cookie_header
from app.core.errors import ApiError
from app.core.http import JsonResponse, cleared_cookie_header, error_json, no_content, session_cookie_header
from app.core.security import SESSION_COOKIE, SESSION_TTL_MS
from app.dependencies import ServicesDep, current_user_or_none, json_body, request_session_id
from app.routers.common import get_route
from app.schemas.auth import LoginRequest, UserResponse, session_user
from app.schemas.common import ErrorResponse
from app.schemas.openapi import request_body
from app.services.sso import STATE_COOKIE, STATE_TTL_S, SsoError

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


# ── JWT access tokens (DDS-SRS-076) ────────────────────────────────────


@router.post("/token", responses={401: {"model": ErrorResponse}, 501: {"model": ErrorResponse}})
async def issue_token(request: Request, services: ServicesDep) -> Response:
    """A JWT for the current session, for `Authorization: Bearer` on any API
    route. Valid for an hour, and only while the session is: signing out
    revokes it."""
    user = await current_user_or_none(request)
    session_id = request_session_id(request)
    if user is None or session_id is None:
        return error_json(401, "Sign in first; a token is issued for a signed-in session.")
    if not services.tokens.available:
        return error_json(501, "JWT tokens are off on this server (set JWT_SECRET or SECRETS_KEY).")
    return JsonResponse(services.tokens.issue(user.id, session_id))


# ── single sign-on: OAuth2 / OpenID Connect (DDS-SRS-076) ──────────────


@get_route(router, "/sso/config")
async def sso_config(services: ServicesDep) -> Response:
    """Whether the sign-in page shows "Sign in with <provider>"."""
    return JsonResponse(services.sso.config())


def _redirect(location: str) -> Response:
    return Response(status_code=302, headers={"Location": location, "Cache-Control": "no-store"})


def _with_query(url: str, **params: str) -> str:
    return f"{url}{'&' if '?' in url else '?'}{urlencode(params)}"


@get_route(router, "/sso/login", responses={404: {"model": ErrorResponse}, 502: {"model": ErrorResponse}})
async def sso_login(services: ServicesDep) -> Response:
    """Sends the browser to the provider; the state cookie ties the reply to this browser."""
    try:
        location, state = await services.sso.start()
    except ApiError as exc:
        return error_json(exc.status, exc.message)
    response = _redirect(location)
    cookie = f"{STATE_COOKIE}={state}; Max-Age={STATE_TTL_S}; Path=/api/auth/sso; HttpOnly; SameSite=Lax"
    response.headers.append("set-cookie", cookie + ("; Secure" if services.cookie_secure else ""))
    return response


@get_route(router, "/sso/callback")
async def sso_callback(request: Request, services: ServicesDep) -> Response:
    """The provider sends the browser back here; on success it gets a normal
    session cookie and lands on the app, otherwise on the sign-in page with
    the reason."""
    landing = services.sso.post_login_url
    cookie_state = parse_cookie_header("; ".join(request.headers.getlist("cookie"))).get(STATE_COOKIE)
    try:
        email = await services.sso.finish(dict(request.query_params), cookie_state)
        session_id, _ = await services.auth.login_sso(email)
    except SsoError as exc:
        response = _redirect(_with_query(landing, sso_error=str(exc)))
    except ApiError as exc:
        response = _redirect(_with_query(landing, sso_error=exc.message))
    else:
        response = _redirect(_with_query(landing, sso="1"))
        response.headers.append(
            "set-cookie", session_cookie_header(SESSION_COOKIE, session_id, SESSION_TTL_MS, services.cookie_secure)
        )
    response.headers.append("set-cookie", f"{STATE_COOKIE}=; Max-Age=0; Path=/api/auth/sso; HttpOnly; SameSite=Lax")
    return response
