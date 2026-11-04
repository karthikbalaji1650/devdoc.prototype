"""Response shapes the Express app produced, byte for byte where clients can see it."""

import json
import re
from datetime import UTC, datetime, timedelta
from email.utils import format_datetime
from typing import Any

from starlette.responses import Response

from app.core.jscompat import js_dumps

STATUS_MESSAGES = {
    400: "Bad Request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    413: "Payload Too Large",
    415: "Unsupported Media Type",
    500: "Internal Server Error",
}


class JsonResponse(Response):
    """res.json(): JSON.stringify output, `application/json; charset=utf-8`."""

    media_type = "application/json; charset=utf-8"

    def render(self, content: Any) -> bytes:
        return js_dumps(content).encode("utf-8")


class FastJsonResponse(Response):
    """JSON from the standard library's C encoder: several times faster than
    JsonResponse's JSON.stringify emulation on large bodies (a 5,000-case
    test management snapshot: ~20 ms instead of ~100 ms). For routes with no
    Node behaviour to match; the one visible difference is a whole float
    like 1.0 spelled "1.0" rather than "1" - the same number to any reader."""

    media_type = "application/json; charset=utf-8"

    def render(self, content: Any) -> bytes:
        return json.dumps(content, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def error_json(status: int, message: str, headers: dict[str, str] | None = None) -> JsonResponse:
    return JsonResponse({"error": message}, status_code=status, headers=headers)


def no_content() -> Response:
    """res.status(204).end()."""
    return Response(status_code=204)


# --- Express's built-in error page (finalhandler) ---------------------------


def _escape_html(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )


_ALLOWED_URL_CHARS = re.compile(r"[\x21\x23-\x3B\x3D\x3F-\x5F\x61-\x7A\x7C\x7E]")
_PERCENT_ESCAPE = re.compile(r"%[0-9A-Fa-f]{2}")


def _encode_url(url: str) -> str:
    """The `encodeurl` package: escape what isn't URL-safe, keep valid %XX."""
    out: list[str] = []
    i = 0
    while i < len(url):
        if url[i] == "%" and _PERCENT_ESCAPE.match(url, i):
            out.append(url[i : i + 3])
            i += 3
            continue
        ch = url[i]
        if ch != "%" and _ALLOWED_URL_CHARS.match(ch):
            out.append(ch)
        else:
            out.append("".join(f"%{b:02X}" for b in ch.encode("utf-8", "surrogatepass")))
        i += 1
    return "".join(out)


def express_error_page(status: int, message: str | None = None) -> Response:
    """finalhandler's HTML error document (production mode: no stack trace)."""
    text = message if message is not None else STATUS_MESSAGES.get(status, "Error")
    body = _escape_html(text).replace("\n", "<br>").replace("  ", " &nbsp;")
    html = (
        '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        "<title>Error</title>\n</head>\n<body>\n"
        f"<pre>{body}</pre>\n</body>\n</html>\n"
    )
    return Response(
        html.encode("utf-8"),
        status_code=status,
        headers={
            "Content-Security-Policy": "default-src 'none'",
            "X-Content-Type-Options": "nosniff",
            "Content-Type": "text/html; charset=utf-8",
        },
    )


def express_not_found(method: str, raw_path: str) -> Response:
    """`Cannot GET /some/path` - Express's response for an unmatched route."""
    return express_error_page(404, f"Cannot {method} {_encode_url(raw_path)}")


# --- res.cookie / res.clearCookie -------------------------------------------


def _http_date(moment: datetime) -> str:
    return format_datetime(moment.astimezone(UTC), usegmt=True)


def session_cookie_header(name: str, value: str, max_age_ms: int, secure: bool) -> str:
    """Same attribute order as the `cookie` package Express 4 serializes with."""
    expires = datetime.now(UTC) + timedelta(milliseconds=max_age_ms)
    parts = [f"{name}={value}", f"Max-Age={max_age_ms // 1000}", "Path=/", f"Expires={_http_date(expires)}", "HttpOnly"]
    if secure:
        parts.append("Secure")
    parts.append("SameSite=Lax")
    return "; ".join(parts)


def cleared_cookie_header(name: str) -> str:
    return f"{name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT"
