"""Picks the LLM: OpenAI when a key is present, a local Ollama model otherwise."""

from agno.models.base import Model
from agno.models.ollama import Ollama
from agno.models.openai import OpenAIChat

import settings


def model() -> Model:
    if settings.OPENAI_API_KEY:
        return OpenAIChat(id=settings.OPENAI_MODEL)
    return Ollama(id=settings.OLLAMA_MODEL)
