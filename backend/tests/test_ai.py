import json
from collections.abc import Iterator

import httpx
import pytest
import respx

from tests.conftest import ADMIN, Api, make_api, test_settings

GEMINI = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent"
OPENAI = "https://api.openai.com/v1/chat/completions"


@pytest.fixture
def mock_providers() -> Iterator[respx.MockRouter]:
    with respx.mock(assert_all_called=False) as router:
        yield router


@pytest.fixture
def gemini_api() -> Iterator[Api]:
    yield from make_api(test_settings(gemini_api_key="test-key"))


@pytest.fixture
def openai_api() -> Iterator[Api]:
    yield from make_api(test_settings(openai_api_key="test-key"))


def gemini_reply(text: str) -> httpx.Response:
    return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": text}]}}]})


class TestProviders:
    def test_requires_auth(self, api: Api) -> None:
        assert api.anonymous().get("/api/ai/providers").status_code == 401

    def test_lists_only_providers_with_a_server_side_key(self, gemini_api: Api) -> None:
        assert gemini_api.sign_in(ADMIN).get("/api/ai/providers").json() == {"providers": ["gemini"]}

    def test_is_empty_when_nothing_is_configured(self, api: Api) -> None:
        assert api.sign_in(ADMIN).get("/api/ai/providers").json() == {"providers": []}


class TestRephrase:
    def test_requires_auth(self, api: Api) -> None:
        body = {"provider": "gemini", "text": "x", "instruction": "y"}
        assert api.anonymous().post("/api/ai/rephrase", json=body).status_code == 401

    def test_rejects_an_invalid_provider(self, api: Api) -> None:
        res = api.sign_in(ADMIN).post(
            "/api/ai/rephrase", json={"provider": "carrier-pigeon", "text": "x", "instruction": "y"}
        )
        assert res.status_code == 400
        assert res.json() == {"error": "provider must be one of gemini, openai."}

    def test_rejects_empty_text_or_instruction(self, api: Api) -> None:
        agent = api.sign_in(ADMIN)
        for body in (
            {"text": "", "instruction": "y"},
            {"text": "x", "instruction": "  "},
            {"text": 1, "instruction": "y"},
        ):
            res = agent.post("/api/ai/rephrase", json={"provider": "gemini", **body})
            assert res.status_code == 400
            assert res.json() == {"error": "text and instruction are required."}

    def test_reports_501_when_the_server_has_no_key(self, api: Api, mock_providers: respx.MockRouter) -> None:
        route = mock_providers.post(GEMINI)
        res = api.sign_in(ADMIN).post("/api/ai/rephrase", json={"provider": "gemini", "text": "x", "instruction": "y"})
        assert res.status_code == 501
        assert res.json() == {"error": "This server has no gemini API key configured."}
        assert not route.called

    def test_calls_gemini_with_the_server_side_key(self, gemini_api: Api, mock_providers: respx.MockRouter) -> None:
        route = mock_providers.post(GEMINI).mock(return_value=gemini_reply("```markdown\nRephrased.\n```"))
        res = gemini_api.sign_in(ADMIN).post(
            "/api/ai/rephrase", json={"provider": "gemini", "text": "hello", "instruction": "make it formal"}
        )
        assert res.status_code == 200
        assert res.json() == {"text": "Rephrased."}
        request = route.calls.last.request
        assert request.url.params["key"] == "test-key"
        payload = json.loads(request.content)
        assert payload["generationConfig"] == {"temperature": 0.3, "maxOutputTokens": 2048}
        assert "Task: make it formal" in payload["contents"][0]["parts"][0]["text"]

    def test_falls_back_to_the_input_when_the_provider_returns_nothing(
        self, gemini_api: Api, mock_providers: respx.MockRouter
    ) -> None:
        mock_providers.post(GEMINI).mock(return_value=httpx.Response(200, json={"candidates": []}))
        res = gemini_api.sign_in(ADMIN).post(
            "/api/ai/rephrase", json={"provider": "gemini", "text": " hi ", "instruction": "y"}
        )
        assert res.json() == {"text": "hi"}

    def test_calls_openai_never_exposing_the_key(self, openai_api: Api, mock_providers: respx.MockRouter) -> None:
        route = mock_providers.post(OPENAI).mock(
            return_value=httpx.Response(200, json={"choices": [{"message": {"content": "Rephrased by OpenAI."}}]})
        )
        res = openai_api.sign_in(ADMIN).post(
            "/api/ai/rephrase", json={"provider": "openai", "text": "hello", "instruction": "make it formal"}
        )
        assert res.status_code == 200
        assert res.json() == {"text": "Rephrased by OpenAI."}
        assert route.calls.last.request.headers["authorization"] == "Bearer test-key"
        assert "test-key" not in res.text

    def test_surfaces_the_providers_own_error_with_a_502(
        self, gemini_api: Api, mock_providers: respx.MockRouter
    ) -> None:
        mock_providers.post(GEMINI).mock(
            return_value=httpx.Response(429, json={"error": {"message": "Quota exceeded"}})
        )
        res = gemini_api.sign_in(ADMIN).post(
            "/api/ai/rephrase", json={"provider": "gemini", "text": "x", "instruction": "y"}
        )
        assert res.status_code == 502
        assert res.json() == {"error": "Quota exceeded"}

    def test_falls_back_to_a_status_message(self, gemini_api: Api, mock_providers: respx.MockRouter) -> None:
        mock_providers.post(GEMINI).mock(return_value=httpx.Response(503, text="<html>down</html>"))
        res = gemini_api.sign_in(ADMIN).post(
            "/api/ai/rephrase", json={"provider": "gemini", "text": "x", "instruction": "y"}
        )
        assert res.json() == {"error": "Gemini API returned status 503"}

    def test_a_null_error_body_reproduces_the_node_type_error(
        self, gemini_api: Api, mock_providers: respx.MockRouter
    ) -> None:
        mock_providers.post(GEMINI).mock(return_value=httpx.Response(500, text="null"))
        res = gemini_api.sign_in(ADMIN).post(
            "/api/ai/rephrase", json={"provider": "gemini", "text": "x", "instruction": "y"}
        )
        assert res.json() == {"error": "Cannot read properties of null (reading 'error')"}

    def test_502s_on_a_network_failure(self, gemini_api: Api, mock_providers: respx.MockRouter) -> None:
        mock_providers.post(GEMINI).mock(side_effect=httpx.ConnectError("boom"))
        res = gemini_api.sign_in(ADMIN).post(
            "/api/ai/rephrase", json={"provider": "gemini", "text": "x", "instruction": "y"}
        )
        assert res.status_code == 502
        assert res.json() == {"error": "fetch failed"}


