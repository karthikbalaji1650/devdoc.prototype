import pytest

from app.core.cookies import parse_cookie_header
from app.core.jscompat import js_dumps, js_float_str, js_loads, js_opt, js_trim, js_truthy
from app.db.params import pg_param


@pytest.mark.parametrize(
    ("value", "expected"),
    [(None, False), (False, False), (0, False), (0.0, False), ("", False), ([], True), ({}, True), ("0", True)],
)
def test_truthiness(value: object, expected: bool) -> None:
    assert js_truthy(value) is expected


def test_trim_strips_the_javascript_whitespace_set() -> None:
    assert js_trim("\ufeff\u00a0 x \u3000") == "x"


@pytest.mark.parametrize(
    ("source", "expected"),
    [
        ("1.0", "1"),
        ("-0", "0"),
        ("1e20", "100000000000000000000"),
        ("1e21", "1e+21"),
        ("12345678901234567890", "12345678901234567000"),
        ("0.00001", "0.00001"),
        ("1e-7", "1e-7"),
        ("0.1", "0.1"),
        ('{"b":1,"2":2,"1":3}', '{"1":3,"2":2,"b":1}'),
        ('{"a":1,"a":2}', '{"a":2}'),
        ('"\u2028"', '"\u2028"'),
    ],
)
def test_json_round_trips_like_json_parse_then_stringify(source: str, expected: str) -> None:
    assert js_dumps(js_loads(source)) == expected


def test_rejects_non_json_constants() -> None:
    with pytest.raises(ValueError):
        js_loads("NaN")


def test_float_strings() -> None:
    assert js_float_str(1.5e-7) == "1.5e-7"
    assert js_float_str(2.5e-5) == "0.000025"


def test_optional_chaining() -> None:
    data = {"a": [{"b": "x"}]}
    assert js_opt(data, "a", 0, "b") == "x"
    assert js_opt(data, "a", 5, "b") is None
    assert js_opt("str", "a") is None


def test_pg_param_matches_node_postgres() -> None:
    assert pg_param(5) == "5"
    assert pg_param(True) == "true"
    assert pg_param({"a": 1.0}) == '{"a":1}'
    assert pg_param(["a", None, ['b"']]) == '{"a",NULL,{"b\\""}}'


def test_cookie_parser_rules() -> None:
    assert parse_cookie_header('a=1; a=2; b="q"; c=%E2%9C%93; d=%zz') == {"a": "1", "b": "q", "c": "✓", "d": "%zz"}
