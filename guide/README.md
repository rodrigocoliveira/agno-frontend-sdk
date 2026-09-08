# agno-frontend-sdk guide

Two packages for talking to [AgentOS v3](https://docs.agno.com) (`agno >= 3.0`) from the browser:

- **`@rodrigocoliveira/agno-api`** — a typed, stateless client: one function per route, streaming
  helpers, one error type. Use it alone for anything that is not a conversation (sessions lists,
  approvals, memory, knowledge, metrics).
- **`@rodrigocoliveira/agno-hooks`** — a session store and three React hooks (`useAgnoAgent`,
  `useAgnoTeam`, `useAgnoWorkflow`). Use it for the conversation itself: history, streaming,
  pauses (human in the loop), tools executed in the browser, reconnection.

The unit of state is the **run**, not the message — [concepts/runs.md](concepts/runs.md) explains why.

## Contents

| | |
|---|---|
| [Getting started](getting-started.md) | install, run the demo server and app, first conversation |
| **Concepts** | |
| [Runs](concepts/runs.md) | what a `Run` is and what it contains |
| [Lifecycle](concepts/lifecycle.md) | loading → ready, send, stream, paused, continue, terminal |
| [Human in the loop](concepts/hitl.md) | Agno's vocabulary: ToolExecution, RunRequirement, StepRequirement |
| [Auth](concepts/auth.md) | provider and token, user id in the JWT, scopes, user isolation |
| **Guides** | |
| [Agent](agent.md) | `useAgnoAgent` from zero: provider, hook, run list, composer |
| [Team](team.md) | member runs, `member_responses`, requirements coming from members |
| [Workflow](workflow.md) | steps, step pause and executor pause |
| [Frontend tools](frontend-tools.md) | `frontendTools`, auto-run, `resolveTool`, `runTools` |
| [Confirmation and input](confirmation-and-input.md) | `requires_confirmation`, `requires_user_input`, `ask_user` |
| [Approvals](approvals.md) | `@approval` on the server, 403 on continue, an admin page |
| [Sessions and history](sessions-and-history.md) | `sessionId`, hydration, listing sessions |
| [Files](files.md) | attaching files to `send` |
| [Reconnection](reconnection.md) | `background`, reload during a run, `resume` |
| [Errors](errors.md) | `AgnoApiError`, hook status `'error'`, per-run errors |
| **Reference** | |
| [agno-api](reference/agno-api.md) | `createAgnoApi`, config, signature rule, streaming, errors |
| [agno-hooks](reference/agno-hooks.md) | `AgnoProvider`, hooks, `Snapshot`, `Run*`, `Pending`, `Decision`, `FrontendTool` |
| [Demo map](demo.md) | which screen of `examples/demo-react` shows which chapter |
