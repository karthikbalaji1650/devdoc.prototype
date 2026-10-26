"""JavaScript semantics the Node API relied on implicitly.

The API contract is frozen at whatever the Express app actually did, and
several of its checks and outputs lean on JS-specific behavior: `[]` and
`{}` are truthy, `trim()` strips a wider whitespace set than Python's
`strip()`, numbers are IEEE doubles (`1.0` round-trips as `1`), and
`JSON.stringify` puts integer-like object keys first. Everything here
exists so the Python services can say what the Node code said without
re-deriving those rules inline.
"""

import json
import math
import re
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

# ECMAScript WhiteSpace + LineTerminator: what String.prototype.trim()
# and the regex class \s match.
JS_WHITESPACE = (
    "\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a"
    "\u2028\u2029\u202f\u205f\u3000\ufeff"
)
JS_WS_CLASS = "[" + re.escape(JS_WHITESPACE) + "]"

_ARRAY_INDEX = re.compile(r"^(0|[1-9][0-9]*)$")
_MAX_ARRAY_INDEX = 2**32 - 2


class JsError(Exception):
    """An error the Node code would have thrown, carrying its message."""


def js_trim(value: str) -> str:
    return value.strip(JS_WHITESPACE)


def js_truthy(value: Any) -> bool:
    if value is None or value is False:
        return False
    if isinstance(value, bool):
        return True
    if isinstance(value, int | float):
        return not (value == 0 or (isinstance(value, float) and math.isnan(value)))
    if isinstance(value, str):
        return value != ""
    return True  # objects and arrays, even empty ones


def is_nonblank_string(value: Any) -> bool:
    """`typeof v === 'string' && v.trim()` - the API's usual "required" check."""
    return isinstance(value, str) and js_trim(value) != ""


def _is_array_index(key: str) -> bool:
    return bool(_ARRAY_INDEX.match(key)) and int(key) <= _MAX_ARRAY_INDEX


def _js_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    # A JS object keeps a duplicate key at its first position with the
    # last value (same as dict()), but enumerates integer-like keys first,
    # ascending, before every other key in insertion order.
    obj = dict(pairs)
    index_keys = [k for k in obj if _is_array_index(k)]
    if not index_keys:
        return obj
    ordered = {k: obj[k] for k in sorted(index_keys, key=int)}
    ordered.update((k, v) for k, v in obj.items() if not _is_array_index(k))
    return ordered


def _js_float(text: str) -> int | float | None:
    value = float(text)
    if math.isinf(value):
        return None  # JSON.stringify(Infinity) is "null"
    if value.is_integer() and abs(value) < 1e21:
        # A double that JS prints without a fraction or exponent: go via the
        # shortest round-trip repr so 1e20 prints as JS would, digit for digit.
        return int(Decimal(repr(value)))
    return value


def _js_int(text: str) -> int | float | None:
    value = int(text)
    if abs(value) <= 2**53:
        return value
    return _js_float(text)  # beyond 2^53 JS has already lost precision


def _reject_constant(name: str) -> Any:
    raise ValueError(f"{name} is not valid JSON")


def js_loads(text: str | bytes) -> Any:
    """JSON.parse: no NaN/Infinity literals, JS number precision, JS key order."""
    return json.loads(
        text,
        object_pairs_hook=_js_object,
        parse_float=_js_float,
        parse_int=_js_int,
        parse_constant=_reject_constant,
    )


def js_float_str(value: float) -> str:
    """Number.prototype.toString (JSON.stringify's spelling of a double)."""
    if math.isnan(value) or math.isinf(value):
        return "null"
    if value.is_integer() and abs(value) < 1e21:
        return str(int(Decimal(repr(value))))
    text = repr(value)
    if "e" not in text:
        return text
    mantissa, exp_text = text.split("e")
    exponent = int(exp_text)
    if -7 < exponent < 21:
        return format(Decimal(text), "f")
    return f"{mantissa}e{'+' if exponent > 0 else '-'}{abs(exponent)}"


def js_dumps(value: Any) -> str:
    """JSON.stringify(value) with no spacing, as res.json() sent it."""
    encoder = json.JSONEncoder(ensure_ascii=False, separators=(",", ":"))
    floatstr = lambda f: js_float_str(f)  # noqa: E731 - signature _make_iterencode expects
    iterencode = json.encoder._make_iterencode(  # type: ignore[attr-defined]
        {},
        encoder.default,
        json.encoder.py_encode_basestring,
        None,
        floatstr,
        ":",
        ",",
        False,
        False,
        True,
    )
    return "".join(iterencode(value, 0))


def js_string(value: Any) -> str:
    """String(value)."""
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        return js_float_str(value)
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return ",".join("" if v is None else js_string(v) for v in value)
    return "[object Object]"


def js_spread(value: Any) -> dict[str, Any]:
    """`{...value}` for whatever JSON value it is."""
    if isinstance(value, dict):
        return dict(value)
    if isinstance(value, list):
        return {str(i): v for i, v in enumerate(value)}
    if isinstance(value, str):
        return {str(i): ch for i, ch in enumerate(value)}
    return {}


def js_prop(obj: Any, key: str) -> Any:
    """`obj.key` - throws on null like V8, otherwise never fails."""
    if obj is None:
        raise JsError(f"Cannot read properties of null (reading '{key}')")
    return js_opt(obj, key)


def js_opt(obj: Any, *path: str | int) -> Any:
    """`obj?.a?.[0]?.b` - undefined (None) as soon as any step is missing."""
    current = obj
    for key in path:
        if current is None:
            return None
        if isinstance(current, dict):
            current = current.get(str(key))
        elif isinstance(current, list | str) and isinstance(key, int):
            current = current[key] if 0 <= key < len(current) else None
        else:
            return None
    return current


def js_iso_date(moment: datetime) -> str:
    """Date.prototype.toISOString (what JSON.stringify(date) emits): UTC,
    millisecond precision (truncated, as node-postgres parsed it), Z."""
    utc = moment.astimezone(UTC)
    return utc.strftime("%Y-%m-%dT%H:%M:%S.") + f"{utc.microsecond // 1000:03d}Z"
