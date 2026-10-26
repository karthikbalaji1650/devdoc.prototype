"""Parity: the same request sequence against the Node API and FastAPI.

Both servers must be running against *separate* databases seeded from
init.sql, with NODE_ENV=production on Node and the same CORS_ORIGINS:

    NODE_BASE_URL=http://localhost:4000 FASTAPI_BASE_URL=http://localhost:8000 \
        uv run pytest tests/parity -m parity

The Node API was removed at cutover; to re-run this, check out the last
commit that still has server/ (see docs/migration-report.md) and start it.

Compared per request: status code, the headers listed in COMPARED_HEADERS,
and the body (raw text for HTML; for JSON, the parsed value *including key
order and number spelling*). Normalized, because they are volatile by
design: session ids and Expires dates in Set-Cookie, `updatedAt`,
`jobId`, `executedAt`, the mock's randomized per-test status /
elapsedTimeMs / failureMessage and the pass/fail counts derived from them,
and RateLimit-Reset / Retry-After (compared within one second).
"""

import json
import os
import re
import time
from dataclasses import dataclass, field
from typing import Any

import httpx
import pytest

pytestmark = pytest.mark.parity

NODE = os.environ.get("NODE_BASE_URL")
FASTAPI = os.environ.get("FASTAPI_BASE_URL")
ORIGIN = os.environ.get("PARITY_ORIGIN", "http://localhost:5173")
PASSWORD = "devdoc-demo"
EMAILS = {
    "admin": "mani.thangavel@sanmina.com",
    "author": "vaishnavi.aasaithambi@sanmina.com",
    "other": "sahith.pattu@sanmina.com",
}
COMPARED_HEADERS = (
    "content-type",
    "content-length",
    "set-cookie",
    "vary",
    "access-control-allow-origin",
    "access-control-allow-credentials",
    "access-control-allow-methods",
    "access-control-allow-headers",
    "content-security-policy",
    "x-content-type-options",
    "ratelimit-policy",
    "ratelimit-limit",
    "ratelimit-remaining",
)
FUZZY_SECONDS_HEADERS = ("ratelimit-reset", "retry-after")
VOLATILE_KEYS = {"updatedAt", "jobId", "executedAt", "elapsedTimeMs"}
RANDOMLY_PRESENT_KEYS = {"failureMessage"}  # only on a (random) FAIL


@dataclass
class Server:
    base: str
    cookies: dict[str, str] = field(default_factory=dict)

    def send(self, persona: str | None, method: str, path: str, **kwargs: Any) -> httpx.Response:
        headers = {"Origin": ORIGIN, **kwargs.pop("headers", {})}
        if persona and persona in self.cookies:
            headers["Cookie"] = f"devdoc_sid={self.cookies[persona]}"
        return httpx.request(method, self.base + path, headers=headers, timeout=30, **kwargs)


def _normalize_json(value: Any, parent_key: str | None = None) -> Any:
    if isinstance(value, dict):
        out = {}
        for key, item in value.items():
            if key in RANDOMLY_PRESENT_KEYS:
                continue
            if key in VOLATILE_KEYS:
                out[key] = "<volatile>"
            elif key == "status" and item in ("PASS", "FAIL"):
                out[key] = "<random-status>"
            elif parent_key == "summary" and key in ("passed", "failed"):
                out[key] = "<random-count>"
            else:
                out[key] = _normalize_json(item, key)
        return out
    if isinstance(value, list):
        return [_normalize_json(v, parent_key) for v in value]
    return value


def _ordered_json(text: str) -> str:
    # Keeps key order and int-vs-float spelling, so "1" vs "1.0" differs.
    return json.dumps(_normalize_json(json.loads(text)), separators=(",", ":"), ensure_ascii=False)


def _normalize_cookie(value: str) -> str:
    value = re.sub(r"devdoc_sid=[0-9a-f]{64}", "devdoc_sid=<session>", value)
    return re.sub(r"Expires=[^;]+GMT", lambda m: m.group(0) if "1970" in m.group(0) else "Expires=<date>", value)


