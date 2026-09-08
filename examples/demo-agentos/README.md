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

Then open `demo-react`, go to **Settings** and click **Fetch demo tokens** under "Quick demo
login" — it hands you Admin / User 1 / User 2 with one click, no terminal step. `tokens.py` still
works if you'd rather script it or paste a token by hand (Quick demo login off):

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

| kind | id | try | shows |
|---|---|---|---|
| agent | `chat` | "Summarise this PDF" (attach one) | streaming, markdown, files, cancel, metrics |
| agent | `tools` | "What is SKU-2?" / "Run the slow task" | tool calls in the chat; reload while `slow_task` runs |
| agent | `browser` | "Where am I and what time is it?" | tools executed in the browser (`frontendTools`) |
| agent | `confirm` | "Invoice ACME 120 dollars" | `requires_confirmation` |
| agent | `interview` | "Plan me a weekend" | `ask_user` (multi-select) and a `requires_user_input` form |
| agent | `approval` | "Refund order 42, 30 dollars" | admin approval: pauses until `/approvals` resolves it |
| team | `support` | "Invoice ACME 50 dollars" | member runs, confirmation coming from a member |
| team | `research` | "Electric bikes" | parallel members, `member_responses`, `ask_user` on the leader |
| team | `field` | "What is around me?" | browser tool executed for a member |
| workflow | `publish` | "Edge computing" | executor pause (question) then step pause (human review) |
| workflow | `report` | "ACME Corp" | `Parallel` and `Condition` steps |
| workflow | `nightly` | "go" | 45 s background run: close the tab and come back |
