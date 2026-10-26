"""Express's default route matching, in front of FastAPI's router.

Express routes are case-insensitive and accept one optional trailing
slash (`/api/health/` and `/API/Health` both reach the health check);
Starlette matches exactly. This middleware rewrites a request path that
Express would have matched onto the canonical route template before
routing, keeping path parameter values exactly as sent.
"""

import re
from collections.abc import Iterable

from fastapi import APIRouter
from fastapi.routing import APIRoute
from starlette.types import ASGIApp, Receive, Scope, Send

_PARAM = re.compile(r"^\{[^}]+\}$")


def route_templates(routers: Iterable[APIRouter]) -> list[str]:
    seen: dict[str, None] = {}
    for router in routers:
        for route in router.routes:
            if isinstance(route, APIRoute):
                seen.setdefault(route.path, None)
    return list(seen)


class _Template:
    def __init__(self, template: str) -> None:
        self.segments = template.strip("/").split("/")
        pattern = "/".join("([^/]+)" if _PARAM.match(s) else re.escape(s) for s in self.segments)
        self.regex = re.compile(f"^/{pattern}/?$", re.IGNORECASE | re.ASCII)

    def canonical(self, path: str) -> str | None:
        match = self.regex.match(path)
        if match is None:
            return None
        values = iter(match.groups())
        return "/" + "/".join(next(values) if _PARAM.match(s) else s for s in self.segments)


class ExpressPathMiddleware:
    def __init__(self, app: ASGIApp, templates: list[str]) -> None:
        self.app = app
        self.templates = [_Template(t) for t in templates]

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            path = scope["path"]
            for template in self.templates:
                canonical = template.canonical(path)
                if canonical is not None:
                    if canonical != path:
                        scope = {**scope, "path": canonical}
                    break
        await self.app(scope, receive, send)
