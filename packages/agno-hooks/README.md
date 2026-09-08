# @rodrigocoliveira/agno-hooks

Session store and React hooks for [AgentOS v3](https://docs.agno.com): open a session against an agent, team or workflow, load its history, send messages with streaming, survive a reload mid-run, and handle human-in-the-loop (HITL) and browser-side tool execution. The unit of state is the **run**, not the message — the server keeps runs, the stream is "events of a run", HITL pauses a run. Built on [`@rodrigocoliveira/agno-api`](../agno-api).

## Install

```bash
bun add @rodrigocoliveira/agno-hooks @rodrigocoliveira/agno-api react
```

## Quick start

```tsx
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

## Documentation

Everything else — sessions, background runs, human in the loop, frontend tools, teams, workflows,
errors, the store without React — is in [`guide/`](../../guide):
[agent](../../guide/agent.md) · [team](../../guide/team.md) · [workflow](../../guide/workflow.md) ·
[frontend tools](../../guide/frontend-tools.md) · [confirmation and input](../../guide/confirmation-and-input.md) ·
[approvals](../../guide/approvals.md) · [sessions and history](../../guide/sessions-and-history.md) ·
[reconnection](../../guide/reconnection.md) · [errors](../../guide/errors.md) ·
[reference](../../guide/reference/agno-hooks.md).

A complete app using every feature: [`examples/demo-react`](../../examples/demo-react).

## What is not here

- Session lists / sidebar hook ([#4](https://github.com/rodrigocoliveira/agno-frontend-sdk/issues/4)) — use `useAgnoApi()` + `api.sessions.list`.
- Approvals hook ([#5](https://github.com/rodrigocoliveira/agno-frontend-sdk/issues/5)) — `api.approvals.*`.
- A `send` queue ([#6](https://github.com/rodrigocoliveira/agno-frontend-sdk/issues/6)) — one active run per store.
- Fork / regenerate sugar ([#7](https://github.com/rodrigocoliveira/agno-frontend-sdk/issues/7)) — pass them in `continue`'s `extra`.
- UI components. Agno v2.

## License

MIT
