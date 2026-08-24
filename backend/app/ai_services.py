import json
import math

import httpx

from app.config import settings


class AIServiceError(Exception):
    """Raised when Voyage AI or Claude returns an error, or the keys
    aren't configured. Callers should catch this and degrade gracefully
    (e.g. skip embedding generation, fall back to no AI suggestion)
    rather than let it 500 an otherwise-unrelated request like
    publishing a video.
    """


def get_embedding(text: str) -> list[float]:
    """Voyage AI embedding for a single piece of text — same model
    family as the ACE CMS's CV-matching pipeline (voyage-4-lite by
    default). Raises AIServiceError if VOYAGE_API_KEY isn't configured
    or the API call fails; callers decide how to degrade.
    """
    if not settings.VOYAGE_API_KEY:
        raise AIServiceError("VOYAGE_API_KEY is not configured.")
    try:
        response = httpx.post(
            "https://api.voyageai.com/v1/embeddings",
            headers={"Authorization": f"Bearer {settings.VOYAGE_API_KEY}"},
            json={"input": [text], "model": settings.VOYAGE_MODEL},
            timeout=20.0,
        )
        response.raise_for_status()
        data = response.json()
        return data["data"][0]["embedding"]
    except Exception as e:
        raise AIServiceError(f"Voyage AI embedding request failed: {e}") from e


def cosine_similarity(a: list[float], b: list[float]) -> float:
    """Plain-Python cosine similarity — no numpy dependency. Fine at
    theomy's catalog size; a pgvector-backed ANN index would only start
    to matter with a much larger catalog than exists today.
    """
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def call_claude(system_prompt: str, user_prompt: str, max_tokens: int = 1024) -> str:
    """Raw Claude API call — returns the text of the first content
    block. Raises AIServiceError if ANTHROPIC_API_KEY isn't configured
    or the call fails.
    """
    if not settings.ANTHROPIC_API_KEY:
        raise AIServiceError("ANTHROPIC_API_KEY is not configured.")
    try:
        response = httpx.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": settings.ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": settings.ANTHROPIC_MODEL,
                "max_tokens": max_tokens,
                "system": system_prompt,
                "messages": [{"role": "user", "content": user_prompt}],
            },
            timeout=30.0,
        )
        response.raise_for_status()
        data = response.json()
        return "".join(block.get("text", "") for block in data.get("content", []) if block.get("type") == "text")
    except Exception as e:
        raise AIServiceError(f"Claude API request failed: {e}") from e


def call_claude_json(system_prompt: str, user_prompt: str, max_tokens: int = 1024) -> dict:
    """Same as call_claude, but expects (and parses) a JSON object back.
    The system prompt is responsible for instructing Claude to return
    ONLY JSON, no markdown fences or preamble — this just strips
    fences defensively in case Claude adds them anyway.
    """
    raw = call_claude(system_prompt, user_prompt, max_tokens=max_tokens)
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:]
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as e:
        raise AIServiceError(f"Claude returned non-JSON output: {raw[:200]}") from e
