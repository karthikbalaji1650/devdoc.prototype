"""OpenAPI request-body documentation for hand-validated routes.

Routes parse and validate bodies themselves (to keep the Node API's exact
400 messages), so FastAPI can't infer request schemas. `request_body`
declares one for /openapi.json, and `install_openapi` adds the referenced
models to the document's components.
"""

from typing import Any

from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi
from pydantic import BaseModel
from pydantic.json_schema import models_json_schema

_REF = "#/components/schemas/{model}"
_request_models: dict[str, type[BaseModel]] = {}


def request_body(model: type[BaseModel]) -> dict[str, Any]:
    _request_models[model.__name__] = model
    return {
        "requestBody": {
            "required": True,
            "content": {"application/json": {"schema": {"$ref": _REF.format(model=model.__name__)}}},
        }
    }


def install_openapi(app: FastAPI) -> None:
    def openapi() -> dict[str, Any]:
        if app.openapi_schema:
            return app.openapi_schema
        schema = get_openapi(title=app.title, version=app.version, description=app.description, routes=app.routes)
        _, defs = models_json_schema([(m, "validation") for m in _request_models.values()], ref_template=_REF)
        schema.setdefault("components", {}).setdefault("schemas", {}).update(defs.get("$defs", {}))
        app.openapi_schema = schema
        return schema

    app.openapi = openapi  # type: ignore[method-assign]
