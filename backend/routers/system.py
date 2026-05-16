from __future__ import annotations
"""System routers: /api/health, /api/config/ui, /api/config/llm."""

import httpx
from fastapi import APIRouter, Request
from pydantic import BaseModel
from models.responses import HealthResponse, UIConfigResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health(request: Request) -> HealthResponse:
    """Health check. Tests LLM provider with a trivial call."""
    llm = request.app.state.llm
    config = request.app.state.config

    # Try a lightweight LLM call to verify the provider is reachable
    status = "ok"
    try:
        from providers.llm.base import LLMMessage
        resp = await llm.complete(
            [LLMMessage(role="user", content="Say 'ok'")],
            max_tokens=10,
            temperature=0.0,
        )
        if not resp.content:
            status = "degraded"
    except Exception:
        status = "degraded"

    return HealthResponse(
        status=status,
        llm_provider=llm.get_provider_name(),
        llm_model=llm.get_model_name(),
        stt_provider=request.app.state.stt.get_provider_name(),
        version=config.version,
    )


class LLMConfigPatch(BaseModel):
    provider: str
    model: str


@router.get("/config/llm")
async def get_llm_config(request: Request) -> dict:
    """Return the active LLM provider and model."""
    llm = request.app.state.llm
    return {"provider": llm.get_provider_name(), "model": llm.get_model_name()}


@router.patch("/config/llm")
async def patch_llm_config(body: LLMConfigPatch, request: Request) -> dict:
    """Swap the active LLM provider/model in memory (session only, no disk write)."""
    from core.prompt_manager import PromptManager
    from providers.llm.factory import create_llm_provider
    from services.analyzer import TranscriptAnalyzer
    from services.assessor import QuestionGenerator
    from services.evaluator import AnswerEvaluator

    config = request.app.state.config
    config.llm.provider = body.provider
    config.llm.model = body.model

    prompt_mgr = PromptManager(config)
    llm = create_llm_provider(config)

    request.app.state.llm = llm
    request.app.state.analyzer = TranscriptAnalyzer(llm, prompt_mgr, config)
    request.app.state.assessor = QuestionGenerator(llm, prompt_mgr, config)
    request.app.state.evaluator = AnswerEvaluator(llm, prompt_mgr, config)

    return {"provider": llm.get_provider_name(), "model": llm.get_model_name()}


@router.get("/providers/{provider}/models")
async def list_models(provider: str, request: Request) -> dict:
    """List available models for a provider."""
    config = request.app.state.config
    provider = provider.lower()

    STATIC = {
        "openai": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
        "anthropic": ["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"],
        "gemini": ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
    }

    if provider in STATIC:
        return {"models": STATIC[provider]}

    if provider == "ollama":
        try:
            base = config.llm.ollama.base_url.rstrip("/")
            async with httpx.AsyncClient(timeout=5) as client:
                resp = await client.get(f"{base}/api/tags")
                data = resp.json()
                models = [m["name"] for m in data.get("models", [])]
                return {"models": models}
        except Exception:
            return {"models": [], "error": "Ollama unreachable"}

    if provider == "lmstudio":
        try:
            base = config.llm.lmstudio.base_url.rstrip("/")
            async with httpx.AsyncClient(timeout=5) as client:
                resp = await client.get(f"{base}/models",
                    headers={"Authorization": f"Bearer {config.llm.lmstudio.api_key}"})
                data = resp.json()
                models = [m["id"] for m in data.get("data", [])]
                return {"models": models}
        except Exception:
            return {"models": [], "error": "LM Studio unreachable"}

    return {"models": []}


@router.get("/config/ui", response_model=UIConfigResponse)
async def ui_config(request: Request) -> UIConfigResponse:
    """Return a safe subset of configuration for the frontend."""
    config = request.app.state.config
    asmt = config.assessment
    return UIConfigResponse(
        brand_name=config.brand_name,
        brand_tagline=config.brand_tagline,
        features=config.ui.get("features", {}),
        assessment_config={
            "mcq_count": asmt.mcq.count,
            "tib_count": asmt.teach_it_back.count,
            "voice_enabled": asmt.teach_it_back.voice_enabled,
            "text_fallback": asmt.teach_it_back.text_fallback,
            "adaptive_enabled": asmt.adaptive_engine.enabled,
            "initial_difficulty": asmt.adaptive_engine.initial_difficulty,
            "hint_levels": asmt.mcq.hint_levels,
            "min_answer_words": asmt.teach_it_back.min_answer_words,
            "max_recording_seconds": asmt.teach_it_back.max_recording_seconds,
        },
    )
