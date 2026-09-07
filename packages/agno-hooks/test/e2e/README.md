# agno-hooks E2E

Start the local AgentOS (see `e2e/agentos`): `AGNO_PORT=7778 bun run agentos`.

Run the suite from the repo root: `AGNO_URL=http://localhost:7778 bun run test:e2e`.

Without `AGNO_URL` the suite is skipped, so `bun run test` stays offline.
