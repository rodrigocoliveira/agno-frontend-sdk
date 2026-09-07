"""Every environment variable the demo reads, in one place."""

import os

PORT = int(os.environ.get("AGNO_PORT", "7777"))
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.2")
JWT_SECRET = os.environ.get("JWT_SECRET", "demo-secret-change-me")
WEB_ORIGIN = os.environ.get("WEB_ORIGIN", "http://localhost:5173")
