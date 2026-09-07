# agno-frontend-sdk

Frontend SDK for [AgentOS v3](https://docs.agno.com) (`agno >= 3.0`).

| package | what |
|---|---|
| [`@rodrigocoliveira/agno-api`](packages/agno-api) | typed, stateless client for every AgentOS v3 route |
| [`@rodrigocoliveira/agno-hooks`](packages/agno-hooks) | session store + React hooks: agents, teams, workflows, HITL, frontend tools |

**Documentation:** [`guide/`](guide) — start with [getting started](guide/getting-started.md).

## Try the demo

A real AgentOS with agents, teams and workflows that exercise every feature, plus a React app
that shows each one. Needs an OpenAI key or a local Ollama model (details in
[`examples/demo-agentos`](examples/demo-agentos)).

```bash
bun install
OPENAI_API_KEY=sk-... bun run demo:server   # terminal 1 → http://localhost:7777
bun run demo:tokens                          # prints admin / user-1 / user-2 JWTs
bun run demo:web                             # terminal 2 → http://localhost:5173
```

In the app open **Settings**, import the tokens JSON and pick `user-1`. The Home page maps each
demo target to the feature it shows and to its guide chapter.

## Develop

```bash
bun run build && bun run typecheck && bun run test          # unit
AGNO_PORT=7778 bun run agentos                                # scripted E2E server (e2e/agentos)
AGNO_URL=http://localhost:7778 bun run test:e2e               # E2E, no API key needed
```
