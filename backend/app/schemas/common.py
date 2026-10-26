from pydantic import BaseModel, ConfigDict


class WireModel(BaseModel):
    """Base for request/response schemas. These describe the frozen wire
    contract for /openapi.json; field names are the exact JSON keys
    (camelCase where the Node API used camelCase)."""

    model_config = ConfigDict(extra="allow")


class ErrorResponse(WireModel):
    error: str


class OkResponse(WireModel):
    ok: bool
