"""Express behaviors the contract inherits that FastAPI does differently
by default: error pages, routing rules, body parsing, CORS, headers."""

import gzip
from collections.abc import Iterator

import pytest

from tests.conftest import ADMIN, Api, make_api, test_settings

ORIGIN = "http://localhost:5173"


@pytest.fixture
def cors_api() -> Iterator[Api]:
    yield from make_api(test_settings(cors_origins=f"{ORIGIN}, http://other.example"))


def test_health(api: Api) -> None:
    res = api.client.get("/api/health")
    assert res.status_code == 200
    assert res.text == '{"ok":true}'
    assert res.headers["content-type"] == "application/json; charset=utf-8"


def test_unknown_route_is_expresss_html_404(api: Api) -> None:
    res = api.client.get("/api/nope?x=1")
    assert res.status_code == 404
    assert res.headers["content-type"] == "text/html; charset=utf-8"
    assert res.headers["content-security-policy"] == "default-src 'none'"
    assert res.headers["x-content-type-options"] == "nosniff"
    assert res.text == (
        '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>Error</title>\n'
        "</head>\n<body>\n<pre>Cannot GET /api/nope</pre>\n</body>\n</html>\n"
    )


def test_wrong_method_is_a_404_not_a_405(api: Api) -> None:
    res = api.client.post("/api/health")
    assert res.status_code == 404
    assert "Cannot POST /api/health" in res.text


def test_routes_match_case_insensitively_and_with_a_trailing_slash(api: Api) -> None:
    assert api.client.get("/api/health/").status_code == 200
    assert api.client.get("/API/Health").status_code == 200
    assert api.client.get("/api/health//").status_code == 404
    assert api.client.get("/api/auth/ME/").json() == {"error": "Not signed in."}


def test_path_parameters_keep_their_case(api: Api) -> None:
    agent = api.sign_in(ADMIN)
    body = {"metadata": {"title": "t", "docNumber": "1", "status": "DRAFT"}, "sections": []}
    assert agent.put("/API/Documents/MiXeD/", json=body).json()["document"]["metadata"]["id"] == "MiXeD"
    assert agent.get("/api/documents/mixed").status_code == 404


def test_head_is_served_for_get_routes(api: Api) -> None:
    res = api.client.head("/api/health")
    assert res.status_code == 200
    assert res.content == b""


def test_malformed_json_is_expresss_400_page(api: Api) -> None:
    res = api.client.post("/api/auth/login", content=b'{"email":', headers={"Content-Type": "application/json"})
    assert res.status_code == 400
    assert "<pre>Bad Request</pre>" in res.text


def test_strict_json_rejects_a_top_level_primitive(api: Api) -> None:
    res = api.client.post("/api/auth/login", content=b'"str"', headers={"Content-Type": "application/json"})
    assert res.status_code == 400
    assert "<pre>Bad Request</pre>" in res.text


def test_body_over_5mb_is_413(api: Api) -> None:
    big = b'{"x":"' + b"a" * (5 * 1024 * 1024) + b'"}'
    res = api.client.post("/api/auth/login", content=big, headers={"Content-Type": "application/json"})
    assert res.status_code == 413
    assert "<pre>Payload Too Large</pre>" in res.text


def test_unsupported_charset_is_415(api: Api) -> None:
    res = api.client.post(
        "/api/auth/login", content=b"{}", headers={"Content-Type": "application/json; charset=latin1"}
    )
    assert res.status_code == 415


def test_gzip_bodies_are_inflated(api: Api) -> None:
    body = gzip.compress(b'{"email":"%s","password":"%s"}' % (ADMIN.email.encode(), ADMIN.password.encode()))
    res = api.client.post(
        "/api/auth/login", content=body, headers={"Content-Type": "application/json", "Content-Encoding": "gzip"}
    )
    assert res.status_code == 200


def test_no_fastapi_error_shapes_leak(api: Api) -> None:
    for res in (api.client.get("/api/nope"), api.client.post("/api/test-exec/runs")):
        assert "detail" not in res.text


def test_no_cors_headers_unless_configured(api: Api) -> None:
    res = api.client.get("/api/health", headers={"Origin": ORIGIN})
    assert "access-control-allow-origin" not in res.headers


class TestCors:
    def test_allowed_origin_is_reflected_with_credentials(self, cors_api: Api) -> None:
        res = cors_api.client.get("/api/health", headers={"Origin": ORIGIN})
        assert res.headers["access-control-allow-origin"] == ORIGIN
        assert res.headers["access-control-allow-credentials"] == "true"
        assert res.headers["vary"] == "Origin"

    def test_other_origins_get_credentials_but_no_allow_origin(self, cors_api: Api) -> None:
        res = cors_api.client.get("/api/health", headers={"Origin": "http://evil.example"})
        assert res.status_code == 200
        assert "access-control-allow-origin" not in res.headers
        assert res.headers["access-control-allow-credentials"] == "true"

    def test_preflight_is_204_reflecting_requested_headers(self, cors_api: Api) -> None:
        res = cors_api.client.options(
            "/api/documents/d1",
            headers={
                "Origin": ORIGIN,
                "Access-Control-Request-Method": "PUT",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        assert res.status_code == 204
        assert res.headers["access-control-allow-methods"] == "GET,HEAD,PUT,PATCH,POST,DELETE"
        assert res.headers["access-control-allow-headers"] == "content-type"
        assert res.headers["vary"] == "Origin, Access-Control-Request-Headers"
        assert res.headers["content-length"] == "0"

    def test_error_responses_carry_cors_headers(self, cors_api: Api) -> None:
        res = cors_api.client.get("/api/documents", headers={"Origin": ORIGIN})
        assert res.status_code == 401
        assert res.headers["access-control-allow-origin"] == ORIGIN

    def test_body_parse_errors_carry_none_as_express_parsed_before_cors(self, cors_api: Api) -> None:
        res = cors_api.client.post(
            "/api/auth/login", content=b"{", headers={"Origin": ORIGIN, "Content-Type": "application/json"}
        )
        assert res.status_code == 400
        assert "access-control-allow-origin" not in res.headers


def test_openapi_documents_every_route_with_camel_case_fields(api: Api) -> None:
    schema = api.client.get("/openapi.json").json()
    assert set(schema["paths"]) == {
        "/api/health",
        "/api/auth/login",
        "/api/auth/logout",
        "/api/auth/me",
        "/api/documents",
        "/api/documents/{document_id}",
        "/api/documents/{document_id}/purge",
        "/api/ai/providers",
        "/api/ai/rephrase",
        "/api/ai/generate-test-cases",
        "/api/test-exec/scripts",
        "/api/test-exec/runs",
        "/api/test-exec/runs/{job_id}",
    }
    components = schema["components"]["schemas"]
    assert "avatarBg" in components["SessionUser"]["properties"]
    assert "_schema" in components["RobotResultsJson"]["properties"]
    assert "docNumber" in components["DocumentMetadata"]["properties"]
