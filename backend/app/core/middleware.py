"""ASGI middleware reproducing the Express app's middleware stack:
`express.json({ limit: '5mb' })` first, then `cors(...)`.

Order matters and is kept on purpose: body parsing ran *before* cors in
the Node app, so a malformed-JSON or too-large request was answered with
Express's HTML error page and no CORS headers at all.
"""

import json
import zlib
from collections.abc import Iterable
from typing import Any

from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.http import express_error_page
from app.core.jscompat import js_loads

BODY_LIMIT_BYTES = 5 * 1024 * 1024
BODY_STATE_KEY = "json_body"
_JSON_WHITESPACE = " \t\n\r"


class _BodyError(Exception):
    def __init__(self, status: int) -> None:
        self.status = status


def _content_type(headers: Headers) -> tuple[str, dict[str, str]]:
    raw = headers.get("content-type", "")
    mime, *params = raw.split(";")
    parsed: dict[str, str] = {}
    for param in params:
        if "=" in param:
            k, v = param.split("=", 1)
            parsed[k.strip().lower()] = v.strip().strip('"')
    return mime.strip().lower(), parsed


def _has_body(headers: Headers) -> bool:
    if "transfer-encoding" in headers:
        return True
    length = headers.get("content-length")
    return length is not None and length != "0"


def _decode(raw: bytes, encoding: str) -> bytes:
    if encoding == "identity":
        return raw
    if encoding == "gzip":
        return zlib.decompress(raw, 16 + zlib.MAX_WBITS)
    if encoding == "deflate":
        return zlib.decompress(raw)
    raise _BodyError(415)


def _parse_json(text: str) -> Any:
    if text == "":
        return {}
    stripped = text.lstrip(_JSON_WHITESPACE)
    if not stripped or stripped[0] not in "{[":
        raise _BodyError(400)  # strict mode: only objects and arrays
    try:
        return js_loads(text)
    except (json.JSONDecodeError, ValueError, RecursionError) as exc:
        raise _BodyError(400) from exc


class JsonBodyMiddleware:
    """Parses `application/json` bodies into scope["state"]["json_body"].

    Endpoints read the parsed value from there instead of re-reading the
    stream; a request without a JSON body leaves `{}`, exactly what
    `req.body` was in Express.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        state = scope.setdefault("state", {})
        state[BODY_STATE_KEY] = {}
        headers = Headers(scope=scope)
        mime, params = _content_type(headers)
        if mime != "application/json" or not _has_body(headers):
            await self.app(scope, receive, send)
            return

        try:
            charset = params.get("charset", "utf-8").lower()
            if not charset.startswith("utf-"):
                raise _BodyError(415)
            declared = headers.get("content-length")
            if declared is not None and declared.isdigit() and int(declared) > BODY_LIMIT_BYTES:
                raise _BodyError(413)
            raw = await _read_body(receive)
            encoding = headers.get("content-encoding", "identity").lower()
            if encoding == "identity" and len(raw) > BODY_LIMIT_BYTES:
                raise _BodyError(413)
            try:
                decoded = _decode(raw, encoding)
            except zlib.error as exc:
                raise _BodyError(400) from exc
            if len(decoded) > BODY_LIMIT_BYTES:
                raise _BodyError(413)
            text = decoded.decode("utf-8", errors="replace").removeprefix("\ufeff")
            state[BODY_STATE_KEY] = _parse_json(text)
        except _BodyError as err:
            await express_error_page(err.status)(scope, receive, send)
            return

        replayed = False

        async def replay() -> Message:
            nonlocal replayed
            if not replayed:
                replayed = True
                return {"type": "http.request", "body": raw, "more_body": False}
            return await receive()

        await self.app(scope, replay, send)


async def _read_body(receive: Receive) -> bytes:
    chunks: list[bytes] = []
    size = 0
    while True:
        message = await receive()
        if message["type"] == "http.disconnect":
            break
        chunk = message.get("body", b"")
        size += len(chunk)
        if size > BODY_LIMIT_BYTES * 20:  # compressed bodies are checked after inflating
            raise _BodyError(413)
        chunks.append(chunk)
        if not message.get("more_body", False):
            break
    return b"".join(chunks)


PREFLIGHT_METHODS = "GET,HEAD,PUT,PATCH,POST,DELETE"


def _append_vary(headers: MutableHeaders, fields: Iterable[str]) -> None:
    existing = [v.strip() for v in headers.get("vary", "").split(",") if v.strip()]
    lowered = {v.lower() for v in existing}
    if "*" in lowered:
        return
    for name in fields:
        if name.lower() not in lowered:
            existing.append(name)
            lowered.add(name.lower())
    headers["Vary"] = ", ".join(existing)


class ExpressCorsMiddleware:
    """`cors({ origin: [...], credentials: true })` from the `cors` package.

    Unlike Starlette's CORSMiddleware this sends
    `Access-Control-Allow-Credentials` on every response (allowed origin or
    not), answers every preflight with 204, and never rejects a request.
    """

    def __init__(self, app: ASGIApp, origins: list[str]) -> None:
        self.app = app
        self.origins = origins

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_headers = Headers(scope=scope)
        origin = request_headers.get("origin")
        allowed = origin is not None and origin in self.origins

        def apply_common(headers: MutableHeaders) -> None:
            if allowed:
                headers["Access-Control-Allow-Origin"] = origin  # type: ignore[assignment]
            _append_vary(headers, ["Origin"])
            headers["Access-Control-Allow-Credentials"] = "true"

        if scope["method"].upper() == "OPTIONS":
            headers = MutableHeaders()
            apply_common(headers)
            headers["Access-Control-Allow-Methods"] = PREFLIGHT_METHODS
            # No allowedHeaders configured: reflect the request's, and always
            # vary on it (even when the preflight asked for none).
            _append_vary(headers, ["Access-Control-Request-Headers"])
            requested = request_headers.get("access-control-request-headers")
            if requested:
                headers["Access-Control-Allow-Headers"] = requested
            headers["Content-Length"] = "0"
            await send({"type": "http.response.start", "status": 204, "headers": headers.raw})
            await send({"type": "http.response.body", "body": b""})
            return

        async def send_with_cors(message: Message) -> None:
            if message["type"] == "http.response.start":
                apply_common(MutableHeaders(scope=message))
            await send(message)

        await self.app(scope, receive, send_with_cors)
