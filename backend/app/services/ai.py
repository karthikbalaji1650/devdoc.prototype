"""Proxies AI requests to Gemini / OpenAI with keys that live only in this
process's environment, never in the browser. The frontend's own
per-browser key path (src/services/aiService.ts) still exists; this is
the safer path a deployment can turn on instead."""

import asyncio
import json
import logging
import re
from collections.abc import Awaitable
from typing import Any, Literal

import httpx

from app.core.config import Settings
from app.core.errors import ApiError
from app.core.jscompat import (
    JsError,
    is_nonblank_string,
    js_dumps,
    js_loads,
    js_opt,
    js_prop,
    js_string,
    js_trim,
    js_truthy,
)

logger = logging.getLogger("devdoc.api")

Provider = Literal["gemini", "openai"]
VALID_PROVIDERS: tuple[Provider, ...] = ("gemini", "openai")
PROVIDER_TIMEOUT_S = 45.0

_REPHRASE_SYSTEM_PROMPT = (
    "You are an expert technical writer and principal systems engineer. Rephrase the user input according to "
    "their instructions. Return ONLY the improved technical text without preamble or conversational remarks."
)

TEST_CASE_SCHEMA_PROMPT = """You are a Lead QA Automation Architect specializing in Robot Framework and Embedded Firmware / REST API Testing.
Parse the following Technical Analysis document and generate:
1. A Test Suite Title & Description
2. 3 to 4 detailed Test Cases with TestRail fields (customId, title, preconditions, steps array [step, action, expected], expectedResult, priority P1-P4, type Automated/Manual).
3. Runnable Robot Framework script (.robot) for each automated test case."""  # noqa: E501

_GEMINI_SUITE_SCHEMA = """Respond ONLY in valid JSON matching this schema:
{
  "suiteTitle": "string",
  "suiteDescription": "string",
  "module": "string",
  "testCases": [
    {
      "customId": "TC-XYZ-001",
      "title": "string",
      "preconditions": "string",
      "steps": [{"step": 1, "action": "string", "expected": "string"}],
      "expectedResult": "string",
      "priority": "P1",
      "type": "Automated",
      "robotCode": "*** Settings ***\\n..."
    }
  ]
}"""


def build_rephrase_prompt(text: str, instruction: str) -> str:
    return f'''You are a Principal Software & Systems Architect assisting in writing technical documentation.
Task: {instruction}

Input Text:
"""
{text}
"""

Respond with ONLY the rephrased text. Do not include introductory notes, markdown wrappers like ```markdown, or extra conversational comments.'''  # noqa: E501


def clean_output(value: Any) -> str:
    if not isinstance(value, str):
        raise JsError("str.replace is not a function")
    value = re.sub(r"^```[a-zA-Z]*\n", "", value, count=1)
    value = re.sub(r"\n```\Z", "", value, count=1)
    return js_trim(value)


def _v8_json_error(text: str) -> str:
    """The common V8 JSON.parse messages for an unparsable provider reply."""
    stripped = text.strip(" \t\n\r")
    if not stripped:
        return "Unexpected end of JSON input"
    try:
        js_loads(text)
    except json.JSONDecodeError as exc:
        if exc.pos >= len(text):
            return "Unexpected end of JSON input"
        pos = exc.pos
        for literal in ("true", "false", "null"):
            if text.startswith(literal[0], pos):
                matched = 0
                while matched < len(literal) and pos + matched < len(text) and text[pos + matched] == literal[matched]:
                    matched += 1
                pos += matched
                break
        if pos >= len(text):
            return "Unexpected end of JSON input"
        token = text[pos]
        if len(text) <= 20:
            return f"Unexpected token '{token}', \"{text}\" is not valid JSON"
        start, end = max(0, pos - 10), min(len(text), pos + 10)
        prefix = "..." if start > 0 else ""
        suffix = "..." if end < len(text) else ""
        return f"Unexpected token '{token}', {prefix}\"{text[start:end]}\"{suffix} is not valid JSON"
    except ValueError:
        pass
    return f'"{text[:20]}" is not valid JSON'


def _parse(text: str) -> Any:
    try:
        return js_loads(text)
    except (json.JSONDecodeError, ValueError) as exc:
        raise JsError(_v8_json_error(text)) from exc