def _snapshot(res: httpx.Response) -> dict[str, Any]:
    headers = {}
    for name in COMPARED_HEADERS:
        if name in res.headers:
            value = res.headers[name]
            headers[name] = _normalize_cookie(value) if name == "set-cookie" else value
    if "application/json" in res.headers.get("content-type", "") and res.text:
        body = _ordered_json(res.text)
        headers.pop("content-length", None)  # differs only through normalized fields
    else:
        body = res.text
    return {"status": res.status_code, "headers": headers, "body": body}


class Pair:
    def __init__(self) -> None:
        self.node = Server(NODE or "")
        self.py = Server(FASTAPI or "")
        self.checked = 0

    def check(
        self, persona: str | None, method: str, path: str, **kwargs: Any
    ) -> tuple[httpx.Response, httpx.Response]:
        a = self.node.send(persona, method, path, **dict(kwargs))
        b = self.py.send(persona, method, path, **dict(kwargs))
        sa, sb = _snapshot(a), _snapshot(b)
        assert sa == sb, f"{method} {path} as {persona}:\nnode={sa}\npy  ={sb}"
        for name in FUZZY_SECONDS_HEADERS:
            assert (name in a.headers) == (name in b.headers), name
            if name in a.headers:
                assert abs(int(a.headers[name]) - int(b.headers[name])) <= 1, name
        self.checked += 1
        return a, b

    def sign_in(self, persona: str) -> None:
        a, b = self.check(None, "POST", "/api/auth/login", json={"email": EMAILS[persona], "password": PASSWORD})
        self.node.cookies[persona] = a.cookies["devdoc_sid"]
        self.py.cookies[persona] = b.cookies["devdoc_sid"]


@pytest.fixture(scope="module")
def pair() -> Pair:
    if not (NODE and FASTAPI):
        pytest.skip("NODE_BASE_URL and FASTAPI_BASE_URL must both be set")
    return Pair()


def doc(doc_id: str, **overrides: Any) -> dict[str, Any]:
    metadata = {
        "id": doc_id,
        "title": "Firmware Report",
        "docNumber": "FW-1",
        "author": "Someone Else",
        "date": "2026-09-28",
        "version": "1.0",
        "classification": "INTERNAL ONLY",
        "status": "DRAFT",
        "templateType": "technical-analysis",
        "tags": ["a", "b"],
    }
    return {
        "metadata": {**metadata, **overrides},
        "sections": [{"id": "s1", "title": "Purpose", "level": 1, "type": "richText", "content": "x"}],
    }


JSON = {"Content-Type": "application/json"}


def test_health_and_routing(pair: Pair) -> None:
    pair.check(None, "GET", "/api/health")
    pair.check(None, "GET", "/api/health/")
    pair.check(None, "GET", "/API/HEALTH")
    pair.check(None, "HEAD", "/api/health")
    pair.check(None, "GET", "/api/health//")
    pair.check(None, "POST", "/api/health")
    pair.check(None, "GET", "/api/nope?x=1")
    pair.check(None, "GET", "/api/n%20o%3Cpe%3E")
    pair.check(None, "GET", "/")


def test_cors(pair: Pair) -> None:
    pair.check(
        None,
        "OPTIONS",
        "/api/documents/d1",
        headers={"Access-Control-Request-Method": "PUT", "Access-Control-Request-Headers": "content-type"},
    )
    pair.check(None, "OPTIONS", "/api/auth/login")
    pair.check(None, "GET", "/api/health", headers={"Origin": "http://evil.example"})


def test_body_parsing(pair: Pair) -> None:
    pair.check(None, "POST", "/api/auth/login", content=b'{"email":', headers=JSON)
    pair.check(None, "POST", "/api/auth/login", content=b'"str"', headers=JSON)
    pair.check(None, "POST", "/api/auth/login", content=b"", headers=JSON)
    pair.check(None, "POST", "/api/auth/login", content=b"[]", headers=JSON)
    pair.check(
        None, "POST", "/api/auth/login", content=b"{}", headers={"Content-Type": "application/json; charset=latin1"}
    )
    pair.check(None, "POST", "/api/auth/login", content=b"email=x", headers={"Content-Type": "text/plain"})
    pair.check(None, "POST", "/api/auth/login", content=b'{"x":"' + b"a" * (5 * 1024 * 1024) + b'"}', headers=JSON)


