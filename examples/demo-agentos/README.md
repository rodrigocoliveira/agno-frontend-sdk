# examples/demo-agentos

A real [AgentOS](https://docs.agno.com) `3.0.6` with agents, teams and workflows that exercise
every feature of `@rodrigocoliveira/agno-hooks`. Pair it with [`examples/demo-react`](../demo-react).

## Run

```bash
cd examples/demo-agentos
uv sync
OPENAI_API_KEY=sk-... uv run python server.py     # OpenAI
# or, with no key, a local Ollama model (needs tool calling: llama3.2, qwen2.5, ...)
ollama pull llama3.2 && uv run python server.py
```

Then print the tokens and import them in the web app (Settings → Import):

```bash
uv run python tokens.py
```

| env | default | what |
|---|---|---|
| `AGNO_PORT` | `7777` | port |
| `OPENAI_API_KEY` | – | when set, OpenAI is used |
| `OPENAI_MODEL` | `gpt-4o-mini` | OpenAI model id |
| `OLLAMA_MODEL` | `llama3.2` | Ollama model id (used when no OpenAI key) |
| `JWT_SECRET` | `demo-secret-change-me` | HS256 secret shared by `server.py` and `tokens.py` |
| `WEB_ORIGIN` | `http://localhost:5173` | CORS origin of demo-react |

Auth is JWT (HS256) with per-user isolation: `admin` sees everything and resolves approvals;
`user-1` and `user-2` only see their own sessions. In production you would use RS256 with a JWKS,
see `agno.os.config.AuthorizationConfig`. Delete `tmp/demo.db` to reset all data.

## Catalog

(filled in Task 4)
