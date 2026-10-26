"""Cookie reading exactly as cookie-parser 1.4 (cookie 0.7) did it.

Starlette's own parser lets a later duplicate cookie win; the Node app let
the first one win and also understood cookie-parser's `j:` JSON cookies,
so a session lookup goes through this instead.
"""

import json
import re
from typing import Any

from app.core.jscompat import js_loads, js_truthy
from app.db.params import pg_param


def _decode_uri_component(value: str) -> str:
    if "%" not in value:
        return value
    if re.search(r"%(?![0-9A-Fa-f]{2})", value):
        return value  # URIError in JS: cookie keeps its raw value
    try:
        out = bytearray()
        i = 0
        while i < len(value):
            if value[i] == "%":
                out.append(int(value[i + 1 : i + 3], 16))
                i += 3
            else:
                out.extend(value[i].encode("utf-8"))
                i += 1
        return out.decode("utf-8")
    except UnicodeDecodeError:
        return value


def _skip_ws_forward(text: str, start: int, end: int) -> int:
    while start < end and text[start] in " \t":
        start += 1
    return start


def _skip_ws_backward(text: str, end: int, start: int) -> int:
    while end > start and text[end - 1] in " \t":
        end -= 1
    return end


def parse_cookie_header(header: str) -> dict[str, str]:
    cookies: dict[str, str] = {}
    length = len(header)
    if length < 2:
        return cookies
    index = 0
    while index < length:
        eq = header.find("=", index)
        if eq == -1:
            break
        end = header.find(";", index)
        if end == -1:
            end = length
        elif eq > end:
            index = header.rfind(";", 0, eq) + 1
            continue
        key = header[_skip_ws_forward(header, index, eq) : _skip_ws_backward(header, eq, index)]
        if key not in cookies:
            val_start = _skip_ws_forward(header, eq + 1, end)
            val_end = _skip_ws_backward(header, end, val_start)
            if val_end - val_start >= 2 and header[val_start] == '"' and header[val_end - 1] == '"':
                val_start += 1
                val_end -= 1
            cookies[key] = _decode_uri_component(header[val_start:val_end])
        index = end + 1
    return cookies


def session_id_from(header: str | None, name: str) -> str | None:
    """The session id to look up, or None when the Node app would have
    treated the request as signed out without querying."""
    if not header:
        return None
    raw = parse_cookie_header(header).get(name)
    if raw is None:
        return None
    value: Any = raw
    if raw.startswith("j:"):
        try:
            value = js_loads(raw[2:])
        except (json.JSONDecodeError, ValueError):
            return None
    if not js_truthy(value):
        return None
    return pg_param(value)
