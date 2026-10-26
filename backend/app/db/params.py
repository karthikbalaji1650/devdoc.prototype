"""Query parameter conversion as node-postgres did it (`prepareValue`).

The Node API passed raw request values straight into SQL parameters, so
whatever type a client sent was coerced by node-postgres: numbers and
booleans to their JS string form, objects to JSON, arrays to a Postgres
array literal. Converting the same way keeps stored values identical.
"""

from typing import Any

from app.core.jscompat import js_dumps, js_float_str


def pg_param(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, str):
        return value
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        return js_float_str(value)
    if isinstance(value, list):
        return _array_literal(value)
    return js_dumps(value)


def _array_literal(values: list[Any]) -> str:
    parts: list[str] = []
    for item in values:
        if item is None:
            parts.append("NULL")
        elif isinstance(item, list):
            parts.append(_array_literal(item))
        else:
            text = pg_param(item) or ""
            parts.append('"' + text.replace("\\", "\\\\").replace('"', '\\"') + '"')
    return "{" + ",".join(parts) + "}"
