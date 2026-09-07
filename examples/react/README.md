# `examples/react` — a Vite + React app on `@rodrigocoliveira/agno-hooks`

A ~250-line chat UI that exercises the whole public surface of the SDK against the
zero-key AgentOS server in [`examples/agentos`](../agentos): agents, teams, workflows,
streaming, session hydration, human-in-the-loop and frontend tools. No UI library —
one small `styles.css`.

## Run it

Two terminals, from the repository root:

```bash
# 1. the local AgentOS server (no API key: it uses a scripted model)
AGNO_PORT=7778 bun run agentos

# 2. the example
bun run example        # → http://localhost:5173
```

## The three tabs

The sidebar lists the sessions of the current target (`GET /sessions`) and the URL hash
carries the route: `#agent/<sessionId>`, `#team/<sessionId>`, `#workflow/<sessionId>`.
Reloading the page re-hydrates that session — and reattaches to a run that is still
streaming, so a reload mid-answer keeps the tokens coming.

| Tab | Target | What to type |
| --- | --- | --- |
| `agent` | `test-agent` | see below |
| `team` | `test-team` | same messages; the leader delegates to `test-agent` and member runs render nested |
| `workflow` | `test-workflow-hitl` | anything — the single `echo` step pauses for confirmation before it runs |

The scripted model reacts to keywords in the message (case-insensitive):

| Message contains | What happens | What the UI shows |
| --- | --- | --- |
| anything else (`hello`) | streams `Echo: <message>` word by word | an assistant bubble filling in |
| `tool` (`Use the tool`) | calls `add_one(x=41)`, a `requires_confirmation` tool | a HITL card with **yes** / **no**, then **continue** |
| `ask` (`ask me`) | calls the native `ask_user` tool | a card with the question and its options (`Trail` / `Road`) |
| `locate` (`locate me`) | calls `get_location`, an `external_execution` tool | the app answers it from the browser through `frontendTools`; the panel also offers a manual **provide** |

`frontendTools: { get_location }` in `AgentView` / `TeamView` returns a hard-coded
position, so `locate me` completes without any interaction — that is the frontend-tool
path. The manual **provide** button in the pending panel is the `resolveTool` path for
external tools you would rather answer by hand.

## The `/agno` proxy

`AgnoProvider` is mounted with `baseUrl="/agno"` and `vite.config.ts` proxies `/agno/*`
to the AgentOS server, stripping the prefix. Same origin, so there is no CORS to
configure. Point it elsewhere with `AGNO_URL`:

```bash
AGNO_URL=http://localhost:7777 bun run example
```

## Source aliases

`vite.config.ts` aliases `@rodrigocoliveira/agno-hooks` and `@rodrigocoliveira/agno-api`
to `packages/*/src/index.ts`, so editing a package hot-reloads the app. `tsc` (the
`build` / `typecheck` scripts) resolves the published entry points instead, so run
`bun run build` at the root once before building the example.