class AiService:
    def __init__(self, settings: Settings, client: httpx.AsyncClient) -> None:
        self._settings = settings
        self._client = client

    def configured_providers(self) -> list[Provider]:
        providers: list[Provider] = []
        if self._settings.gemini_api_key:
            providers.append("gemini")
        if self._settings.openai_api_key:
            providers.append("openai")
        return providers

    @property
    def _gemini_model(self) -> str:
        return self._settings.gemini_model or "gemini-1.5-flash"

    @property
    def _openai_model(self) -> str:
        return self._settings.openai_model or "gpt-4o-mini"

    def _gemini_url(self) -> str:
        return (
            f"https://generativelanguage.googleapis.com/v1beta/models/{self._gemini_model}:generateContent"
            f"?key={self._settings.gemini_api_key}"
        )

    async def _post(self, url: str, headers: dict[str, str], payload: dict[str, Any], label: str) -> Any:
        """fetch + `if (!res.ok) throw ...` + `res.json()`, with the same
        failure messages the Node code surfaced as a 502."""
        try:
            async with asyncio.timeout(PROVIDER_TIMEOUT_S):
                response = await self._client.post(url, headers=headers, content=js_dumps(payload).encode("utf-8"))
                body = response.text
        except TimeoutError as exc:
            raise JsError("The operation was aborted due to timeout") from exc
        except httpx.HTTPError as exc:
            raise JsError("fetch failed") from exc

        if not response.is_success:
            try:
                error_body = js_loads(body)
            except (json.JSONDecodeError, ValueError):
                error_body = {}
            message = js_opt(js_prop(error_body, "error"), "message")
            raise JsError(
                js_string(message) if js_truthy(message) else f"{label} API returned status {response.status_code}"
            )
        return _parse(body)

    async def _gemini(self, prompt: str, generation_config: dict[str, Any]) -> Any:
        data = await self._post(
            self._gemini_url(),
            {"Content-Type": "application/json"},
            {"contents": [{"parts": [{"text": prompt}]}], "generationConfig": generation_config},
            "Gemini",
        )
        return js_opt(js_prop(data, "candidates"), 0, "content", "parts", 0, "text")

    async def _openai(self, payload: dict[str, Any]) -> Any:
        data = await self._post(
            "https://api.openai.com/v1/chat/completions",
            {"Content-Type": "application/json", "Authorization": f"Bearer {self._settings.openai_api_key}"},
            payload,
            "OpenAI",
        )
        return js_opt(js_prop(data, "choices"), 0, "message", "content")

    async def rephrase(self, provider: Provider, text: str, instruction: str) -> str:
        if provider == "gemini":
            generated = await self._gemini(
                build_rephrase_prompt(text, instruction), {"temperature": 0.3, "maxOutputTokens": 2048}
            )
        else:
            generated = await self._openai(
                {
                    "model": self._openai_model,
                    "messages": [
                        {"role": "system", "content": _REPHRASE_SYSTEM_PROMPT},
                        {"role": "user", "content": f"Instruction: {instruction}\n\nInput Text:\n{text}"},
                    ],
                    "temperature": 0.3,
                }
            )
        return clean_output(generated if js_truthy(generated) else text)

    async def generate_test_cases(self, provider: Provider, context: str) -> Any:
        """The raw generated suite, before the frontend assigns ids and merges
        defaults (that part stays client-side, since it's not sensitive)."""
        if provider == "gemini":
            prompt = f"{TEST_CASE_SCHEMA_PROMPT}\n\nDocument Specs:\n{context}\n\n{_GEMINI_SUITE_SCHEMA}"
            raw = await self._gemini(prompt, {"temperature": 0.2, "responseMimeType": "application/json"})
        else:
            prompt = (
                f"{TEST_CASE_SCHEMA_PROMPT} Return a JSON object with suiteTitle, suiteDescription, module, and "
                "testCases (customId, title, preconditions, steps array, expectedResult, priority P1-P4, type, "
                f"robotCode string).\n\nSpecs:\n{context}"
            )
            raw = await self._openai(
                {
                    "model": self._openai_model,
                    "messages": [{"role": "user", "content": prompt}],
                    "response_format": {"type": "json_object"},
                }
            )
        return _parse(js_string(raw) if js_truthy(raw) else "{}")

    # --- request handling: the route-level checks, in the Node order ---------

    def _checked_provider(self, body: Any) -> Provider:
        provider = js_opt(body, "provider")
        if not isinstance(provider, str) or provider not in VALID_PROVIDERS:
            raise ApiError(400, f"provider must be one of {', '.join(VALID_PROVIDERS)}.")
        return provider  # type: ignore[return-value]

    def _require_configured(self, provider: Provider) -> None:
        if provider not in self.configured_providers():
            raise ApiError(501, f"This server has no {provider} API key configured.")

    async def handle_rephrase(self, body: Any) -> dict[str, str]:
        provider = self._checked_provider(body)
        text, instruction = js_opt(body, "text"), js_opt(body, "instruction")
        if not is_nonblank_string(text) or not is_nonblank_string(instruction):
            raise ApiError(400, "text and instruction are required.")
        self._require_configured(provider)
        return {"text": await _as_bad_gateway(self.rephrase(provider, text, instruction))}

    async def handle_generate_test_cases(self, body: Any) -> Any:
        provider = self._checked_provider(body)
        context = js_opt(body, "context")
        if not is_nonblank_string(context):
            raise ApiError(400, "context is required.")
        self._require_configured(provider)
        return await _as_bad_gateway(self.generate_test_cases(provider, context))


async def _as_bad_gateway[T](call: Awaitable[T]) -> T:
    """A provider failure is a 502 carrying its message, never a crash."""
    try:
        return await call
    except JsError as exc:
        raise ApiError(502, str(exc)) from exc
    except Exception as exc:
        logger.exception("AI provider call failed unexpectedly")
        raise ApiError(502, "The AI provider request failed.") from exc
