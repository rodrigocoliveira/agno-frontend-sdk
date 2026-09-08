# examples/demo-react

The showcase app for `@rodrigocoliveira/agno-hooks`. It discovers agents, teams and workflows from
the connected AgentOS, so it works against [`examples/demo-agentos`](../demo-agentos) (real LLM)
and against [`e2e/agentos`](../../e2e/agentos) (scripted, no auth).

```bash
bun install
bun run demo:server     # terminal 1 (see demo-agentos/README.md for the API key)
bun run demo:web        # terminal 2 → http://localhost:5173
```

Open **Settings** and click **Fetch demo tokens** under "Quick demo login", then pick `User 1`.
That's it — no terminal step for tokens. (Pointing this app at a real, non-demo AgentOS? Switch
Quick demo login off to paste a token by hand.) The Home page maps each demo target to the feature
it shows and to its chapter in [`guide/`](../../guide).

Tokens can also be seeded with `VITE_AGNO_TOKENS='<json>' bun run demo:web` (read on first load only).
