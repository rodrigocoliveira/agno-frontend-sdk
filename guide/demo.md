# Demo map

`examples/demo-react` is a real (if small) production-shaped app paired with `examples/demo-agentos`,
a real AgentOS `3.0.6` server. Every screen in the demo exercises one or more features documented in
this guide, and the demo's own catalog (`examples/demo-react/src/catalog.ts`) is the single source
of truth for what each screen demonstrates — this page cross-references that catalog, and the app's
source layout, to the guide's chapters.

## Catalog

Each row is one entry of the `CATALOG` array in `examples/demo-react/src/catalog.ts`. `route` is
`pathFor(kind, id)` (`` `/${kind}s/${id}` ``); `server file` is where that agent/team/workflow is
defined in `examples/demo-agentos`.

| kind | id | route | server file | what it shows | chapter |
|---|---|---|---|---|---|
| agent | `chat` | `/agents/chat` | `agents/chat.py` | Streaming, markdown, file attachments, cancel, metrics | [agent.md](agent.md) |
| agent | `tools` | `/agents/tools` | `agents/tools.py` | Tool calls in the chat; reload the page while `slow_task` runs | [reconnection.md](reconnection.md) |
| agent | `browser` | `/agents/browser` | `agents/browser.py` | Tools executed in the browser (`frontendTools`) | [frontend-tools.md](frontend-tools.md) |
| agent | `confirm` | `/agents/confirm` | `agents/confirm.py` | `requires_confirmation`, decided outside the chat | [confirmation-and-input.md](confirmation-and-input.md) |
| agent | `interview` | `/agents/interview` | `agents/interview.py` | `ask_user` with multi-select and a `requires_user_input` form | [confirmation-and-input.md](confirmation-and-input.md) |
| agent | `approval` | `/agents/approval` | `agents/approval.py` | Admin approval: pauses until `/approvals` resolves it | [approvals.md](approvals.md) |
| team | `support` | `/teams/support` | `teams/support.py` | Member runs; a confirmation coming from a member | [team.md](team.md) |
| team | `research` | `/teams/research` | `teams/research.py` | Parallel members, `member_responses`, `ask_user` on the leader | [team.md](team.md) |
| team | `field` | `/teams/field` | `teams/field.py` | A browser tool executed for a member | [frontend-tools.md](frontend-tools.md) |
| workflow | `publish` | `/workflows/publish` | `workflows/publish.py` | Executor pause (question) then step pause (human review) | [workflow.md](workflow.md) |
| workflow | `report` | `/workflows/report` | `workflows/report.py` | `Parallel` and `Condition` steps | [workflow.md](workflow.md) |
| workflow | `nightly` | `/workflows/nightly` | `workflows/nightly.py` | 45 s background run: close the tab and come back | [reconnection.md](reconnection.md) |

`HomePage` (`src/pages/HomePage.tsx`) lists every catalog entry with its `try` prompt, and
`Sidebar` (`src/layout/Sidebar.tsx`) links straight to each target's route.

## Source folders

The app's own source layout mirrors the guide's split between the conversation itself and
everything around it:

| Folder | Contains | Chapter(s) |
|---|---|---|
| `src/run/` | `RunShell`, `RunList`, `RunCard`, `Composer`, `MemberRuns`, `StepList`, `ToolCallList`, `RawDrawer` — the run list and composer shared by agent, team and workflow pages | [agent.md](agent.md), [team.md](team.md), [workflow.md](workflow.md) |
| `src/pending/` | `PendingPanel`, `ConfirmForm`, `UserInputForm`, `FeedbackForm`, `StepReviewForm`, `ExternalToolCard`, `ApprovalNotice` — everything rendered while a run is paused | [confirmation-and-input.md](confirmation-and-input.md), [approvals.md](approvals.md) |
| `src/connection/` | `ConnectionContext` (endpoint + tokens, persisted to `localStorage`), `TargetsContext` (lists agents/teams/workflows via `useAgnoApi`) | [concepts/auth.md](concepts/auth.md) |
| `src/sessions/` | `SessionList` — lists and creates sessions via `api.sessions.*` | [sessions-and-history.md](sessions-and-history.md) |
| `src/tools/` | `frontendTools.ts` — the `FrontendTool` map (`get_location`, `get_local_time`) passed to `useAgnoAgent`/`useAgnoTeam` | [frontend-tools.md](frontend-tools.md) |

## Running against `e2e/agentos`

`examples/demo-agentos` is the full demo (real agents, JWT auth, per-user isolation) that
[getting-started.md](getting-started.md) walks through. `e2e/agentos` is a different, smaller
server: **not an example**, but the deterministic AgentOS fixture the SDK's own E2E suite runs
against in CI. It uses a `ScriptedModel` instead of an LLM (no API key needed, and every run is
reproducible), and it has **no auth configured** — so `demo-react`'s connection settings need only
an endpoint, no token.

Start it from the repo root:

```bash
bun run agentos
# or on a different port (7777 is often already taken):
AGNO_PORT=7778 bun run agentos
```

It registers four targets: agent `test-agent`, team `test-team`, workflow `test-workflow`, and
`test-workflow-hitl` (whose single step always pauses for human review before running). `ScriptedModel`
looks at the last user message, case-insensitively, and picks one of four scripts:

| trigger (message contains) | what happens |
|---|---|
| `ask` | Calls `ask_user` with one question (`Trail` / `Road`); the run pauses for user feedback (`user_feedback_schema`) |
| `locate` | Calls `get_location`, an `external_execution=True` tool; the run pauses and the frontend supplies the result |
| `tool` | Calls `add_one(x=41)`, a `requires_confirmation=True` tool; the run pauses for confirmation (HITL) |
| anything else | Answers `Echo: <message>`, streamed word by word |

`test-team`'s leader always delegates to `test-agent` first, so the same triggers fire on the
member; after any tool result the answer is `Done after tool.`. Point `demo-react` at it (endpoint
`http://localhost:7777`, or whatever `AGNO_PORT` you used, no token) to try any chapter's pause flow
against a server that never needs a model API key.
