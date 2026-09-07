# agno-frontend-sdk

Frontend SDK for [AgentOS v3](https://docs.agno.com) (`agno >= 3.0`).

| package | what |
|---|---|
| [`@rodrigocoliveira/agno-api`](packages/agno-api) | typed, stateless client for every AgentOS v3 route |
| [`@rodrigocoliveira/agno-hooks`](packages/agno-hooks) | session store + React hooks: agents, teams, workflows, HITL, frontend tools |

E2E fixture: [`e2e/agentos`](e2e/agentos) (zero-key scripted server used by CI).

```bash
bun install
AGNO_PORT=7778 bun run agentos                       # terminal 1
AGNO_URL=http://localhost:7778 bun run test:e2e      # terminal 2
```