def test_auth(pair: Pair) -> None:
    pair.check(None, "GET", "/api/auth/me")
    pair.check(None, "GET", "/api/auth/me", headers={"Cookie": "devdoc_sid=not-a-session"})
    pair.check(None, "POST", "/api/auth/login", json={"password": "x"})
    pair.check(None, "POST", "/api/auth/login", json={"email": 5, "password": "x"})
    pair.check(None, "POST", "/api/auth/login", json={"email": EMAILS["admin"], "password": "wrong"})
    pair.check(None, "POST", "/api/auth/login", json={"email": "nobody@example.com", "password": "wrong"})
    for persona in EMAILS:
        pair.sign_in(persona)
    pair.check("admin", "GET", "/api/auth/me")
    pair.check("author", "GET", "/api/auth/ME/")
    pair.check(None, "POST", "/api/auth/login", json={"email": f"  {EMAILS['author'].upper()} ", "password": PASSWORD})
    pair.check(None, "POST", "/api/auth/logout")
    pair.check(None, "GET", "/api/auth/unknown")


def test_documents(pair: Pair) -> None:
    for method, path in (
        ("GET", "/api/documents"),
        ("GET", "/api/documents/x"),
        ("PUT", "/api/documents/x"),
        ("DELETE", "/api/documents/x"),
        ("DELETE", "/api/documents/x/purge"),
        ("POST", "/api/documents/x"),
        ("GET", "/api/documents/x/y/z"),
    ):
        pair.check(None, method, path)
    pair.check("author", "POST", "/api/documents/x")
    pair.check("author", "GET", "/api/documents/x/y/z")

    pair.check("author", "PUT", "/api/documents/p-1", json=doc("ignored"))
    pair.check("author", "PUT", "/api/documents/p-2", json=doc("p-2", status="APPROVED"))
    pair.check(
        "author",
        "PUT",
        "/api/documents/p-3",
        content=b'{"metadata":{"title":"t","docNumber":"1","status":"IN_REVIEW","n":1.0,"big":1e20,'
        b'"2":"b","1":"a"},"sections":[{"x":0.5,"y":-0}],"extra":true}',
        headers=JSON,
    )
    pair.check("author", "PUT", "/api/documents/p-1", json={"title": "not a document"})
    pair.check("author", "PUT", "/api/documents/p-1", json=doc("p-1", status="MADE_UP"))
    pair.check("author", "PUT", "/api/documents/p-1", json=doc("p-1", status=[]))
    pair.check("other", "PUT", "/api/documents/p-1", json=doc("p-1", title="Hijacked"))
    pair.check("admin", "PUT", "/api/documents/p-1", json=doc("p-1", title="Admin edit", author=""))

    pair.check("author", "GET", "/api/documents")
    pair.check("admin", "GET", "/api/documents")
    pair.check("other", "GET", "/api/documents/p-2")
    pair.check("author", "GET", "/api/documents/p-3")
    pair.check("author", "GET", "/api/Documents/p-1/")
    pair.check("author", "GET", "/api/documents/P-1")
    pair.check("author", "HEAD", "/api/documents/p-1")

    pair.check("other", "DELETE", "/api/documents/p-1")
    pair.check("author", "DELETE", "/api/documents/p-1")
    pair.check("author", "DELETE", "/api/documents/p-1")
    pair.check("author", "GET", "/api/documents/p-1")
    pair.check("other", "DELETE", "/api/documents/p-1/purge")
    pair.check("author", "DELETE", "/api/documents/p-1/purge")
    pair.check("author", "DELETE", "/api/documents/p-1/purge")
    pair.check("admin", "DELETE", "/api/documents/p-2/purge")
    pair.check("author", "DELETE", "/api/documents/never/purge")


