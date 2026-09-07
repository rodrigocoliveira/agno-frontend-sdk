# Getting started

This page takes you from a clean checkout to a working conversation: install the two packages,
start the bundled AgentOS demo server, point the demo web app at it, and send your first message
through `useAgnoAgent`. Every command below is one you can actually run against this repository —
`examples/demo-agentos` is a real AgentOS server and `examples/demo-react` is a real (if small)
production-shaped app, not a mock.

## Install

`@rodrigocoliveira/agno-hooks` depends on `@rodrigocoliveira/agno-api` and needs React (`>= 18`)
as a peer:

```bash
# packages/agno-hooks/README.md
bun add @rodrigocoliveira/agno-hooks @rodrigocoliveira/agno-api react
```

## Run the demo server

`examples/demo-agentos` is a real AgentOS `3.0.6` with agents, teams and workflows that exercise
every feature of `@rodrigocoliveira/agno-hooks`.

```bash
# examples/demo-agentos/README.md
cd examples/demo-agentos
uv sync
OPENAI_API_KEY=sk-... uv run python server.py     # OpenAI
# or, with no key, a local Ollama model (needs tool calling: llama3.2, qwen2.5, ...)
ollama pull llama3.2 && uv run python server.py
```

Auth is JWT (HS256) with per-user isolation. Print the three demo tokens (`admin`, `user-1`,
`user-2`) so you have something to paste into the web app in a moment:

```bash
# examples/demo-agentos/README.md
uv run python tokens.py
```

## Run the demo app

From the repo root:

```bash
bun run demo:web
```

Open the app and go to **Settings** → set the endpoint (`http://localhost:7777` by default) →
paste the JSON that `tokens.py` printed into **Import JSON** → select `user-1` as the active
token. `user-1` has every scope `demo-react` needs except resolving approvals, which is
admin-only — see [concepts/auth.md](concepts/auth.md).

## Your first conversation

This is the same `Quick start` shown in the `@rodrigocoliveira/agno-hooks` package README:

```tsx
// packages/agno-hooks/README.md
import { AgnoProvider, useAgnoAgent } from '@rodrigocoliveira/agno-hooks'

function App() {
  return (
    <AgnoProvider baseUrl="http://localhost:7777" token={() => localStorage.getItem('token') ?? undefined}>
      <Chat />
    </AgnoProvider>
  )
}

function Chat() {
  const chat = useAgnoAgent({ agentId: 'chat' })
  return (
    <>
      {chat.runs.map((run) => (
        <div key={run.id}>
          <p><b>you:</b> {run.input.message}</p>
          <p><b>agent:</b> {run.content}</p>
        </div>
      ))}
      <button disabled={chat.isBusy} onClick={() => chat.send('hi')}>Send</button>
    </>
  )
}
```

`AgnoProvider` owns the one HTTP/SSE connection (base URL, token, retries) for everything below
it. `useAgnoAgent` owns one conversation against one agent — `runs`, `pending`, `isBusy` all
describe that single session. `chat.send('hi')` creates a run and streams its events into `runs`
as they arrive, the same way every agent, team and workflow page in `examples/demo-react` works.

## Where to go next

- [Agent](agent.md) walks through `useAgnoAgent` in more depth: the run list, the composer, cancel.
- [Concepts/Runs](concepts/runs.md) explains why the SDK's unit of state is the run, not the message.
- [Demo map](demo.md) lists every screen in `examples/demo-react` and which guide chapter it demonstrates.

**See it in the demo:** `/settings`, `/agents/chat`
