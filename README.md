# agno-frontend-sdk

Build a chat UI on top of [AgentOS v3](https://docs.agno.com) (`agno >= 3.0`) from React or plain
TypeScript: streaming answers, history that survives a reload, human-in-the-loop pauses, and tools
that run in the browser.

| package | what |
|---|---|
| [`@rodrigocoliveira/agno-hooks`](packages/agno-hooks) | session store + React hooks: `useAgnoAgent`, `useAgnoTeam`, `useAgnoWorkflow` |
| [`@rodrigocoliveira/agno-api`](packages/agno-api) | typed, stateless client for every AgentOS v3 route (the hooks are built on it) |

## A chat in 40 lines

```bash
bun add @rodrigocoliveira/agno-hooks @rodrigocoliveira/agno-api react
```

```tsx
import { useState } from 'react'
import { AgnoProvider, useAgnoAgent } from '@rodrigocoliveira/agno-hooks'

// One provider = one connection to your AgentOS. `token` is read on every request.
export function App() {
  return (
    <AgnoProvider baseUrl="http://localhost:7777" token={() => localStorage.getItem('token') ?? undefined}>
      <Chat />
    </AgnoProvider>
  )
}

// One hook = one conversation with one agent. `runs` is the history, streamed live.
function Chat() {
  const chat = useAgnoAgent({ agentId: 'chat' })
  const [text, setText] = useState('')

  if (chat.status === 'loading') return <p>loading…</p>
  if (chat.status === 'error') return <p>{chat.error?.message}</p>

  return (
    <div>
      {chat.runs.map((run) => (
        <div key={run.id}>
          <p><b>you:</b> {run.input.message}</p>
          <p><b>agent:</b> {run.content}{run.status === 'running' && ' ▍'}</p>
        </div>
      ))}
      <form onSubmit={(e) => { e.preventDefault(); void chat.send(text); setText('') }}>
        <input value={text} onChange={(e) => setText(e.target.value)} disabled={chat.isBusy} />
        {chat.isBusy
          ? <button type="button" onClick={() => void chat.cancel()}>Stop</button>
          : <button type="submit" disabled={!text.trim()}>Send</button>}
      </form>
    </div>
  )
}
```

That is a working chat: `send` starts a run on the server, the answer streams into `run.content`
as it is generated, and reopening the page with the same `sessionId` reloads the whole history.

The same hook also gives you, with no extra wiring:

- **History and reload** — pass `sessionId` to reopen a conversation; a run still streaming on the
  server is picked up again after a reload. [sessions](guide/sessions-and-history.md) · [reconnection](guide/reconnection.md)
- **Human in the loop** — when the agent asks for confirmation or for input, `chat.pending` holds
  the question and `chat.continue(...)` answers it. [confirmation and input](guide/confirmation-and-input.md)
- **Tools that run in the browser** — declare `frontendTools`, the hook executes them when the
  agent calls them and sends the result back. [frontend tools](guide/frontend-tools.md)
- **Teams and workflows** — `useAgnoTeam` / `useAgnoWorkflow`, same shape, plus member runs and
  steps. [team](guide/team.md) · [workflow](guide/workflow.md)
- **Everything else in AgentOS** — sessions list, memory, knowledge, approvals, metrics — through
  `useAgnoApi()` or `@rodrigocoliveira/agno-api` directly. [agno-api reference](guide/reference/agno-api.md)

**Documentation:** [`guide/`](guide) — start with [getting started](guide/getting-started.md).
Complete app using every feature: [`examples/demo-react`](examples/demo-react).

## Try the demo

A real AgentOS with agents, teams and workflows that exercise every feature, plus the React app
that shows each one. Needs an OpenAI key or a local Ollama model (details in
[`examples/demo-agentos`](examples/demo-agentos)).

```bash
bun install
OPENAI_API_KEY=sk-... bun run demo:server   # terminal 1 → http://localhost:7777
bun run demo:web                             # terminal 2 → http://localhost:5173
```

In the app open **Settings**, click **Fetch demo tokens** under "Quick demo login" and pick
`User 1`. The Home page maps each demo target to the feature it shows and to its guide chapter.

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for setup, tests
and changesets.

## License

MIT
