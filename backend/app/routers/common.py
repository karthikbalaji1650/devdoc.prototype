from collections.abc import Callable
from typing import Any

from fastapi import APIRouter


def get_route(router: APIRouter, path: str, **kwargs: Any) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """A GET route that also answers HEAD, as every Express GET route did.
    HEAD stays out of the OpenAPI document (one operation per path)."""

    def decorator(endpoint: Callable[..., Any]) -> Callable[..., Any]:
        router.head(path, include_in_schema=False)(endpoint)
        return router.get(path, **kwargs)(endpoint)

    return decorator
