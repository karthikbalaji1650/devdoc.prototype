"""Error handling that keeps the Node contract instead of FastAPI's defaults.

- Handled failures are `{"error": "<message>"}` with the route's status
  (ApiError), never FastAPI's `{"detail": ...}`.
- An unmatched route (including a known path with the wrong method, which
  FastAPI would answer 405) is Express's `Cannot GET /path` HTML 404, and
  under an auth-guarded prefix it is a 401 first - the Node routers ran
  `requireAuth` before trying to match any route.
- Request validation never reaches FastAPI: bodies are parsed by
  JsonBodyMiddleware and validated by hand, so a 422 cannot appear.
- Anything unexpected is Express's plain 500 page.
"""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.responses import Response

from app.core.http import error_json, express_error_page, express_not_found

NOT_SIGNED_IN = "Not signed in."
AUTH_GUARDED_PREFIXES = (
    "/api/documents",
    "/api/ai",
    "/api/test-exec",
    "/api/test-management",
    "/api/audit",
    "/api/collections",
    "/api/admin",
)


class ApiError(Exception):
    def __init__(self, status: int, message: str, headers: dict[str, str] | None = None) -> None:
        super().__init__(message)
        self.status = status
        self.message = message
        self.headers = headers


class NotSignedInError(ApiError):
    def __init__(self) -> None:
        super().__init__(401, NOT_SIGNED_IN)


def _under_guarded_prefix(path: str) -> bool:
    lowered = path.lower()
    return any(lowered == p or lowered.startswith(p + "/") for p in AUTH_GUARDED_PREFIXES)


def _raw_path(request: Request) -> str:
    raw = request.scope.get("raw_path")
    return raw.decode("latin-1") if raw else request.url.path


async def _route_not_found(request: Request) -> Response:
    if _under_guarded_prefix(request.url.path):
        from app.dependencies import current_user_or_none  # avoid an import cycle

        if await current_user_or_none(request) is None:
            return error_json(401, NOT_SIGNED_IN)
    return express_not_found(request.method, _raw_path(request))


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def api_error(_request: Request, exc: ApiError) -> Response:
        return error_json(exc.status, exc.message, exc.headers)

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request: Request, exc: StarletteHTTPException) -> Response:
        if exc.status_code in (404, 405):
            return await _route_not_found(request)
        return express_error_page(exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_request: Request, _exc: RequestValidationError) -> Response:
        return express_error_page(400)

    @app.exception_handler(Exception)
    async def unexpected_error(_request: Request, _exc: Exception) -> Response:
        # Starlette re-raises after sending this, so the server logs the
        # traceback; the Node process crashed outright on these instead.
        return express_error_page(500)
