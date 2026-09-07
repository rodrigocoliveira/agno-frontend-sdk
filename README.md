# agno-frontend-sdk

Frontend SDK for [AgentOS v3](https://docs.agno.com) (`agno >= 3.0`).

| package | what |
|---|---|
| [`@rodrigocoliveira/agno-api`](packages/agno-api) | typed, stateless client for every AgentOS v3 route |
| [`@rodrigocoliveira/agno-hooks`](packages/agno-hooks) | session store + React hooks: agents, teams, workflows, HITL, frontend tools |

Examples: [`examples/react`](examples/react) (Vite app) against [`examples/agentos`](examples/agentos) (zero-key local server).

```bash
bun install
AGNO_PORT=7778 bun run agentos     # terminal 1
bun run example                    # terminal 2 → http://localhost:5173
```