def test_ai_without_server_keys(pair: Pair) -> None:
    pair.check(None, "GET", "/api/ai/providers")
    pair.check("admin", "GET", "/api/ai/providers")
    pair.check(
        "admin", "POST", "/api/ai/rephrase", json={"provider": "carrier-pigeon", "text": "x", "instruction": "y"}
    )
    pair.check("admin", "POST", "/api/ai/rephrase", json={"provider": "gemini", "text": " ", "instruction": "y"})
    pair.check("admin", "POST", "/api/ai/rephrase", json={"provider": "gemini", "text": "x", "instruction": "y"})
    pair.check("admin", "POST", "/api/ai/generate-test-cases", json={"provider": "openai"})
    pair.check("admin", "POST", "/api/ai/generate-test-cases", json={"provider": "openai", "context": "spec"})
    pair.check("admin", "GET", "/api/ai/unknown")


def test_test_exec(pair: Pair) -> None:
    script = "*** Settings ***\nDocumentation  S\n\n*** Test Cases ***\nTC-001_Drift_Check\n    Log  hi\nTC_2 Boot\n    Log  x\n"
    pair.check(None, "POST", "/api/test-exec/scripts", json={})
    pair.check("admin", "POST", "/api/test-exec/scripts", json={"suiteTitle": "S", "robotCode": "x"})
    pair.check("admin", "POST", "/api/test-exec/scripts", json={"suiteId": "s1", "robotCode": "x"})
    pair.check("admin", "POST", "/api/test-exec/scripts", json={"suiteId": "s1", "suiteTitle": "S"})
    pair.check("admin", "POST", "/api/test-exec/runs", json={"suiteId": "never-pushed"})
    pair.check(
        "admin", "POST", "/api/test-exec/scripts", json={"suiteId": "s1", "suiteTitle": "RTC", "robotCode": script}
    )
    node_run, py_run = pair.check("admin", "POST", "/api/test-exec/runs", json={"suiteId": "s1"})
    pair.check("admin", "GET", "/api/test-exec/runs/job-nonexistent")

    node_job, py_job = node_run.json()["jobId"], py_run.json()["jobId"]
    assert re.fullmatch(r"job-\d{13}-[0-9a-z]{1,6}", node_job) and re.fullmatch(r"job-\d{13}-[0-9a-z]{6}", py_job)
    running = [
        pair.node.send("admin", "GET", f"/api/test-exec/runs/{node_job}"),
        pair.py.send("admin", "GET", f"/api/test-exec/runs/{py_job}"),
    ]
    assert _snapshot(running[0]) == _snapshot(running[1])
    time.sleep(0.6)
    done = [
        pair.node.send("admin", "GET", f"/api/test-exec/runs/{node_job}"),
        pair.py.send("admin", "GET", f"/api/test-exec/runs/{py_job}"),
    ]
    assert _snapshot(done[0]) == _snapshot(done[1]), (done[0].text, done[1].text)


def test_login_rate_limit_runs_last(pair: Pair) -> None:
    # Earlier 400/401 logins already spent part of the shared per-IP budget
    # (successes were refunded); both servers must flip to 429 on the same
    # request. Run last: it locks logins from this IP for 15 minutes.
    for _ in range(9):
        pair.check(None, "POST", "/api/auth/login", json={"email": EMAILS["other"], "password": "wrong"})
    pair.check(None, "POST", "/api/auth/login", json={"email": EMAILS["other"], "password": PASSWORD})
    assert pair.checked > 80


def test_known_divergence_node_crashes_on_a_db_error(pair: Pair) -> None:
    """Replicated-bug exception, run last because it kills the Node process:
    a PUT missing a NOT NULL column (array metadata spreads to index keys,
    so docNumber/title are null) was an unhandled promise rejection in
    Express 4, which terminates Node. FastAPI answers Express's 500 page."""
    body = {"metadata": ["a", "b"], "sections": []}
    with pytest.raises(httpx.TransportError):
        pair.node.send("author", "PUT", "/api/documents/p-4", json=body)
    res = pair.py.send("author", "PUT", "/api/documents/p-4", json=body)
    assert res.status_code == 500
    assert "<pre>Internal Server Error</pre>" in res.text
