from typing import Any, Literal

from app.schemas.common import WireModel

AiProvider = Literal["gemini", "openai"]


class ProvidersResponse(WireModel):
    providers: list[AiProvider]


class RephraseRequest(WireModel):
    provider: AiProvider
    text: str
    instruction: str


class RephraseResponse(WireModel):
    text: str


class GenerateTestCasesRequest(WireModel):
    provider: AiProvider
    context: str


class GeneratedTestSuite(WireModel):
    """The provider's raw suite, passed through unchanged - the frontend
    assigns ids and fills defaults (aiTestCaseGeneratorService.ts)."""

    suiteTitle: str | None = None
    suiteDescription: str | None = None
    module: str | None = None
    testCases: list[Any] | None = None