class TestGenerateTestCases:
    def test_requires_auth(self, api: Api) -> None:
        res = api.anonymous().post("/api/ai/generate-test-cases", json={"provider": "gemini", "context": "x"})
        assert res.status_code == 401

    def test_rejects_an_invalid_provider_or_missing_context(self, api: Api) -> None:
        agent = api.sign_in(ADMIN)
        assert (
            agent.post("/api/ai/generate-test-cases", json={"provider": "carrier-pigeon", "context": "x"}).status_code
            == 400
        )
        res = agent.post("/api/ai/generate-test-cases", json={"provider": "gemini", "context": ""})
        assert res.status_code == 400
        assert res.json() == {"error": "context is required."}

    def test_reports_501_when_the_server_has_no_key(self, api: Api) -> None:
        res = api.sign_in(ADMIN).post("/api/ai/generate-test-cases", json={"provider": "openai", "context": "spec"})
        assert res.status_code == 501

    def test_returns_the_gemini_suite_as_is(self, gemini_api: Api, mock_providers: respx.MockRouter) -> None:
        suite = {
            "suiteTitle": "Firmware Suite",
            "suiteDescription": "Desc",
            "module": "Firmware Core",
            "testCases": [{"customId": "TC-1", "title": "Boots"}],
        }
        route = mock_providers.post(GEMINI).mock(return_value=gemini_reply(json.dumps(suite)))
        res = gemini_api.sign_in(ADMIN).post(
            "/api/ai/generate-test-cases", json={"provider": "gemini", "context": "spec text"}
        )
        assert res.status_code == 200
        assert res.json() == suite
        payload = json.loads(route.calls.last.request.content)
        assert payload["generationConfig"] == {"temperature": 0.2, "responseMimeType": "application/json"}
        assert '"robotCode": "*** Settings ***\\n..."' in payload["contents"][0]["parts"][0]["text"]

    def test_returns_the_openai_suite(self, openai_api: Api, mock_providers: respx.MockRouter) -> None:
        suite = {"suiteTitle": "API Suite", "suiteDescription": "Desc", "module": "REST API", "testCases": []}
        route = mock_providers.post(OPENAI).mock(
            return_value=httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(suite)}}]})
        )
        res = openai_api.sign_in(ADMIN).post(
            "/api/ai/generate-test-cases", json={"provider": "openai", "context": "spec"}
        )
        assert res.status_code == 200
        assert res.json() == suite
        assert json.loads(route.calls.last.request.content)["response_format"] == {"type": "json_object"}

    def test_502s_when_the_provider_reply_is_not_json(self, gemini_api: Api, mock_providers: respx.MockRouter) -> None:
        mock_providers.post(GEMINI).mock(return_value=gemini_reply("not json"))
        res = gemini_api.sign_in(ADMIN).post(
            "/api/ai/generate-test-cases", json={"provider": "gemini", "context": "spec"}
        )
        assert res.status_code == 502
        assert res.json() == {"error": "Unexpected token 'o', \"not json\" is not valid JSON"}
