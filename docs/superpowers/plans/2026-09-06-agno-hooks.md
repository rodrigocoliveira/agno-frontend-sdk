# `@rodrigocoliveira/agno-hooks` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@rodrigocoliveira/agno-hooks` 0.1.0: a per-session store (`createAgnoStore`) plus `useAgnoAgent` / `useAgnoTeam` / `useAgnoWorkflow`, with history hydrate, background streaming with resume, HITL in Agno's own vocabulary, frontend tool execution, and a Vite example app, all verified against `examples/agentos`.

**Architecture:** The unit of state is the **run**. Two pure functions per kind, `fromRow` (history rows from `GET /sessions/{id}/runs`) and `applyEvent` (SSE events), produce the same `Run`. `store/store.ts` owns the run list, opens streams through `store/stream.ts` (one consume loop with `event_index` dedupe and resume-based reconnection) and translates HITL decisions into the three wire shapes. React is a thin layer: a Provider holding one `AgnoApi` and a store registry, hooks on `useSyncExternalStore`.

**Tech Stack:** Bun 1.3.9 workspaces, TypeScript 5.9 strict, tsup (ESM+CJS+d.ts), `bun test`, `@testing-library/react` + `happy-dom` for hook tests, React 19 (peer `>=18`), Vite 6 for `examples/react`, Changesets. Server: `examples/agentos` (agno 3.0.6, `ScriptedModel`).

**Spec:** `docs/superpowers/specs/2026-09-06-agno-hooks-design.md` (binding). Spec 1, the client this package consumes: `docs/superpowers/specs/2026-09-06-agno-api-design.md`.

## Global Constraints

- Package name is exactly `@rodrigocoliveira/agno-hooks`, version `0.0.0` in `package.json` with a `minor` changeset (→ 0.1.0). Never `agno-react` (taken on npm).
- No HITL types of our own: the public API uses `ToolExecution`, `RunRequirement`, `StepRequirement` from `@rodrigocoliveira/agno-api`. The only wire translation is wrapping `requirements` / `step_requirements` in `continue`.
- The store never reads `chat_history` and never rebuilds a conversation from `run.messages`. History = `GET /sessions/{id}/runs`, one `Run` per row.
- `background: true` is the default on every `create` and `continue`; `stream: true` always (the store never uses `stream: false`).
- Reconnection: only when `background` is true, only after a real `run_id` exists, at most 3 attempts with delays `500, 1000, 2000` ms, `last_event_index` = last `event_index` seen. `AgnoApiError` (HTTP error) is never retried.
- One active run per store: `send` rejects with `Error('A run is already active')` when `isBusy`.
- `frontendTools` run only on a pause that arrives through a stream, never on hydrate; exceptions become `{ tool_call_error: true, result: <message> }`.
- Hydrate: `PENDING`/`RUNNING` rows → `resume` without index; `PAUSED` rows → `api.<kind>.runs.get` to recover `requirements`; team member rows (`parent_run_id` set) become `members` of their parent.
- Every source file has one responsibility; no file over ~300 lines except `store/store.ts`.
- All tests run with `bun test`; React tests need `--preload ./test/dom.ts` (happy-dom) and run only via the package `test` script. Root `bun run test` runs every package's `test` script.
- Commit after every task with the message given in the task. Commits carry `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

## File structure

```
packages/agno-api/src/types/hitl.ts        MODIFY: UserFeedbackQuestion fixed, UserFeedbackOption + StepRequirement added
packages/agno-api/src/types/events.ts      MODIFY: RunEventBase workflow fields, WorkflowPaused fields, TeamRunCompleted.member_responses
packages/agno-api/src/types/inputs.ts      MODIFY: WorkflowContinueInput.step_requirements: StepRequirement[]
packages/agno-api/src/types/run.ts         MODIFY: WorkflowRunOutput HITL fields, comment about requirements
packages/agno-api/test/types.check.ts      MODIFY: compile-time checks for the new types
packages/agno-api/README.md                MODIFY: agno-chat → agno-hooks
.github/CODEOWNERS                         MODIFY: stale comment
.changeset/agno-api-hitl-types.md          CREATE

packages/agno-hooks/package.json, tsconfig.json, tsup.config.ts, README.md, LICENSE
packages/agno-hooks/src/types.ts           Run model, Kind, Target, Snapshot, Pending, SendInput, ContinueExtra, FrontendTool, RunRowLike, AnyEvent, fromServerStatus, isTerminal
packages/agno-hooks/src/run/hitl.ts        isToolPending, pendingTools, confirm, reject, provideUserInput, provideUserFeedback, setExternalResult
packages/agno-hooks/src/run/base.ts        emptyBase, toEpochSeconds, textOf, upsertTool, applyBaseEvent, fromBaseRow (shared by agent and team)
packages/agno-hooks/src/run/agent.ts       createAgentRun, applyAgentEvent, fromAgentRow
packages/agno-hooks/src/run/team.ts        createTeamRun, applyTeamEvent (member routing), fromTeamRow, groupTeamRows
packages/agno-hooks/src/run/workflow.ts    createWorkflowRun, applyWorkflowEvent (step + executor routing), fromWorkflowRow, reconcileSteps
packages/agno-hooks/src/run/index.ts       createRun, applyEvent, fromRow, rowsToRuns (dispatch by kind)
packages/agno-hooks/src/store/routes.ts    routesFor(api, target): the only place that knows there are three targets
packages/agno-hooks/src/store/stream.ts    runStream: consume loop, meta events, event_index dedupe, reconnection
packages/agno-hooks/src/store/store.ts     createAgnoStore: snapshot, hydrate, send, continue, resolveTool, runTools, resume, cancel, destroy
packages/agno-hooks/src/react/provider.tsx AgnoProvider, useAgnoApi, store registry
packages/agno-hooks/src/react/hooks.ts     useAgnoAgent, useAgnoTeam, useAgnoWorkflow
packages/agno-hooks/src/index.ts
packages/agno-hooks/test/{hitl,run,store,react,e2e}/...
packages/agno-hooks/test/dom.ts            happy-dom preload for react tests

examples/agentos/scripted_model.py         MODIFY: ask_user and get_location scripts
examples/agentos/server.py                 MODIFY: UserFeedbackTools, get_location, test-workflow-hitl
examples/react/                            Vite app
package.json (root)                        test / test:e2e / example scripts
.github/workflows/ci.yml                   run package test scripts; build the example
```

---

### Task 1: agno-api type fixes the hooks depend on

**Files:**
- Modify: `packages/agno-api/src/types/hitl.ts`
- Modify: `packages/agno-api/src/types/events.ts`
- Modify: `packages/agno-api/src/types/inputs.ts`
- Modify: `packages/agno-api/src/types/run.ts`
- Modify: `packages/agno-api/test/types.check.ts`
- Modify: `packages/agno-api/README.md`, `.github/CODEOWNERS`
- Create: `.changeset/agno-api-hitl-types.md`

**Interfaces:**
- Produces: `UserFeedbackOption`, `UserFeedbackQuestion` (fixed), `StepRequirement`; `RunEventBase` with `workflow_run_id`, `step_id`, `step_name`, `step_index`, `nested_depth`; `WorkflowPaused` event with `step_requirements`, `pause_kind`, `paused_step_index`, `paused_step_name`, `step_results`, `step_executor_runs`; `TeamRunCompleted.member_responses`; `WorkflowContinueInput.step_requirements: StepRequirement[]`; `WorkflowRunOutput.step_requirements / pause_kind / paused_step_index / paused_step_name`.

- [ ] **Step 1: Fix `UserFeedbackQuestion` and add `StepRequirement` in `hitl.ts`**

Replace the existing `UserFeedbackQuestion` interface with:

```ts
/** `agno/tools/function.py` UserFeedbackOption */
export interface UserFeedbackOption {
  label: string
  description?: string | null
  selected?: boolean
}

/** `agno/tools/function.py` UserFeedbackQuestion — produced by the native `ask_user` tool (`UserFeedbackTools`). Answer with `selected_options` (labels). */
export interface UserFeedbackQuestion {
  question: string
  header?: string | null
  options?: UserFeedbackOption[] | null
  multi_select?: boolean
  selected_options?: string[] | null
}
```

Append at the end of the file:

```ts
/** `agno/workflow/types.py` StepRequirement — a workflow pause. `pause_kind: 'step'` = the workflow gated the step; `'executor'` = the step's agent/team paused (see `executor_requirements`). Only the LAST entry of `step_requirements` is active on continue. */
export interface StepRequirement {
  step_id: string
  step_name?: string | null
  step_index?: number | null
  step_type?: string | null
  requires_confirmation?: boolean
  confirmation_message?: string | null
  confirmed?: boolean | null
  on_reject?: string
  requires_user_input?: boolean
  user_input_message?: string | null
  user_input_schema?: UserInputField[] | null
  user_input?: Record<string, unknown> | null
  requires_route_selection?: boolean
  available_choices?: string[] | null
  allow_multiple_selections?: boolean
  selected_choices?: string[] | null
  step_input?: unknown
  requires_executor_input?: boolean
  executor_requirements?: RunRequirement[] | null
  executor_id?: string | null
  executor_name?: string | null
  executor_run_id?: string | null
  executor_type?: string | null
  executor_session_id?: string | null
  requires_output_review?: boolean
  output_review_message?: string | null
  step_output?: unknown
  is_post_execution?: boolean
  rejection_feedback?: string | null
  edited_output?: unknown
  retry_count?: number
  max_retries?: number | null
  timeout_at?: string | null
  on_timeout?: string
  created_at?: number
}
```

- [ ] **Step 2: Event fields in `events.ts`**

In `RunEventBase`, after `parent_run_id?: string | null`, add:

```ts
  /** Set on executor events inside a workflow stream (the step's agent/team run). */
  workflow_run_id?: string | null
  step_id?: string | null
  step_name?: string | null
  step_index?: number | string | null
  nested_depth?: number | null
```

Add `import type { StepRequirement } from './hitl'` to the existing hitl import line. Add next to `PausedFields`:

```ts
interface WorkflowPausedFields {
  status?: RunStatus
  paused_step_index?: number | null
  paused_step_name?: string | null
  pause_kind?: 'step' | 'executor' | (string & {}) | null
  step_requirements?: StepRequirement[] | null
  step_results?: unknown[] | null
  step_executor_runs?: unknown[] | null
  content?: unknown
  metadata?: Record<string, unknown> | null
}
```

In `WorkflowEventFields` replace `WorkflowPaused: PausedFields & { step_results?: unknown[] | null }` with `WorkflowPaused: WorkflowPausedFields`. In `TeamEventFields` replace `TeamRunCompleted: CompletedFields` with `TeamRunCompleted: CompletedFields & { member_responses?: unknown[] | null }`.

- [ ] **Step 3: `inputs.ts` and `run.ts`**

In `inputs.ts` change the import to `import type { RunRequirement, StepRequirement, ToolExecution } from './hitl'` and in `WorkflowContinueInput` change `step_requirements?: RunRequirement[]` to `step_requirements?: StepRequirement[]`, updating the doc comment to `/** Workflow: decisions travel inside step_requirements[] (StepRequirement, matched by step_id; only the last one is active). Sent as a JSON string. No fork/regenerate fields on this route. */`.

In `run.ts` import `StepRequirement` and extend `WorkflowRunOutput`:

```ts
export interface WorkflowRunOutput extends RunOutput {
  workflow_id?: string | null
  workflow_name?: string | null
  step_results?: unknown[] | null
  step_executor_runs?: (RunOutput | TeamRunOutput)[] | null
  step_requirements?: StepRequirement[] | null
  pause_kind?: 'step' | 'executor' | (string & {}) | null
  paused_step_index?: number | null
  paused_step_name?: string | null
}
```

Above `requirements?: RunRequirement[] | null` in `RunOutput` add the comment: `/** Present on GET .../runs/{run_id} (RunOutput.to_dict). NOT present on GET /sessions/{id}/runs (RunSchema drops it) — fetch the run to recover a paused team member's requirement. */`.

- [ ] **Step 4: Compile-time checks**

Append to `packages/agno-api/test/types.check.ts`:

```ts
// --- HITL types (spec 2 dependencies) ---
import type { StepRequirement, UserFeedbackQuestion, WorkflowRunEvent, WorkflowContinueInput } from '../src'

const q: UserFeedbackQuestion = { question: 'Where?', header: 'Use', options: [{ label: 'Trail', description: null }], multi_select: false, selected_options: ['Trail'] }
void q
const sr: StepRequirement = { step_id: 's1', requires_confirmation: true, confirmed: true }
const wc: WorkflowContinueInput = { step_requirements: [sr] }
void wc
type Paused = Extract<WorkflowRunEvent, { event: 'WorkflowPaused' }>
const wp: Paused = { event: 'WorkflowPaused', run_id: 'r', pause_kind: 'step', step_requirements: [sr], paused_step_index: 0 }
void wp
```

Run: `cd packages/agno-api && bun run typecheck`
Expected: exit 0.

- [ ] **Step 5: Docs and changeset**

In `packages/agno-api/README.md` replace every `@rodrigocoliveira/agno-chat` with `@rodrigocoliveira/agno-hooks`. Replace the whole content of `.github/CODEOWNERS` with:

```
# Repository owner is notified on every PR. Merge is gated by the `main` ruleset
# (PR required, squash only) — no CODEOWNER approval is required.
*  @rodrigocoliveira
```

Create `.changeset/agno-api-hitl-types.md`:

```md
---
"@rodrigocoliveira/agno-api": patch
---

Fix `UserFeedbackQuestion` (real fields: `header`, `options[{label, description, selected}]`, `multi_select`, `selected_options`), add `StepRequirement`, give `WorkflowPaused` its real fields, add the workflow executor fields (`workflow_run_id`, `step_id`, `step_name`, `step_index`) to every event.
```

- [ ] **Step 6: Run the package tests and commit**

Run: `cd packages/agno-api && bun test && bun run typecheck`
Expected: all green.

```bash
git add packages/agno-api .github/CODEOWNERS .changeset/agno-api-hitl-types.md
git commit -m "fix(agno-api): HITL types — UserFeedbackQuestion, StepRequirement, WorkflowPaused, executor event fields"
```

---

### Task 2: Scaffold `packages/agno-hooks` and the run model types

**Files:**
- Create: `packages/agno-hooks/package.json`, `tsconfig.json`, `tsup.config.ts`, `LICENSE` (copy of `packages/agno-api/LICENSE`), `src/types.ts`, `src/index.ts`, `test/dom.ts`, `test/types.test.ts`
- Modify: root `package.json` (`test`, `test:e2e` scripts), `.github/workflows/ci.yml` (`bun test packages` → `bun run test`)

**Interfaces:**
- Produces: everything in `src/types.ts` below. Later tasks import from `../types` / `../../src/types`.

- [ ] **Step 1: Package files**

`packages/agno-hooks/package.json`:

```json
{
  "name": "@rodrigocoliveira/agno-hooks",
  "version": "0.0.0",
  "description": "Session store and React hooks for AgentOS v3: agents, teams, workflows, HITL and frontend tools",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/rodrigocoliveira/agno-frontend-sdk.git",
    "directory": "packages/agno-hooks"
  },
  "homepage": "https://github.com/rodrigocoliveira/agno-frontend-sdk#readme",
  "bugs": "https://github.com/rodrigocoliveira/agno-frontend-sdk/issues",
  "keywords": ["agno", "agentos", "react", "hooks", "sdk", "hitl", "streaming"],
  "type": "module",
  "sideEffects": false,
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  },
  "files": ["dist", "README.md", "LICENSE"],
  "scripts": {
    "typecheck": "tsc -p tsconfig.json",
    "build": "tsup",
    "test": "bun test test/hitl test/run test/store test/types.test.ts && bun test --preload ./test/dom.ts test/react"
  },
  "peerDependencies": {
    "@rodrigocoliveira/agno-api": ">=0.1.0",
    "react": ">=18"
  },
  "devDependencies": {
    "@rodrigocoliveira/agno-api": "workspace:*",
    "@happy-dom/global-registrator": "^17.4.4",
    "@testing-library/react": "^16.3.0",
    "@types/react": "^19.1.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "tsup": "^8.5.1",
    "typescript": "^5.9.3"
  },
  "publishConfig": { "access": "public" }
}
```

`packages/agno-hooks/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "jsx": "react-jsx" },
  "include": ["src", "test"]
}
```

`packages/agno-hooks/tsup.config.ts`:

```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  external: ['react', '@rodrigocoliveira/agno-api'],
  outExtension: ({ format }) => ({ js: format === 'esm' ? '.js' : '.cjs' }),
})
```

`packages/agno-hooks/test/dom.ts`:

```ts
import { GlobalRegistrator } from '@happy-dom/global-registrator'

GlobalRegistrator.register()
```

Copy `packages/agno-api/LICENSE` to `packages/agno-hooks/LICENSE`. Then run `bun install` at the repo root (updates `bun.lock`).

- [ ] **Step 2: `src/types.ts`**

```ts
import type {
  AgentContinueInput, AgentRunInput, RunRequirement, StepRequirement, TeamContinueInput, TeamRunInput,
  ToolExecution, WorkflowContinueInput, WorkflowRunInput,
} from '@rodrigocoliveira/agno-api'

export type Kind = 'agent' | 'team' | 'workflow'
export type Target = { kind: Kind; id: string }

export type RunState = 'running' | 'paused' | 'completed' | 'error' | 'cancelled'

export interface RunInput {
  message: string
  files: File[]
  media: unknown | null
}

export interface RunMedia {
  images: unknown[]
  videos: unknown[]
  audio: unknown[]
  files: unknown[]
}

export interface RunBase {
  id: string
  sessionId: string | null
  status: RunState
  local: boolean
  input: RunInput
  content: string
  reasoning: string
  tools: ToolExecution[]
  requirements: RunRequirement[] | null
  media: RunMedia
  citations: unknown | null
  metrics: unknown | null
  error: string | null
  createdAt: number | null
  eventIndex: number | null
  raw: unknown | null
}

export interface AgentRun extends RunBase { kind: 'agent'; agentId: string }
export interface TeamRun extends RunBase { kind: 'team'; teamId: string; members: AgentRun[] }

export interface StepRun {
  id: string
  name: string
  index: number
  status: 'running' | 'completed' | 'paused' | 'error'
  content: string
  tools: ToolExecution[]
  executorRunId: string | null
  raw: unknown | null
}

export interface WorkflowRun extends RunBase {
  kind: 'workflow'
  workflowId: string
  steps: StepRun[]
  stepRequirements: StepRequirement[] | null
  pauseKind: 'step' | 'executor' | null
}

export type Run = AgentRun | TeamRun | WorkflowRun
export type RunOf<K extends Kind> = K extends 'agent' ? AgentRun : K extends 'team' ? TeamRun : WorkflowRun

type StoreOwned = 'stream' | 'background' | 'session_id'
export type SendInput<K extends Kind> = K extends 'agent'
  ? Omit<AgentRunInput, StoreOwned>
  : K extends 'team' ? Omit<TeamRunInput, StoreOwned> : Omit<WorkflowRunInput, StoreOwned>

export type ContinueExtra<K extends Kind> = K extends 'agent'
  ? Omit<AgentContinueInput, 'tools' | StoreOwned>
  : K extends 'team' ? Omit<TeamContinueInput, 'requirements' | StoreOwned> : Omit<WorkflowContinueInput, 'step_requirements' | StoreOwned>

export type Decision<K extends Kind> = K extends 'workflow' ? StepRequirement : ToolExecution

export type Pending<K extends Kind> = K extends 'workflow'
  ? { runId: string; stepRequirements: StepRequirement[] }
  : { runId: string; tools: ToolExecution[] }

export interface Snapshot<K extends Kind> {
  status: 'loading' | 'ready' | 'error'
  sessionId: string | null
  runs: RunOf<K>[]
  pending: Pending<K> | null
  isBusy: boolean
  error: Error | null
}

export type FrontendTool = (
  args: Record<string, unknown>,
  ctx: { run: Run; tool: ToolExecution; signal: AbortSignal },
) => unknown | Promise<unknown>

/** Any SSE event or /resume meta event, loosely typed. Reducers narrow by `event`. */
export type AnyEvent = { event: string; run_id?: string; [key: string]: unknown }

/** A row of GET /sessions/{id}/runs or a GET .../runs/{run_id} body. Only the fields the reducers read. */
export interface RunRowLike {
  run_id: string
  status?: string | null
  session_id?: string | null
  parent_run_id?: string | null
  agent_id?: string | null
  team_id?: string | null
  workflow_id?: string | null
  run_input?: string | null
  input?: unknown
  input_media?: unknown
  content?: unknown
  reasoning_content?: string | null
  tools?: ToolExecution[] | null
  requirements?: RunRequirement[] | null
  images?: unknown[] | null
  videos?: unknown[] | null
  audio?: unknown[] | null
  files?: unknown[] | null
  citations?: unknown
  metrics?: unknown
  created_at?: string | number | null
  step_results?: unknown[] | null
  step_executor_runs?: unknown[] | null
  step_requirements?: StepRequirement[] | null
  pause_kind?: string | null
}

export function fromServerStatus(status: string | null | undefined): RunState {
  switch (status) {
    case 'PAUSED': return 'paused'
    case 'COMPLETED':
    case 'REGENERATED': return 'completed'
    case 'CANCELLED': return 'cancelled'
    case 'ERROR': return 'error'
    default: return 'running' // PENDING, RUNNING, unknown
  }
}

export function isTerminal(status: RunState | undefined): boolean {
  return status === 'completed' || status === 'error' || status === 'cancelled'
}
```

`src/index.ts` for now:

```ts
export type * from './types'
export { fromServerStatus, isTerminal } from './types'
```

- [ ] **Step 3: Test**

`packages/agno-hooks/test/types.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { fromServerStatus, isTerminal } from '../src/types'

describe('fromServerStatus', () => {
  test('maps every RunStatus', () => {
    expect(fromServerStatus('PENDING')).toBe('running')
    expect(fromServerStatus('RUNNING')).toBe('running')
    expect(fromServerStatus('PAUSED')).toBe('paused')
    expect(fromServerStatus('COMPLETED')).toBe('completed')
    expect(fromServerStatus('REGENERATED')).toBe('completed')
    expect(fromServerStatus('CANCELLED')).toBe('cancelled')
    expect(fromServerStatus('ERROR')).toBe('error')
    expect(fromServerStatus(null)).toBe('running')
  })
  test('isTerminal', () => {
    expect(isTerminal('completed')).toBe(true)
    expect(isTerminal('error')).toBe(true)
    expect(isTerminal('cancelled')).toBe(true)
    expect(isTerminal('running')).toBe(false)
    expect(isTerminal('paused')).toBe(false)
  })
})
```

Run: `cd packages/agno-hooks && bun test test/types.test.ts && bun run typecheck`
Expected: PASS, typecheck exit 0.

- [ ] **Step 4: Root scripts and CI**

In the root `package.json` change:

```json
    "test": "bun run --filter './packages/*' test",
    "test:e2e": "AGNO_URL=${AGNO_URL:-http://localhost:7777} bun test packages/agno-api/test/e2e packages/agno-hooks/test/e2e",
```

In `.github/workflows/ci.yml`, job `ci`, replace `- run: bun test packages` with `- run: bun run test`.

Run: `bun run test` from the root. Expected: agno-api tests and the new agno-hooks test pass (the react folder does not exist yet: `bun test --preload ./test/dom.ts test/react` must not fail the script — create an empty placeholder `packages/agno-hooks/test/react/.gitkeep`; `bun test` on a folder with no test files exits 0).

- [ ] **Step 5: Commit**

```bash
git add packages/agno-hooks package.json bun.lock .github/workflows/ci.yml
git commit -m "feat(agno-hooks): scaffold package and run model types"
```

---

### Task 3: HITL helpers (`run/hitl.ts`)

**Files:**
- Create: `packages/agno-hooks/src/run/hitl.ts`, `packages/agno-hooks/test/hitl/hitl.test.ts`

**Interfaces:**
- Produces: `isToolPending(t)`, `pendingTools({ tools, requirements })`, `confirm(t, note?)`, `reject(t, note?)`, `provideUserInput(t, values)`, `provideUserFeedback(t, selections)`, `setExternalResult(t, result)`; all pure, all return new `ToolExecution` objects.

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, test } from 'bun:test'
import type { ToolExecution } from '@rodrigocoliveira/agno-api'
import { confirm, isToolPending, pendingTools, provideUserFeedback, provideUserInput, reject, setExternalResult } from '../../src/run/hitl'

const base = (over: Partial<ToolExecution>): ToolExecution => ({ tool_call_id: 'c1', tool_name: 't', tool_args: {}, ...over })

describe('isToolPending', () => {
  test('confirmation pending until confirmed is set', () => {
    expect(isToolPending(base({ requires_confirmation: true }))).toBe(true)
    expect(isToolPending(base({ requires_confirmation: true, confirmed: false }))).toBe(false)
  })
  test('user input pending until answered', () => {
    expect(isToolPending(base({ requires_user_input: true }))).toBe(true)
    expect(isToolPending(base({ requires_user_input: true, answered: true }))).toBe(false)
  })
  test('external pending until result', () => {
    expect(isToolPending(base({ external_execution_required: true }))).toBe(true)
    expect(isToolPending(base({ external_execution_required: true, result: 'ok' }))).toBe(false)
  })
  test('plain tool is never pending', () => {
    expect(isToolPending(base({ result: 'x' }))).toBe(false)
  })
})

describe('pendingTools', () => {
  test('requirements win over tools with the same id, filtered by isToolPending', () => {
    const t1 = base({ tool_call_id: 'c1', requires_confirmation: true })
    const t2 = base({ tool_call_id: 'c2', result: 'done' })
    const fromReq = base({ tool_call_id: 'c1', requires_confirmation: true, tool_name: 'member_tool' })
    const out = pendingTools({ tools: [t1, t2], requirements: [{ id: 'r1', tool_execution: fromReq, member_agent_id: 'm' }] })
    expect(out).toEqual([fromReq])
  })
  test('member-only requirement is included', () => {
    const m = base({ tool_call_id: 'c9', external_execution_required: true })
    expect(pendingTools({ tools: [], requirements: [{ id: 'r', tool_execution: m }] })).toEqual([m])
  })
})

describe('decision helpers return new objects in Agno vocabulary', () => {
  const t = base({ requires_confirmation: true })
  test('confirm / reject', () => {
    expect(confirm(t)).toMatchObject({ confirmed: true, confirmation_note: null })
    expect(reject(t, 'no')).toMatchObject({ confirmed: false, confirmation_note: 'no' })
    expect(t.confirmed).toBeUndefined()
  })
  test('provideUserInput fills values by field name and marks answered', () => {
    const u = base({ requires_user_input: true, user_input_schema: [{ name: 'city' }, { name: 'age', field_type: 'int' }] })
    const out = provideUserInput(u, { city: 'SP' })
    expect(out.answered).toBe(true)
    expect(out.user_input_schema).toEqual([{ name: 'city', value: 'SP' }, { name: 'age', field_type: 'int' }])
  })
  test('provideUserFeedback fills selected_options by question', () => {
    const f = base({ requires_user_input: true, user_feedback_schema: [{ question: 'Where?', options: [{ label: 'A' }, { label: 'B' }] }] })
    const out = provideUserFeedback(f, { 'Where?': ['B'] })
    expect(out.answered).toBe(true)
    expect(out.user_feedback_schema![0]!.selected_options).toEqual(['B'])
  })
  test('setExternalResult keeps strings and JSON-encodes everything else', () => {
    const e = base({ external_execution_required: true })
    expect(setExternalResult(e, 'ok').result).toBe('ok')
    expect(setExternalResult(e, { a: 1 }).result).toBe('{"a":1}')
    expect(setExternalResult(e, undefined).result).toBe('null')
  })
})
```

Run: `cd packages/agno-hooks && bun test test/hitl` — Expected: FAIL, module not found.

- [ ] **Step 2: Implementation**

`packages/agno-hooks/src/run/hitl.ts`:

```ts
import type { RunRequirement, ToolExecution } from '@rodrigocoliveira/agno-api'

/** Same rule the server uses (`RunRequirement.needs_*` in agno 3.0.6). */
export function isToolPending(t: ToolExecution): boolean {
  if (t.requires_confirmation === true && t.confirmed == null) return true
  if (t.requires_user_input === true && t.answered !== true) return true
  if (t.external_execution_required === true && t.result == null) return true
  return false
}

/** tools ∪ requirements[].tool_execution (requirements win: a team member's pause only lives there), filtered by isToolPending. */
export function pendingTools(run: { tools: ToolExecution[]; requirements: RunRequirement[] | null }): ToolExecution[] {
  const byId = new Map<string, ToolExecution>()
  for (const r of run.requirements ?? []) if (r.tool_execution) byId.set(r.tool_execution.tool_call_id, r.tool_execution)
  for (const t of run.tools) if (!byId.has(t.tool_call_id)) byId.set(t.tool_call_id, t)
  return [...byId.values()].filter(isToolPending)
}

export const confirm = (t: ToolExecution, note?: string): ToolExecution =>
  ({ ...t, confirmed: true, confirmation_note: note ?? t.confirmation_note ?? null })

export const reject = (t: ToolExecution, note?: string): ToolExecution =>
  ({ ...t, confirmed: false, confirmation_note: note ?? t.confirmation_note ?? null })

export function provideUserInput(t: ToolExecution, values: Record<string, unknown>): ToolExecution {
  const schema = (t.user_input_schema ?? []).map((f) => (f.name in values ? { ...f, value: values[f.name] } : f))
  return { ...t, answered: true, user_input_schema: schema }
}

/** `selections`: question text → selected option labels. */
export function provideUserFeedback(t: ToolExecution, selections: Record<string, string[]>): ToolExecution {
  const schema = (t.user_feedback_schema ?? []).map((q) =>
    q.question in selections ? { ...q, selected_options: selections[q.question] ?? [] } : q,
  )
  return { ...t, answered: true, user_feedback_schema: schema }
}

export function setExternalResult(t: ToolExecution, result: unknown): ToolExecution {
  return { ...t, result: typeof result === 'string' ? result : JSON.stringify(result ?? null) }
}
```

- [ ] **Step 3: Run, commit**

Run: `cd packages/agno-hooks && bun test test/hitl` — Expected: PASS.

```bash
git add packages/agno-hooks/src/run/hitl.ts packages/agno-hooks/test/hitl
git commit -m "feat(agno-hooks): HITL helpers in Agno vocabulary"
```

---

### Task 4: Base reducer and the agent run (`run/base.ts`, `run/agent.ts`)

**Files:**
- Create: `packages/agno-hooks/src/run/base.ts`, `packages/agno-hooks/src/run/agent.ts`, `packages/agno-hooks/test/run/agent.test.ts`

**Interfaces:**
- Produces (base): `emptyBase(over)`, `toEpochSeconds(v)`, `textOf(content)`, `upsertTool(tools, tool)`, `applyBaseEvent(run, ev)` (handles the UNPREFIXED agent event names), `fromBaseRow(run, row)`.
- Produces (agent): `createAgentRun(agentId, over?)`, `applyAgentEvent(run, ev)`, `fromAgentRow(row)`.
- Team (Task 5) reuses `applyBaseEvent` by stripping the `Team` prefix; workflow (Task 6) reuses `textOf` / `upsertTool`.

- [ ] **Step 1: Failing tests** — `test/run/agent.test.ts`

Event shapes below mirror a live capture from `examples/agentos` (agno 3.0.6).

```ts
import { describe, expect, test } from 'bun:test'
import type { AnyEvent } from '../../src/types'
import { applyAgentEvent, createAgentRun, fromAgentRow } from '../../src/run/agent'

const ev = (event: string, extra: Record<string, unknown> = {}): AnyEvent => ({ event, run_id: 'r1', session_id: 's1', agent_id: 'a', ...extra })
const tool = { tool_call_id: 'c1', tool_name: 'add_one', tool_args: { x: 41 } }

const stream: AnyEvent[] = [
  ev('RunStarted', { event_index: 0 }),
  ev('ModelRequestStarted'),
  ev('RunContent', { content: 'Echo: ', content_type: 'str', reasoning_content: '' }),
  ev('RunContent', { content: 'hi ', content_type: 'str' }),
  ev('ToolCallStarted', { tool }),
  ev('ToolCallCompleted', { tool: { ...tool, result: '42' } }),
  ev('RunContentCompleted'),
  ev('RunCompleted', { content: 'Echo: hi ', content_type: 'str', tools: [{ ...tool, result: '42' }], metrics: { duration: 1 }, images: [{ id: 'i' }], citations: { c: 1 } }),
]

describe('applyAgentEvent', () => {
  test('full happy path', () => {
    const run = stream.reduce(applyAgentEvent, createAgentRun('a', { id: 'local-1', status: 'running', local: true }))
    expect(run.id).toBe('r1')
    expect(run.sessionId).toBe('s1')
    expect(run.status).toBe('completed')
    expect(run.content).toBe('Echo: hi ')
    expect(run.tools).toEqual([{ ...tool, result: '42' }])
    expect(run.media.images).toEqual([{ id: 'i' }])
    expect(run.citations).toEqual({ c: 1 })
    expect(run.metrics).toEqual({ duration: 1 })
    expect(run.local).toBe(true)
    expect(run.raw).toBe(stream.at(-1))
  })
  test('content is appended only for str deltas; final content replaces', () => {
    let run = createAgentRun('a')
    run = applyAgentEvent(run, ev('RunContent', { content: 'a', content_type: 'str' }))
    run = applyAgentEvent(run, ev('RunContent', { content: { json: 1 }, content_type: 'json' }))
    run = applyAgentEvent(run, ev('RunContent', { content: 'b' }))
    expect(run.content).toBe('ab')
    run = applyAgentEvent(run, ev('RunCompleted', { content: { final: true } }))
    expect(run.content).toBe('{"final":true}')
  })
  test('reasoning accumulates from deltas and RunContent', () => {
    let run = createAgentRun('a')
    run = applyAgentEvent(run, ev('ReasoningContentDelta', { reasoning_content: 'think ' }))
    run = applyAgentEvent(run, ev('RunContent', { content: 'x', reasoning_content: 'more' }))
    expect(run.reasoning).toBe('think more')
    run = applyAgentEvent(run, ev('ReasoningCompleted', { reasoning_content: 'final' }))
    expect(run.reasoning).toBe('final')
  })
  test('pause keeps tools and requirements; continue resumes', () => {
    let run = createAgentRun('a')
    const paused = { ...tool, requires_confirmation: true }
    run = applyAgentEvent(run, ev('ToolCallStarted', { tool: paused }))
    run = applyAgentEvent(run, ev('RunPaused', { tools: [paused], requirements: [{ id: 'c1', tool_execution: paused }] }))
    expect(run.status).toBe('paused')
    expect(run.tools).toEqual([paused])
    expect(run.requirements).toEqual([{ id: 'c1', tool_execution: paused }])
    run = applyAgentEvent(run, ev('RunContinued'))
    expect(run.status).toBe('running')
    run = applyAgentEvent(run, ev('RunCompleted', { content: 'done', tools: [{ ...paused, confirmed: true, result: '42' }] }))
    expect(run.requirements).toBeNull()
    expect(run.tools[0]!.confirmed).toBe(true)
  })
  test('error and cancel', () => {
    expect(applyAgentEvent(createAgentRun('a'), ev('RunError', { error: 'boom' }))).toMatchObject({ status: 'error', error: 'boom' })
    expect(applyAgentEvent(createAgentRun('a'), ev('RunError', { content: 'bad' }))).toMatchObject({ status: 'error', error: 'bad' })
    expect(applyAgentEvent(createAgentRun('a'), ev('RunCancelled', { reason: 'user' }))).toMatchObject({ status: 'cancelled', error: 'user' })
  })
  test('unknown event returns the same reference', () => {
    const run = createAgentRun('a')
    expect(applyAgentEvent(run, ev('SomethingNew'))).toBe(run)
  })
})

describe('fromAgentRow', () => {
  test('history row and stream produce the same run', () => {
    const fromStream = stream.reduce(applyAgentEvent, createAgentRun('a', { id: 'local-1', status: 'running', local: true, input: { message: 'hi', files: [], media: null } }))
    const row = {
      run_id: 'r1', agent_id: 'a', session_id: 's1', status: 'COMPLETED', run_input: 'hi', content: 'Echo: hi ',
      tools: [{ ...tool, result: '42' }], metrics: { duration: 1 }, images: [{ id: 'i' }], citations: { c: 1 },
      created_at: '2026-09-06T10:00:00Z', messages: [{ role: 'user', content: 'hi' }],
    }
    const fromRow = fromAgentRow(row)
    for (const k of ['id', 'sessionId', 'status', 'content', 'tools', 'input'] as const) expect(fromRow[k]).toEqual(fromStream[k])
    expect(fromRow.local).toBe(false)
    expect(fromRow.createdAt).toBe(Date.parse('2026-09-06T10:00:00Z') / 1000)
    expect(fromRow.raw).toBe(row)
  })
  test('epoch created_at, paused status and object content', () => {
    const r = fromAgentRow({ run_id: 'r2', status: 'PAUSED', created_at: 1700000000, content: { a: 1 }, tools: [{ ...tool, requires_confirmation: true }], requirements: null })
    expect(r.createdAt).toBe(1700000000)
    expect(r.status).toBe('paused')
    expect(r.content).toBe('{"a":1}')
    expect(r.requirements).toBeNull()
  })
})
```

Run: `cd packages/agno-hooks && bun test test/run/agent.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 2: `src/run/base.ts`**

```ts
import type { RunRequirement, ToolExecution } from '@rodrigocoliveira/agno-api'
import { fromServerStatus, type AnyEvent, type RunBase, type RunRowLike } from '../types'

export function emptyBase(over: Partial<RunBase> = {}): RunBase {
  return {
    id: '', sessionId: null, status: 'running', local: false,
    input: { message: '', files: [], media: null },
    content: '', reasoning: '', tools: [], requirements: null,
    media: { images: [], videos: [], audio: [], files: [] },
    citations: null, metrics: null, error: null, createdAt: null, eventIndex: null, raw: null,
    ...over,
  }
}

/** ISO string (RunSchema) or epoch seconds (RunOutput / events) → epoch seconds. */
export function toEpochSeconds(v: unknown): number | null {
  if (typeof v === 'number') return v
  if (typeof v === 'string') { const ms = Date.parse(v); return Number.isNaN(ms) ? null : ms / 1000 }
  return null
}

export function textOf(content: unknown): string {
  if (content == null) return ''
  return typeof content === 'string' ? content : JSON.stringify(content)
}

export function upsertTool(tools: ToolExecution[], tool: ToolExecution): ToolExecution[] {
  const i = tools.findIndex((t) => t.tool_call_id === tool.tool_call_id)
  if (i === -1) return [...tools, tool]
  const next = tools.slice(); next[i] = tool; return next
}

const isStr = (ev: AnyEvent) => ev.content_type == null || ev.content_type === 'str'
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
const arr = (v: unknown): unknown[] | null => (Array.isArray(v) ? v : null)

/** Reducer for the agent event family (unprefixed names). Unknown events return the same reference. */
export function applyBaseEvent<R extends RunBase>(run: R, ev: AnyEvent): R {
  switch (ev.event) {
    case 'RunStarted':
      return { ...run, id: typeof ev.run_id === 'string' ? ev.run_id : run.id, sessionId: str(ev.session_id) ?? run.sessionId, status: 'running' }
    case 'RunContent': {
      const content = isStr(ev) && typeof ev.content === 'string' ? run.content + ev.content : run.content
      const rc = str(ev.reasoning_content)
      const reasoning = rc ? run.reasoning + rc : run.reasoning
      return content === run.content && reasoning === run.reasoning ? run : { ...run, content, reasoning }
    }
    case 'ReasoningContentDelta': {
      const rc = str(ev.reasoning_content)
      return rc ? { ...run, reasoning: run.reasoning + rc } : run
    }
    case 'ReasoningStep':
    case 'ReasoningCompleted': {
      const rc = str(ev.reasoning_content)
      return rc ? { ...run, reasoning: rc } : run
    }
    case 'ToolCallStarted':
    case 'ToolCallCompleted':
    case 'ToolCallError':
      return ev.tool && typeof ev.tool === 'object' ? { ...run, tools: upsertTool(run.tools, ev.tool as ToolExecution) } : run
    case 'RunPaused': {
      let tools = run.tools
      for (const t of (arr(ev.tools) ?? []) as ToolExecution[]) tools = upsertTool(tools, t)
      return { ...run, status: 'paused', tools, requirements: (arr(ev.requirements) as RunRequirement[] | null) ?? null }
    }
    case 'RunContinued':
      return { ...run, status: 'running' }
    case 'RunCompleted':
      return {
        ...run,
        status: 'completed',
        content: ev.content == null ? run.content : textOf(ev.content),
        reasoning: str(ev.reasoning_content) ?? run.reasoning,
        tools: (arr(ev.tools) as ToolExecution[] | null) ?? run.tools,
        requirements: null,
        media: {
          images: arr(ev.images) ?? run.media.images, videos: arr(ev.videos) ?? run.media.videos,
          audio: arr(ev.audio) ?? run.media.audio, files: arr(ev.files) ?? run.media.files,
        },
        citations: ev.citations ?? run.citations,
        metrics: ev.metrics ?? run.metrics,
        raw: ev,
      }
    case 'RunError':
      return { ...run, status: 'error', error: str(ev.error) ?? str(ev.content) ?? 'Run failed', raw: ev }
    case 'RunCancelled':
      return { ...run, status: 'cancelled', error: str(ev.reason), raw: ev }
    default:
      return run
  }
}

export function fromBaseRow<R extends RunBase>(run: R, row: RunRowLike): R {
  return {
    ...run,
    id: row.run_id,
    sessionId: row.session_id ?? run.sessionId,
    status: fromServerStatus(row.status),
    local: false,
    input: { message: typeof row.run_input === 'string' ? row.run_input : textOf(row.input), files: [], media: row.input_media ?? null },
    content: textOf(row.content),
    reasoning: row.reasoning_content ?? '',
    tools: row.tools ?? [],
    requirements: row.requirements ?? null,
    media: { images: row.images ?? [], videos: row.videos ?? [], audio: row.audio ?? [], files: row.files ?? [] },
    citations: row.citations ?? null,
    metrics: row.metrics ?? null,
    createdAt: toEpochSeconds(row.created_at),
    raw: row,
  }
}
```

- [ ] **Step 3: `src/run/agent.ts`**

```ts
import type { AgentRun, AnyEvent, RunRowLike } from '../types'
import { applyBaseEvent, emptyBase, fromBaseRow } from './base'

export function createAgentRun(agentId: string, over: Partial<AgentRun> = {}): AgentRun {
  return { ...emptyBase(), kind: 'agent', agentId, ...over }
}

export function applyAgentEvent(run: AgentRun, ev: AnyEvent): AgentRun {
  return applyBaseEvent(run, ev)
}

export function fromAgentRow(row: RunRowLike): AgentRun {
  return fromBaseRow(createAgentRun(row.agent_id ?? ''), row)
}
```

- [ ] **Step 4: Run, typecheck, commit**

Run: `cd packages/agno-hooks && bun test test/run/agent.test.ts && bun run typecheck` — Expected: PASS.

```bash
git add packages/agno-hooks/src/run packages/agno-hooks/test/run
git commit -m "feat(agno-hooks): base reducer and agent run"
```

---

### Task 5: Team run (`run/team.ts`)

**Files:**
- Create: `packages/agno-hooks/src/run/team.ts`, `packages/agno-hooks/test/run/team.test.ts`

**Interfaces:**
- Consumes: `applyBaseEvent`, `emptyBase`, `fromBaseRow` (Task 4), `createAgentRun`, `applyAgentEvent`, `fromAgentRow` (Task 4).
- Produces: `createTeamRun(teamId, over?)`, `applyTeamEvent(run, ev)`, `fromTeamRow(row)`, `groupTeamRows(rows): TeamRun[]`.

Wire facts (captured): team-level events are named `Team*` with `run_id` = team run; member events keep agent names (`RunStarted`, `RunContent`, `ToolCallStarted`...) with `run_id` = member run and `parent_run_id` = team run. `GET /sessions/{id}/runs` lists member runs as separate rows with `parent_run_id`.

- [ ] **Step 1: Failing tests** — `test/run/team.test.ts`

```ts
import { describe, expect, test } from 'bun:test'
import type { AnyEvent } from '../../src/types'
import { applyTeamEvent, createTeamRun, fromTeamRow, groupTeamRows } from '../../src/run/team'

const team = (event: string, extra: Record<string, unknown> = {}): AnyEvent => ({ event, run_id: 't1', session_id: 's1', team_id: 'team', ...extra })
const member = (event: string, extra: Record<string, unknown> = {}): AnyEvent => ({ event, run_id: 'm1', parent_run_id: 't1', agent_id: 'agent', session_id: 's1', ...extra })
const delegate = { tool_call_id: 'd1', tool_name: 'delegate_task_to_member', tool_args: { member_id: 'agent', task: 'hi' } }

const stream: AnyEvent[] = [
  team('TeamRunStarted'),
  team('TeamToolCallStarted', { tool: delegate }),
  member('RunStarted'),
  member('RunContent', { content: 'Echo: ', content_type: 'str' }),
  member('RunContent', { content: 'hi ', content_type: 'str' }),
  member('RunCompleted', { content: 'Echo: hi ' }),
  team('TeamToolCallCompleted', { tool: { ...delegate, result: 'Echo: hi ' } }),
  team('TeamRunContent', { content: 'Done ', content_type: 'str' }),
  team('TeamRunCompleted', { content: 'Done ', member_responses: [{ run_id: 'm1' }] }),
]

describe('applyTeamEvent', () => {
  test('team events drive the run, member events drive members', () => {
    const run = stream.reduce(applyTeamEvent, createTeamRun('team', { id: 'local-1', local: true }))
    expect(run.id).toBe('t1')
    expect(run.status).toBe('completed')
    expect(run.content).toBe('Done ')
    expect(run.tools).toEqual([{ ...delegate, result: 'Echo: hi ' }])
    expect(run.members).toHaveLength(1)
    expect(run.members[0]).toMatchObject({ kind: 'agent', id: 'm1', agentId: 'agent', status: 'completed', content: 'Echo: hi ', local: false })
  })
  test('member pause propagates through TeamRunPaused.requirements, not tools', () => {
    const t = { tool_call_id: 'c1', tool_name: 'add_one', tool_args: { x: 1 }, requires_confirmation: true }
    let run = createTeamRun('team', { id: 't1' })
    run = applyTeamEvent(run, member('RunStarted'))
    run = applyTeamEvent(run, member('ToolCallStarted', { tool: t }))
    run = applyTeamEvent(run, member('RunPaused', { tools: [t] }))
    run = applyTeamEvent(run, team('TeamRunPaused', { tools: [], requirements: [{ id: 'req1', tool_execution: t, member_agent_id: 'agent', member_run_id: 'm1' }] }))
    expect(run.status).toBe('paused')
    expect(run.tools).toEqual([])
    expect(run.requirements![0]!.member_run_id).toBe('m1')
    expect(run.members[0]!.status).toBe('paused')
  })
  test('unrelated run ids are ignored', () => {
    const run = createTeamRun('team', { id: 't1' })
    expect(applyTeamEvent(run, { event: 'RunContent', run_id: 'zzz', content: 'x' })).toBe(run)
  })
})

describe('groupTeamRows / fromTeamRow', () => {
  test('member rows attach to their parent by parent_run_id, ordered by created_at', () => {
    const rows = [
      { run_id: 'm2', agent_id: 'agent', parent_run_id: 't1', status: 'COMPLETED', created_at: 20 },
      { run_id: 't1', team_id: 'team', status: 'COMPLETED', run_input: 'hi', content: 'Done', created_at: 5 },
      { run_id: 'm1', agent_id: 'agent', parent_run_id: 't1', status: 'COMPLETED', created_at: 10 },
      { run_id: 'orphan', agent_id: 'agent', parent_run_id: 'nope', status: 'COMPLETED', created_at: 1 },
    ]
    const runs = groupTeamRows(rows)
    expect(runs.map((r) => r.id)).toEqual(['t1'])
    expect(runs[0]!.members.map((m) => m.id)).toEqual(['m1', 'm2'])
    expect(runs[0]!.teamId).toBe('team')
  })
  test('fromTeamRow keeps members empty', () => {
    expect(fromTeamRow({ run_id: 't9', team_id: 'team', status: 'RUNNING' })).toMatchObject({ kind: 'team', id: 't9', status: 'running', members: [] })
  })
})
```

Run: `bun test test/run/team.test.ts` — Expected: FAIL.

- [ ] **Step 2: `src/run/team.ts`**

```ts
import type { AnyEvent, RunRowLike, TeamRun } from '../types'
import { applyAgentEvent, createAgentRun, fromAgentRow } from './agent'
import { applyBaseEvent, emptyBase, fromBaseRow } from './base'

export function createTeamRun(teamId: string, over: Partial<TeamRun> = {}): TeamRun {
  return { ...emptyBase(), kind: 'team', teamId, members: [], ...over }
}

export function applyTeamEvent(run: TeamRun, ev: AnyEvent): TeamRun {
  // A member's event: same run id as one of ours, or parented to this team run.
  if (typeof ev.run_id === 'string' && ev.run_id !== run.id && ev.parent_run_id === run.id) {
    const i = run.members.findIndex((m) => m.id === ev.run_id)
    const current = i === -1
      ? createAgentRun(typeof ev.agent_id === 'string' ? ev.agent_id : '', { id: ev.run_id, sessionId: run.sessionId })
      : run.members[i]!
    const next = applyAgentEvent(current, ev)
    if (i !== -1 && next === current) return run
    const members = run.members.slice()
    if (i === -1) members.push(next); else members[i] = next
    return { ...run, members }
  }
  if (ev.event.startsWith('Team')) return applyBaseEvent(run, { ...ev, event: ev.event.slice(4) })
  return run
}

export function fromTeamRow(row: RunRowLike): TeamRun {
  return fromBaseRow(createTeamRun(row.team_id ?? ''), row)
}

/** Rows of a team session: team runs at the top, member rows (parent_run_id) nested in `members`. Orphans are dropped with a warning. */
export function groupTeamRows(rows: RunRowLike[]): TeamRun[] {
  const teams = new Map<string, TeamRun>()
  for (const row of rows) if (!row.parent_run_id) teams.set(row.run_id, fromTeamRow(row))
  for (const row of rows) {
    if (!row.parent_run_id) continue
    const parent = teams.get(row.parent_run_id)
    if (!parent) { console.warn(`[agno-hooks] member run ${row.run_id} has unknown parent ${row.parent_run_id}`); continue }
    parent.members = [...parent.members, fromAgentRow(row)]
  }
  const byTime = (a: { createdAt: number | null }, b: { createdAt: number | null }) => (a.createdAt ?? 0) - (b.createdAt ?? 0)
  const out = [...teams.values()].sort(byTime)
  for (const t of out) t.members = t.members.slice().sort(byTime)
  return out
}
```

- [ ] **Step 3: Run, commit**

Run: `cd packages/agno-hooks && bun test test/run && bun run typecheck` — Expected: PASS.

```bash
git add packages/agno-hooks/src/run/team.ts packages/agno-hooks/test/run/team.test.ts
git commit -m "feat(agno-hooks): team run with member routing"
```

---

### Task 6: Workflow run (`run/workflow.ts`) and the kind dispatcher (`run/index.ts`)

**Files:**
- Create: `packages/agno-hooks/src/run/workflow.ts`, `packages/agno-hooks/src/run/index.ts`, `packages/agno-hooks/test/run/workflow.test.ts`

**Interfaces:**
- Produces: `createWorkflowRun(workflowId, over?)`, `applyWorkflowEvent(run, ev)`, `fromWorkflowRow(row)`, `reconcileSteps(steps, stepResults)`; dispatcher `createRun(kind, targetId, over?)`, `applyEvent(run, ev)`, `fromRow(kind, row)`, `rowsToRuns(kind, rows)`.

Wire facts (captured): the workflow stream carries the step executor's own events (`RunStarted`, `RunContent`, `ToolCallStarted`, `RunCompleted`, or `Team*` for a team step) with `run_id` = executor run, `workflow_run_id` = workflow run, `step_id`, `step_name`, `step_index`. `StepStarted` / `StepCompleted` / `WorkflowCompleted` have `run_id` = workflow run. `step_results[]` items carry `step_id`, `step_name`, `content`, `step_run_id` (the executor run id), `success`.

- [ ] **Step 1: Failing tests** — `test/run/workflow.test.ts`

```ts
import { describe, expect, test } from 'bun:test'
import type { AnyEvent } from '../../src/types'
import { applyWorkflowEvent, createWorkflowRun, fromWorkflowRow } from '../../src/run/workflow'
import { applyEvent, createRun, fromRow, rowsToRuns } from '../../src/run'

const wf = (event: string, extra: Record<string, unknown> = {}): AnyEvent => ({ event, run_id: 'w1', session_id: 's1', workflow_id: 'wf', ...extra })
const step = { step_id: 'st1', step_name: 'echo', step_index: 0 }
const exec = (event: string, extra: Record<string, unknown> = {}): AnyEvent => ({ event, run_id: 'x1', agent_id: 'agent', workflow_run_id: 'w1', ...step, ...extra })
const result = { step_id: 'st1', step_name: 'echo', content: 'Echo: hi ', step_run_id: 'x1', success: true }

const stream: AnyEvent[] = [
  wf('WorkflowStarted'),
  wf('StepStarted', step),
  exec('RunStarted'),
  exec('RunContent', { content: 'Echo: ', content_type: 'str' }),
  exec('ToolCallStarted', { tool: { tool_call_id: 'c1', tool_name: 'add_one', tool_args: {} } }),
  exec('RunContent', { content: 'hi ', content_type: 'str' }),
  exec('RunCompleted', { content: 'Echo: hi ' }),
  wf('StepCompleted', { ...step, content: 'Echo: hi ', step_response: result }),
  wf('WorkflowCompleted', { content: 'Echo: hi ', step_results: [result], metrics: { steps: {} } }),
]

describe('applyWorkflowEvent', () => {
  test('steps are built from StepStarted and fed by executor events', () => {
    const run = stream.reduce(applyWorkflowEvent, createWorkflowRun('wf', { id: 'local-1', local: true }))
    expect(run.id).toBe('w1')
    expect(run.status).toBe('completed')
    expect(run.content).toBe('Echo: hi ')
    expect(run.steps).toHaveLength(1)
    expect(run.steps[0]).toMatchObject({ id: 'st1', name: 'echo', index: 0, status: 'completed', content: 'Echo: hi ', executorRunId: 'x1' })
    expect(run.steps[0]!.tools[0]!.tool_name).toBe('add_one')
    expect(run.steps[0]!.raw).toEqual(result)
  })
  test('executor event before StepStarted creates the step', () => {
    const run = applyWorkflowEvent(createWorkflowRun('wf', { id: 'w1' }), exec('RunContent', { content: 'x', content_type: 'str' }))
    expect(run.steps[0]).toMatchObject({ id: 'st1', name: 'echo', index: 0, content: 'x', status: 'running' })
  })
  test('WorkflowPaused exposes step requirements and pause kind', () => {
    const sr = { step_id: 'st1', step_name: 'echo', requires_confirmation: true }
    let run = applyWorkflowEvent(createWorkflowRun('wf', { id: 'w1' }), wf('StepStarted', step))
    run = applyWorkflowEvent(run, wf('StepPaused', step))
    run = applyWorkflowEvent(run, wf('WorkflowPaused', { pause_kind: 'step', step_requirements: [sr], paused_step_index: 0 }))
    expect(run.status).toBe('paused')
    expect(run.pauseKind).toBe('step')
    expect(run.stepRequirements).toEqual([sr])
    expect(run.steps[0]!.status).toBe('paused')
    run = applyWorkflowEvent(run, wf('StepContinued', step))
    expect(run.status).toBe('running')
    expect(run.steps[0]!.status).toBe('running')
    run = applyWorkflowEvent(run, wf('WorkflowCompleted', { content: 'ok', step_results: [result] }))
    expect(run.stepRequirements).toBeNull()
    expect(run.pauseKind).toBeNull()
  })
  test('error / cancel', () => {
    expect(applyWorkflowEvent(createWorkflowRun('wf'), wf('WorkflowError', { error: 'x' }))).toMatchObject({ status: 'error', error: 'x' })
    expect(applyWorkflowEvent(createWorkflowRun('wf'), wf('WorkflowCancelled', { reason: 'r' }))).toMatchObject({ status: 'cancelled' })
  })
})

describe('fromWorkflowRow', () => {
  test('steps from step_results; paused fields', () => {
    const row = { run_id: 'w1', workflow_id: 'wf', status: 'PAUSED', run_input: 'hi', content: null, step_results: [result], step_requirements: [{ step_id: 'st1', requires_confirmation: true }], pause_kind: 'step', created_at: '2026-09-06T00:00:00Z' }
    const run = fromWorkflowRow(row)
    expect(run).toMatchObject({ kind: 'workflow', workflowId: 'wf', status: 'paused', pauseKind: 'step', input: { message: 'hi' } })
    expect(run.steps[0]).toMatchObject({ id: 'st1', name: 'echo', content: 'Echo: hi ', executorRunId: 'x1', status: 'completed' })
    expect(run.stepRequirements![0]!.step_id).toBe('st1')
  })
  test('row and stream agree', () => {
    const fromStream = stream.reduce(applyWorkflowEvent, createWorkflowRun('wf', { id: 'local', local: true, input: { message: 'hi', files: [], media: null } }))
    const fromR = fromWorkflowRow({ run_id: 'w1', workflow_id: 'wf', session_id: 's1', status: 'COMPLETED', run_input: 'hi', content: 'Echo: hi ', step_results: [result] })
    for (const k of ['id', 'status', 'content', 'input'] as const) expect(fromR[k]).toEqual(fromStream[k])
    expect(fromR.steps.map((s) => [s.id, s.content, s.status])).toEqual(fromStream.steps.map((s) => [s.id, s.content, s.status]))
  })
})

describe('dispatcher', () => {
  test('createRun / applyEvent / fromRow / rowsToRuns by kind', () => {
    expect(createRun('agent', 'a').kind).toBe('agent')
    expect(createRun('team', 't').kind).toBe('team')
    expect(createRun('workflow', 'w').kind).toBe('workflow')
    expect(applyEvent(createRun('workflow', 'w'), wf('WorkflowStarted')).id).toBe('w1')
    expect(fromRow('team', { run_id: 't1', team_id: 't', status: 'COMPLETED' }).kind).toBe('team')
    const rows = [{ run_id: 'b', agent_id: 'a', status: 'COMPLETED', created_at: 2 }, { run_id: 'a', agent_id: 'a', status: 'COMPLETED', created_at: 1 }]
    expect(rowsToRuns('agent', rows).map((r) => r.id)).toEqual(['a', 'b'])
    expect(rowsToRuns('team', [{ run_id: 'm', agent_id: 'a', parent_run_id: 't1', status: 'COMPLETED' }, { run_id: 't1', team_id: 't', status: 'COMPLETED' }])[0]!.members).toHaveLength(1)
  })
})
```

Run: `bun test test/run/workflow.test.ts` — Expected: FAIL.

- [ ] **Step 2: `src/run/workflow.ts`**

```ts
import type { StepRequirement, ToolExecution } from '@rodrigocoliveira/agno-api'
import type { AnyEvent, RunRowLike, StepRun, WorkflowRun } from '../types'
import { emptyBase, fromBaseRow, textOf, toEpochSeconds, upsertTool } from './base'

export function createWorkflowRun(workflowId: string, over: Partial<WorkflowRun> = {}): WorkflowRun {
  return { ...emptyBase(), kind: 'workflow', workflowId, steps: [], stepRequirements: null, pauseKind: null, ...over }
}

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
const stepKey = (ev: AnyEvent): string | null => str(ev.step_id) ?? str(ev.step_name)

function upsertStep(steps: StepRun[], id: string, seed: Partial<StepRun>, patch: (s: StepRun) => StepRun): StepRun[] {
  const i = steps.findIndex((s) => s.id === id)
  const current: StepRun = i === -1
    ? { status: 'running', content: '', tools: [], executorRunId: null, raw: null, ...seed, id, name: seed.name ?? id, index: seed.index ?? steps.length }
    : steps[i]!
  const next = patch(current)
  if (i !== -1 && next === current) return steps
  const out = steps.slice()
  if (i === -1) out.push(next); else out[i] = next
  return out
}

const seedFrom = (ev: AnyEvent): Partial<StepRun> => ({
  name: str(ev.step_name) ?? undefined,
  index: ev.step_index == null || Number.isNaN(Number(ev.step_index)) ? undefined : Number(ev.step_index),
})

/** step_results[] → StepRun[] (merge by step_id, then step_name). */
export function reconcileSteps(steps: StepRun[], stepResults: unknown): StepRun[] {
  if (!Array.isArray(stepResults)) return steps
  let out = steps
  stepResults.forEach((r, i) => {
    if (!r || typeof r !== 'object') return
    const res = r as Record<string, unknown>
    const id = str(res.step_id) ?? str(res.step_name)
    if (!id) return
    out = upsertStep(out, id, { name: str(res.step_name) ?? undefined, index: i }, (s) => ({
      ...s,
      status: res.success === false ? 'error' : 'completed',
      content: res.content == null ? s.content : textOf(res.content),
      executorRunId: str(res.step_run_id) ?? s.executorRunId,
      raw: res,
    }))
  })
  return out
}

function applyExecutorEvent(run: WorkflowRun, ev: AnyEvent): WorkflowRun {
  const id = stepKey(ev)
  if (!id) return run
  const name = ev.event.startsWith('Team') ? ev.event.slice(4) : ev.event
  const steps = upsertStep(run.steps, id, seedFrom(ev), (s) => {
    switch (name) {
      case 'RunStarted': return { ...s, executorRunId: str(ev.run_id) ?? s.executorRunId }
      case 'RunContent': return (ev.content_type == null || ev.content_type === 'str') && typeof ev.content === 'string' ? { ...s, content: s.content + ev.content } : s
      case 'RunCompleted': return { ...s, content: ev.content == null ? s.content : textOf(ev.content), executorRunId: str(ev.run_id) ?? s.executorRunId }
      case 'ToolCallStarted': case 'ToolCallCompleted': case 'ToolCallError':
        return ev.tool && typeof ev.tool === 'object' ? { ...s, tools: upsertTool(s.tools, ev.tool as ToolExecution) } : s
      default: return s
    }
  })
  return steps === run.steps ? run : { ...run, steps }
}

export function applyWorkflowEvent(run: WorkflowRun, ev: AnyEvent): WorkflowRun {
  if (typeof ev.run_id === 'string' && ev.run_id !== run.id && ev.workflow_run_id === run.id) return applyExecutorEvent(run, ev)
  const setStep = (status: StepRun['status'], extra: (s: StepRun) => Partial<StepRun> = () => ({})) => {
    const id = stepKey(ev)
    return id ? upsertStep(run.steps, id, seedFrom(ev), (s) => ({ ...s, status, ...extra(s) })) : run.steps
  }
  switch (ev.event) {
    case 'WorkflowStarted':
      return { ...run, id: typeof ev.run_id === 'string' ? ev.run_id : run.id, sessionId: str(ev.session_id) ?? run.sessionId, status: 'running' }
    case 'StepStarted':
      return { ...run, steps: setStep('running') }
    case 'StepCompleted':
      return { ...run, steps: setStep('completed', (s) => ({ content: ev.content == null ? s.content : textOf(ev.content), raw: ev.step_response ?? s.raw })) }
    case 'StepError':
      return { ...run, steps: setStep('error') }
    case 'StepPaused': case 'StepExecutorPaused': case 'ConditionPaused': case 'RouterPaused':
      return { ...run, steps: setStep('paused') }
    case 'StepContinued': case 'StepExecutorContinued':
      return { ...run, status: 'running', steps: setStep('running') }
    case 'WorkflowPaused':
      return {
        ...run, status: 'paused',
        stepRequirements: (Array.isArray(ev.step_requirements) ? ev.step_requirements as StepRequirement[] : null),
        pauseKind: ev.pause_kind === 'step' || ev.pause_kind === 'executor' ? ev.pause_kind : null,
        steps: reconcileSteps(run.steps, ev.step_results),
      }
    case 'WorkflowCompleted':
      return {
        ...run, status: 'completed',
        content: ev.content == null ? run.content : textOf(ev.content),
        steps: reconcileSteps(run.steps, ev.step_results),
        stepRequirements: null, pauseKind: null,
        metrics: ev.metrics ?? run.metrics,
        media: {
          images: Array.isArray(ev.images) ? ev.images : run.media.images, videos: Array.isArray(ev.videos) ? ev.videos : run.media.videos,
          audio: Array.isArray(ev.audio) ? ev.audio : run.media.audio, files: Array.isArray(ev.files) ? ev.files : run.media.files,
        },
        raw: ev,
      }
    case 'WorkflowError':
      return { ...run, status: 'error', error: str(ev.error) ?? str(ev.content) ?? 'Workflow failed', raw: ev }
    case 'WorkflowCancelled':
      return { ...run, status: 'cancelled', error: str(ev.reason), raw: ev }
    default:
      return run
  }
}

export function fromWorkflowRow(row: RunRowLike): WorkflowRun {
  const base = fromBaseRow(createWorkflowRun(row.workflow_id ?? ''), row)
  return {
    ...base,
    createdAt: toEpochSeconds(row.created_at),
    steps: reconcileSteps([], row.step_results),
    stepRequirements: row.step_requirements ?? null,
    pauseKind: row.pause_kind === 'step' || row.pause_kind === 'executor' ? row.pause_kind : null,
  }
}
```

- [ ] **Step 3: `src/run/index.ts`**

```ts
import type { AnyEvent, Kind, Run, RunOf, RunRowLike } from '../types'
import { applyAgentEvent, createAgentRun, fromAgentRow } from './agent'
import { applyTeamEvent, createTeamRun, fromTeamRow, groupTeamRows } from './team'
import { applyWorkflowEvent, createWorkflowRun, fromWorkflowRow } from './workflow'

export function createRun<K extends Kind>(kind: K, targetId: string, over: Partial<RunOf<K>> = {}): RunOf<K> {
  switch (kind) {
    case 'agent': return createAgentRun(targetId, over as never) as RunOf<K>
    case 'team': return createTeamRun(targetId, over as never) as RunOf<K>
    default: return createWorkflowRun(targetId, over as never) as RunOf<K>
  }
}

export function applyEvent<R extends Run>(run: R, ev: AnyEvent): R {
  switch (run.kind) {
    case 'agent': return applyAgentEvent(run, ev) as R
    case 'team': return applyTeamEvent(run, ev) as R
    default: return applyWorkflowEvent(run, ev) as R
  }
}

export function fromRow<K extends Kind>(kind: K, row: RunRowLike): RunOf<K> {
  switch (kind) {
    case 'agent': return fromAgentRow(row) as RunOf<K>
    case 'team': return fromTeamRow(row) as RunOf<K>
    default: return fromWorkflowRow(row) as RunOf<K>
  }
}

/** Session rows → runs, oldest first. Team rows are grouped (members nested). */
export function rowsToRuns<K extends Kind>(kind: K, rows: RunRowLike[]): RunOf<K>[] {
  if (kind === 'team') return groupTeamRows(rows) as RunOf<K>[]
  return rows.map((r) => fromRow(kind, r)).sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
}

export * from './agent'
export * from './team'
export * from './workflow'
export * from './hitl'
```

- [ ] **Step 4: Run, commit**

Run: `cd packages/agno-hooks && bun test test/run test/hitl && bun run typecheck` — Expected: PASS.

```bash
git add packages/agno-hooks/src/run packages/agno-hooks/test/run
git commit -m "feat(agno-hooks): workflow run with steps and the kind dispatcher"
```

---

### Task 7: Stream consumption and reconnection (`store/stream.ts`, `store/routes.ts`)

**Files:**
- Create: `packages/agno-hooks/src/store/stream.ts`, `packages/agno-hooks/src/store/routes.ts`, `packages/agno-hooks/test/store/stream.test.ts`

**Interfaces:**
- Produces: `runStream(opts): Promise<void>`, `ConnectionLostError`, `isResumeMeta(ev)`, `routesFor(api, target): KindRoutes`.
- `KindRoutes = { create(input, opts): AsyncIterable<AnyEvent>; continue(runId, input, opts); resume(runId, input, opts); cancel(runId, sessionId): Promise<unknown>; get(runId, sessionId): Promise<RunRowLike> }`.

- [ ] **Step 1: Failing tests** — `test/store/stream.test.ts`

```ts
import { describe, expect, test } from 'bun:test'
import { AgnoApiError } from '@rodrigocoliveira/agno-api'
import type { AnyEvent } from '../../src/types'
import { ConnectionLostError, isResumeMeta, runStream } from '../../src/store/stream'

async function* gen(events: AnyEvent[], failAfter?: number) {
  let n = 0
  for (const e of events) {
    if (failAfter !== undefined && n === failAfter) throw new TypeError('network down')
    n++
    yield e
  }
}
const e = (i: number, event = 'RunContent'): AnyEvent => ({ event, run_id: 'r', event_index: i })
const noSleep = async () => {}

describe('runStream', () => {
  test('passes events through, skips meta events, dedupes by event_index', async () => {
    const seen: string[] = []
    let last: number | null = null
    await runStream({
      first: () => gen([{ event: 'replay', run_id: 'r', status: 'x', total_events: 3 } as AnyEvent, e(0, 'RunStarted'), e(1), e(1), e(2, 'RunCompleted')]),
      resume: null,
      onEvent: (ev) => { seen.push(`${ev.event}:${ev.event_index}`); last = ev.event_index as number },
      getIndex: () => last,
      isDone: () => false,
      signal: new AbortController().signal,
      sleep: noSleep,
    })
    expect(seen).toEqual(['RunStarted:0', 'RunContent:1', 'RunCompleted:2'])
  })

  test('reconnects with last index, resets attempts after progress, gives up after 3', async () => {
    const resumes: (number | null)[] = []
    const sleeps: number[] = []
    let last: number | null = null
    const attempt = [
      () => gen([e(0), e(1)], 2),          // first: 2 events then drop
      () => gen([e(2)], 1),                // resume 1: progress then drop
      () => gen([], 0),                    // resume 2..4: immediate drops
      () => gen([], 0),
      () => gen([], 0),
    ]
    let i = 0
    const p = runStream({
      first: attempt[i++]!,
      resume: (idx) => { resumes.push(idx); return attempt[i++]!() },
      onEvent: (ev) => { last = ev.event_index as number },
      getIndex: () => last,
      isDone: () => false,
      signal: new AbortController().signal,
      sleep: async (ms) => { sleeps.push(ms) },
    })
    await expect(p).rejects.toBeInstanceOf(ConnectionLostError)
    expect(resumes).toEqual([1, 2, 2, 2])
    expect(sleeps).toEqual([500, 500, 1000, 2000])
  })

  test('no reconnection when the run is already terminal or when resume is null', async () => {
    let done = false
    await runStream({
      first: () => gen([e(0, 'RunCompleted')], 1),
      resume: () => { throw new Error('should not resume') },
      onEvent: () => { done = true },
      getIndex: () => 0, isDone: () => done, signal: new AbortController().signal, sleep: noSleep,
    })
    await expect(runStream({
      first: () => gen([], 0), resume: null, onEvent: () => {}, getIndex: () => null, isDone: () => false,
      signal: new AbortController().signal, sleep: noSleep,
    })).rejects.toBeInstanceOf(ConnectionLostError)
  })

  test('AgnoApiError is rethrown untouched, never retried', async () => {
    const err = new AgnoApiError({ status: 403, method: 'post', path: '/x', detail: 'Approval pending' })
    const p = runStream({
      first: () => (async function* () { throw err })(),
      resume: () => { throw new Error('no') }, onEvent: () => {}, getIndex: () => null, isDone: () => false,
      signal: new AbortController().signal, sleep: noSleep,
    })
    await expect(p).rejects.toBe(err)
  })

  test('meta error event ends the stream as a connection loss', async () => {
    const p = runStream({
      first: () => gen([{ event: 'error', error: 'gone' } as AnyEvent]), resume: null, onEvent: () => {},
      getIndex: () => null, isDone: () => false, signal: new AbortController().signal, sleep: noSleep,
    })
    await expect(p).rejects.toBeInstanceOf(ConnectionLostError)
  })

  test('abort stops silently', async () => {
    const ac = new AbortController()
    const seen: number[] = []
    async function* slow() { yield e(0); ac.abort(); yield e(1) }
    await runStream({ first: () => slow(), resume: null, onEvent: (ev) => seen.push(ev.event_index as number), getIndex: () => null, isDone: () => false, signal: ac.signal, sleep: noSleep })
    expect(seen).toEqual([0])
  })
})

test('isResumeMeta', () => {
  expect(isResumeMeta({ event: 'catch_up', run_id: 'r' })).toBe(true)
  expect(isResumeMeta({ event: 'error', error: 'x' })).toBe(true)
  expect(isResumeMeta({ event: 'RunError', run_id: 'r' })).toBe(false)
})
```

`AgnoApiError` takes one `AgnoApiErrorInit` object (`status`, `method`, `path` required; `detail` optional), as used above. Run: `bun test test/store/stream.test.ts` — Expected: FAIL.

- [ ] **Step 2: `src/store/stream.ts`**

```ts
import { isAgnoApiError } from '@rodrigocoliveira/agno-api'
import type { AnyEvent } from '../types'

export class ConnectionLostError extends Error {
  constructor(cause?: unknown) {
    super('Connection lost', { cause })
    this.name = 'ConnectionLostError'
  }
}

const META = new Set(['catch_up', 'replay', 'subscribed'])
/** /resume meta frames. The `error` meta has no run_id; a run's own error event is `RunError` / `WorkflowError`. */
export function isResumeMeta(ev: AnyEvent): boolean {
  return META.has(ev.event) || (ev.event === 'error' && !('run_id' in ev))
}

const isAbort = (e: unknown) => e instanceof Error && e.name === 'AbortError'
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export interface RunStreamOptions {
  /** Opens the initial stream (create / continue / resume). */
  first: () => AsyncIterable<AnyEvent>
  /** Opens a resume stream from the last index. `null` here = never reconnect (foreground run); returning `null` = cannot reconnect right now (no real run_id yet). */
  resume: ((lastIndex: number | null) => AsyncIterable<AnyEvent> | null) | null
  onEvent: (ev: AnyEvent) => void
  getIndex: () => number | null
  isDone: () => boolean
  signal: AbortSignal
  delays?: number[]
  sleep?: (ms: number) => Promise<void>
}

/**
 * Consumes one run's stream to the end. Skips meta frames, drops events whose event_index we already applied,
 * reconnects through `resume` on network failure (delays 500/1000/2000 ms; the counter resets after progress).
 * Resolves on a clean end or abort; rejects with ConnectionLostError after the last retry, or with the
 * AgnoApiError when the request itself was refused (never retried).
 */
export async function runStream(o: RunStreamOptions): Promise<void> {
  const delays = o.delays ?? [500, 1000, 2000]
  const sleep = o.sleep ?? defaultSleep
  let source = o.first
  let attempt = 0
  for (;;) {
    let progressed = false
    try {
      for await (const ev of source()) {
        if (o.signal.aborted) return
        if (isResumeMeta(ev)) {
          if (ev.event === 'error') throw new ConnectionLostError(ev.error)
          continue
        }
        const idx = o.getIndex()
        if (typeof ev.event_index === 'number' && idx !== null && ev.event_index <= idx) continue
        o.onEvent(ev)
        progressed = true
        attempt = 0
      }
      return
    } catch (err) {
      if (o.signal.aborted || isAbort(err)) return
      if (isAgnoApiError(err)) throw err
      if (o.isDone()) return
      const lost = err instanceof ConnectionLostError ? err : new ConnectionLostError(err)
      if (!o.resume || attempt >= delays.length) throw lost
      const next = o.resume(o.getIndex())
      if (!next) throw lost
      await sleep(delays[attempt]!)
      attempt++
      void progressed
      source = () => next
    }
  }
}
```

Note on the retry test: after `first` drops, attempt 0 → sleep 500, resume(1); progress resets `attempt` to 0; drop → sleep 500, resume(2); no progress → sleep 1000, resume(2); → sleep 2000, resume(2); 4th failure → `attempt (3) >= 3` → throw. That is exactly `resumes = [1, 2, 2, 2]`, `sleeps = [500, 500, 1000, 2000]`.

- [ ] **Step 3: `src/store/routes.ts`**

```ts
import type { AgnoApi, RequestOptions } from '@rodrigocoliveira/agno-api'
import type { AnyEvent, RunRowLike, Target } from '../types'

type Input = Record<string, unknown>
export interface KindRoutes {
  create(input: Input, opts: RequestOptions): AsyncIterable<AnyEvent>
  continue(runId: string, input: Input, opts: RequestOptions): AsyncIterable<AnyEvent>
  resume(runId: string, input: Input, opts: RequestOptions): AsyncIterable<AnyEvent>
  cancel(runId: string, sessionId: string | null): Promise<unknown>
  get(runId: string, sessionId: string | null): Promise<RunRowLike>
}

/** The only place that knows there are three targets. Inputs are cast: the store owns stream/background/session_id. */
export function routesFor(api: AgnoApi, target: Target): KindRoutes {
  const q = (sessionId: string | null) => (sessionId ? { session_id: sessionId } : undefined)
  const id = target.id
  switch (target.kind) {
    case 'agent': return {
      create: (input, opts) => api.agents.runs.create(id, input as never, opts) as AsyncIterable<AnyEvent>,
      continue: (runId, input, opts) => api.agents.runs.continue(id, runId, input as never, opts) as AsyncIterable<AnyEvent>,
      resume: (runId, input, opts) => api.agents.runs.resume(id, runId, input as never, opts) as AsyncIterable<AnyEvent>,
      cancel: (runId, s) => api.agents.runs.cancel(id, runId, q(s) as never),
      get: (runId, s) => api.agents.runs.get(id, runId, q(s) as never) as Promise<RunRowLike>,
    }
    case 'team': return {
      create: (input, opts) => api.teams.runs.create(id, input as never, opts) as AsyncIterable<AnyEvent>,
      continue: (runId, input, opts) => api.teams.runs.continue(id, runId, input as never, opts) as AsyncIterable<AnyEvent>,
      resume: (runId, input, opts) => api.teams.runs.resume(id, runId, input as never, opts) as AsyncIterable<AnyEvent>,
      cancel: (runId, s) => api.teams.runs.cancel(id, runId, q(s) as never),
      get: (runId, s) => api.teams.runs.get(id, runId, q(s) as never) as Promise<RunRowLike>,
    }
    default: return {
      create: (input, opts) => api.workflows.runs.create(id, input as never, opts) as AsyncIterable<AnyEvent>,
      continue: (runId, input, opts) => api.workflows.runs.continue(id, runId, input as never, opts) as AsyncIterable<AnyEvent>,
      resume: (runId, input, opts) => api.workflows.runs.resume(id, runId, input as never, opts) as AsyncIterable<AnyEvent>,
      cancel: (runId, s) => api.workflows.runs.cancel(id, runId, q(s) as never),
      get: (runId, s) => api.workflows.runs.get(id, runId, q(s) as never) as Promise<RunRowLike>,
    }
  }
}
```

If `tsc` rejects a cast (`as never` on an input that the overload cannot match), use `as unknown as Parameters<typeof api.agents.runs.create>[1]` for that call instead; do not loosen `KindRoutes`.

- [ ] **Step 4: Run, commit**

Run: `cd packages/agno-hooks && bun test test/store && bun run typecheck` — Expected: PASS.

```bash
git add packages/agno-hooks/src/store packages/agno-hooks/test/store
git commit -m "feat(agno-hooks): stream loop with resume reconnection and kind routes"
```

---

### Task 8: The store (`store/store.ts`): snapshot, hydrate, send, resume, cancel, destroy

**Files:**
- Create: `packages/agno-hooks/src/store/store.ts`, `packages/agno-hooks/test/store/helpers.ts`, `packages/agno-hooks/test/store/store.test.ts`

**Interfaces:**
- Consumes: `routesFor`, `runStream`, `ConnectionLostError` (Task 7); `createRun`, `applyEvent`, `fromRow`, `rowsToRuns`, `pendingTools`, `setExternalResult` (Tasks 3–6); `isAgnoApiError` from `@rodrigocoliveira/agno-api`.
- Produces: `createAgnoStore<K>(options: StoreOptions<K>): AgnoStore<K>` with `kind`, `getSnapshot`, `subscribe`, `send`, `continue`, `resolveTool`, `runTools`, `resume`, `cancel`, `setFrontendTools`, `destroy`. The HITL methods (`continue`, `resolveTool`, `runTools`, automatic `frontendTools`) are implemented here and tested in Task 9.

- [ ] **Step 1: Test helpers** — `test/store/helpers.ts`

```ts
import { createAgnoApi } from '@rodrigocoliveira/agno-api'
import { json, mockFetch, sse, type FetchCall } from '../../../agno-api/test/helpers'
import type { AnyEvent } from '../../src/types'

export { json, mockFetch, sse }

/** SSE response from a list of events (one `data:` frame each). */
export const frames = (events: AnyEvent[]) => sse(events.map((e) => `data: ${JSON.stringify(e)}\n\n`))

/** An SSE response you can feed after the fact; `drop()` errors the stream like a network cut. */
export function openSse() {
  const enc = new TextEncoder()
  let ctrl!: ReadableStreamDefaultController<Uint8Array>
  const body = new ReadableStream<Uint8Array>({ start(c) { ctrl = c } })
  return {
    response: new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    push: (e: AnyEvent) => ctrl.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`)),
    close: () => ctrl.close(),
    drop: () => ctrl.error(new TypeError('network down')),
  }
}

/** Reads a body param whether the route used FormData, URLSearchParams or a JSON/string body. */
export function bodyParam(call: FetchCall, name: string): string | null {
  const b = call.init.body
  if (b instanceof FormData) { const v = b.get(name); return v == null ? null : String(v) }
  if (b instanceof URLSearchParams) return b.get(name)
  if (typeof b === 'string') { try { return new URLSearchParams(b).get(name) } catch { return null } }
  return null
}

export const apiWith = (fetchFn: typeof fetch) => createAgnoApi({ baseUrl: 'http://x', fetch: fetchFn })

export const wait = (ms = 0) => new Promise<void>((r) => setTimeout(r, ms))

/** Polls a store until `pred(snapshot)` is true (or times out). */
export async function until<T>(store: { getSnapshot(): T }, pred: (s: T) => boolean, timeoutMs = 2000): Promise<T> {
  const start = Date.now()
  while (!pred(store.getSnapshot())) {
    if (Date.now() - start > timeoutMs) throw new Error('until: timed out; snapshot = ' + JSON.stringify(store.getSnapshot(), null, 1).slice(0, 2000))
    await wait(5)
  }
  return store.getSnapshot()
}
```

- [ ] **Step 2: Failing tests** — `test/store/store.test.ts`

```ts
import { describe, expect, test } from 'bun:test'
import { createAgnoStore } from '../../src/store/store'
import type { AnyEvent } from '../../src/types'
import { apiWith, bodyParam, frames, json, mockFetch, openSse, until, wait } from './helpers'

const started = (run_id: string, session_id = 's1', i = 0): AnyEvent => ({ event: 'RunStarted', run_id, session_id, agent_id: 'a', event_index: i })
const content = (run_id: string, text: string, i: number): AnyEvent => ({ event: 'RunContent', run_id, content: text, content_type: 'str', event_index: i })
const completed = (run_id: string, text: string, i: number): AnyEvent => ({ event: 'RunCompleted', run_id, content: text, event_index: i })
const agentStore = (fetchFn: typeof fetch, over: Partial<Parameters<typeof createAgnoStore>[0]> = {}) =>
  createAgnoStore({ api: apiWith(fetchFn), target: { kind: 'agent', id: 'a' }, retryDelays: [1, 1, 1], ...over })

describe('hydrate', () => {
  test('loads rows oldest first and resumes the running one', async () => {
    const live = openSse()
    const m = mockFetch((call) => {
      if (call.url.includes('/sessions/s1/runs')) return json([
        { run_id: 'r2', agent_id: 'a', status: 'RUNNING', run_input: 'second', content: 'par', created_at: '2026-01-01T00:00:02Z' },
        { run_id: 'r1', agent_id: 'a', status: 'COMPLETED', run_input: 'first', content: 'done', created_at: '2026-01-01T00:00:01Z' },
      ])
      if (call.url.endsWith('/runs/r2/resume')) return live.response
      throw new Error('unexpected ' + call.url)
    })
    const store = agentStore(m.fetch, { sessionId: 's1' })
    expect(store.getSnapshot().status).toBe('loading')
    const s = await until(store, (s) => s.status === 'ready')
    expect(s.runs.map((r) => [r.id, r.status, r.input.message])).toEqual([['r1', 'completed', 'first'], ['r2', 'running', 'second']])
    expect(s.isBusy).toBe(false) // reattached runs never block send
    await until(store, () => m.calls.some((c) => c.url.endsWith('/runs/r2/resume')))
    expect(bodyParam(m.calls.at(-1)!, 'last_event_index')).toBeNull()
    live.push(started('r2')); live.push(content('r2', 'partial ', 1)); live.push(content('r2', 'text', 2)); live.push(completed('r2', 'partial text', 3)); live.close()
    const done = await until(store, (s) => s.runs[1]!.status === 'completed')
    expect(done.runs[1]!.content).toBe('partial text')
    expect(done.runs[1]!.eventIndex).toBe(3)
    expect(done.runs[0]).toBe(s.runs[0]) // untouched run keeps its reference
  })

  test('paused row is refetched through runs.get to recover requirements', async () => {
    const t = { tool_call_id: 'c1', tool_name: 'add_one', tool_args: {}, requires_confirmation: true }
    const m = mockFetch((call) => {
      if (call.url.includes('/sessions/s1/runs')) return json([{ run_id: 'r1', agent_id: 'a', status: 'PAUSED', tools: [t] }])
      if (call.url.endsWith('/agents/a/runs/r1')) return json({ run_id: 'r1', agent_id: 'a', status: 'PAUSED', tools: [t], requirements: [{ id: 'q', tool_execution: t }] })
      throw new Error('unexpected ' + call.url)
    })
    const s = await until(agentStore(m.fetch, { sessionId: 's1' }), (s) => s.status === 'ready')
    expect(s.runs[0]!.requirements![0]!.id).toBe('q')
    expect(s.pending).toEqual({ runId: 'r1', tools: [t] })
    expect(s.isBusy).toBe(true)
  })

  test('team rows are grouped; sessionless store is ready immediately; hydrate failure is exposed', async () => {
    const m = mockFetch((call) => {
      if (call.url.includes('/sessions/s1/runs')) return json([
        { run_id: 'm1', agent_id: 'a', parent_run_id: 't1', status: 'COMPLETED', content: 'member' },
        { run_id: 't1', team_id: 'team', status: 'COMPLETED', content: 'leader' },
      ])
      return json({ detail: 'nope' }, 500)
    })
    const team = createAgnoStore({ api: apiWith(m.fetch), target: { kind: 'team', id: 'team' }, sessionId: 's1' })
    const s = await until(team, (s) => s.status === 'ready')
    expect(s.runs).toHaveLength(1)
    expect(s.runs[0]!.members[0]!.content).toBe('member')

    expect(agentStore(m.fetch).getSnapshot()).toMatchObject({ status: 'ready', runs: [], sessionId: null })

    const bad = agentStore(m.fetch, { sessionId: 'broken' })
    const e = await until(bad, (s) => s.status === 'error')
    expect(e.error?.message).toContain('nope')
  })
})

describe('send', () => {
  test('optimistic run, id swap, session learned, background by default', async () => {
    const m = mockFetch(() => frames([started('r1', 's9'), content('r1', 'hel', 1), content('r1', 'lo', 2), completed('r1', 'hello', 3)]))
    const store = agentStore(m.fetch)
    const p = store.send('hi')
    const optimistic = store.getSnapshot()
    expect(optimistic.runs[0]).toMatchObject({ id: 'local-1', status: 'running', local: true, input: { message: 'hi' } })
    expect(optimistic.isBusy).toBe(true)
    await expect(store.send('again')).rejects.toThrow('A run is already active')
    await p
    const s = store.getSnapshot()
    expect(s.runs[0]).toMatchObject({ id: 'r1', status: 'completed', content: 'hello', eventIndex: 3 })
    expect(s.sessionId).toBe('s9')
    expect(s.isBusy).toBe(false)
    const call = m.calls[0]!
    expect(call.url).toContain('/agents/a/runs')
    expect(bodyParam(call, 'message')).toBe('hi')
    expect(bodyParam(call, 'background')).toBe('true')
    expect(bodyParam(call, 'stream')).toBe('true')
    expect(bodyParam(call, 'session_id')).toBeNull()
  })

  test('full input passes through; existing session id is sent', async () => {
    const m = mockFetch(() => frames([started('r1'), completed('r1', 'ok', 1)]))
    const store = agentStore(m.fetch, { sessionId: 's1', background: false })
    await until(store, (s) => s.status === 'ready')
    await store.send({ message: 'with file', files: [new File(['x'], 'a.txt')], user_id: 'u1' })
    const call = m.calls.at(-1)!
    expect(bodyParam(call, 'session_id')).toBe('s1')
    expect(bodyParam(call, 'user_id')).toBe('u1')
    expect(bodyParam(call, 'background')).toBe('false')
    expect((call.init.body as FormData).get('files')).toBeInstanceOf(File)
    expect(store.getSnapshot().runs[0]!.input.files).toHaveLength(1)
  })

  test('HTTP error before the stream opens → run error, no resume', async () => {
    const m = mockFetch(() => json({ detail: 'Agent not found' }, 404))
    const store = agentStore(m.fetch)
    await store.send('hi')
    expect(store.getSnapshot().runs[0]).toMatchObject({ status: 'error', error: expect.stringContaining('Agent not found') })
    expect(m.calls).toHaveLength(1)
  })

  test('connection drop → resume with last_event_index; foreground run just errors', async () => {
    const first = openSse()
    const m = mockFetch((call) => {
      if (call.url.endsWith('/agents/a/runs')) return first.response
      if (call.url.endsWith('/runs/r1/resume')) return frames([content('r1', 'lo', 2), completed('r1', 'hello', 3)])
      throw new Error('unexpected ' + call.url)
    })
    const store = agentStore(m.fetch)
    const p = store.send('hi')
    await until(store, () => m.calls.length === 1)
    first.push(started('r1', 's1', 0)); first.push(content('r1', 'hel', 1)); first.drop()
    await p
    expect(bodyParam(m.calls[1]!, 'last_event_index')).toBe('1')
    expect(store.getSnapshot().runs[0]).toMatchObject({ status: 'completed', content: 'hello' })

    const fg = openSse()
    const m2 = mockFetch(() => fg.response)
    const store2 = agentStore(m2.fetch, { background: false })
    const p2 = store2.send('hi')
    await until(store2, () => m2.calls.length === 1)
    fg.push(started('r1')); fg.drop()
    await p2
    expect(store2.getSnapshot().runs[0]).toMatchObject({ status: 'error', error: 'Connection lost' })
    expect(m2.calls).toHaveLength(1)
  })

  test('gives up after 3 resumes; resume(runId) retries manually', async () => {
    const first = openSse()
    let resumes = 0
    const m = mockFetch((call) => {
      if (call.url.endsWith('/agents/a/runs')) return first.response
      if (call.url.endsWith('/runs/r1/resume')) {
        resumes++
        if (resumes > 3) return frames([completed('r1', 'late', 5)])
        const dead = openSse(); dead.drop(); return dead.response   // errors on first read → a drop
      }
      throw new Error('unexpected')
    })
    const store = agentStore(m.fetch)
    const p = store.send('hi')
    await until(store, () => m.calls.length === 1)
    first.push(started('r1')); first.drop()
    await p
    expect(resumes).toBe(3)
    expect(store.getSnapshot().runs[0]).toMatchObject({ status: 'error', error: 'Connection lost' })
    await store.resume('r1')
    expect(store.getSnapshot().runs[0]).toMatchObject({ status: 'completed', content: 'late' })
  })
})

describe('cancel / destroy / subscribe', () => {
  test('cancel posts to the cancel route and the RunCancelled event lands', async () => {
    const live = openSse()
    const m = mockFetch((call) => (call.url.endsWith('/cancel') ? json({ ok: true }) : live.response))
    const store = agentStore(m.fetch)
    const p = store.send('hi')
    await until(store, () => m.calls.length === 1)
    live.push(started('r1'))
    await until(store, (s) => s.runs[0]!.id === 'r1')
    await store.cancel()
    expect(m.calls.at(-1)!.url).toContain('/agents/a/runs/r1/cancel')
    live.push({ event: 'RunCancelled', run_id: 'r1', reason: 'user', event_index: 1 }); live.close()
    await p
    expect(store.getSnapshot().runs[0]).toMatchObject({ status: 'cancelled', error: 'user' })
  })

  test('cancel falls back to a local cancel after the timeout', async () => {
    const live = openSse()
    const m = mockFetch((call) => (call.url.endsWith('/cancel') ? json({ ok: true }) : live.response))
    const store = agentStore(m.fetch, { cancelTimeoutMs: 10 })
    void store.send('hi')
    await until(store, () => m.calls.length === 1)
    live.push(started('r1'))
    await until(store, (s) => s.runs[0]!.id === 'r1')
    await store.cancel()
    await until(store, (s) => s.runs[0]!.status === 'cancelled')
  })

  test('destroy aborts streams and stops notifying', async () => {
    const live = openSse()
    const m = mockFetch(() => live.response)
    const store = agentStore(m.fetch)
    let notified = 0
    store.subscribe(() => notified++)
    const p = store.send('hi')
    await until(store, () => m.calls.length === 1)
    const before = notified
    store.destroy()
    live.push(started('r1'))
    await wait(20)
    await p
    expect(notified).toBe(before)
    expect(store.getSnapshot().runs[0]!.id).toBe('local-1')
  })

  test('snapshot identity is stable between commits', () => {
    const store = agentStore(mockFetch(() => json([])).fetch)
    expect(store.getSnapshot()).toBe(store.getSnapshot())
  })
})
```

Run: `cd packages/agno-hooks && bun test test/store/store.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: `src/store/store.ts`**

```ts
import { isAgnoApiError, type AgnoApi, type RunRequirement, type StepRequirement, type ToolExecution } from '@rodrigocoliveira/agno-api'
import { applyEvent, createRun, fromRow, pendingTools, rowsToRuns, setExternalResult } from '../run'
import {
  isTerminal, type AgentRun, type AnyEvent, type ContinueExtra, type Decision, type FrontendTool, type Kind, type Pending,
  type Run, type RunOf, type RunRowLike, type SendInput, type Snapshot, type Target, type TeamRun, type WorkflowRun,
} from '../types'
import { routesFor } from './routes'
import { runStream } from './stream'

export interface StoreOptions<K extends Kind> {
  api: AgnoApi
  target: Target & { kind: K }
  sessionId?: string | null
  /** Default true: runs survive disconnects and can be resumed. */
  background?: boolean
  frontendTools?: Record<string, FrontendTool>
  /** Test hooks. */
  retryDelays?: number[]
  cancelTimeoutMs?: number
}

export interface AgnoStore<K extends Kind> {
  readonly kind: K
  getSnapshot(): Snapshot<K>
  subscribe(listener: () => void): () => void
  send(input: string | SendInput<K>): Promise<void>
  continue(decisions: Decision<K>[], extra?: ContinueExtra<K>): Promise<void>
  resolveTool(toolCallId: string, result: unknown): void
  runTools(runId?: string): Promise<void>
  resume(runId: string): Promise<void>
  cancel(runId?: string): Promise<void>
  setFrontendTools(tools: Record<string, FrontendTool> | undefined): void
  destroy(): void
}

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e))
const isLocalId = (id: string) => id.startsWith('local-')

export function createAgnoStore<K extends Kind>(options: StoreOptions<K>): AgnoStore<K> {
  const kind = options.target.kind
  const targetId = options.target.id
  const routes = routesFor(options.api, options.target)
  const background = options.background ?? true
  const cancelTimeoutMs = options.cancelTimeoutMs ?? 5000
  let frontendTools: Record<string, FrontendTool> = options.frontendTools ?? {}

  let runs: RunOf<K>[] = []
  let status: Snapshot<K>['status'] = options.sessionId ? 'loading' : 'ready'
  let sessionId: string | null = options.sessionId ?? null
  let error: Error | null = null
  let destroyed = false
  let localSeq = 0
  const listeners = new Set<() => void>()
  const streams = new Map<string, AbortController>()     // keyed by the run's CURRENT id
  const toolAborts = new Map<string, AbortController>()
  const resolutions = new Map<string, Map<string, ToolExecution>>()

  const find = (id: string) => runs.find((r) => r.id === id)
  const replace = (id: string, next: RunOf<K>) => { runs = runs.map((r) => (r.id === id ? next : r)) }
  const asRun = (r: RunOf<K>) => r as unknown as Run

  function computePending(): Pending<K> | null {
    for (let i = runs.length - 1; i >= 0; i--) {
      const r = asRun(runs[i]!)
      if (r.status !== 'paused') continue
      if (r.kind === 'workflow') return { runId: r.id, stepRequirements: r.stepRequirements ?? [] } as Pending<K>
      const res = resolutions.get(r.id)
      return { runId: r.id, tools: pendingTools(r).map((t) => res?.get(t.tool_call_id) ?? t) } as Pending<K>
    }
    return null
  }
  const build = (): Snapshot<K> => ({
    status, sessionId, runs, pending: computePending(),
    isBusy: runs.some((r) => (r.local && r.status === 'running') || r.status === 'paused'),
    error,
  })
  let snapshot: Snapshot<K> = build()
  function commit() {
    if (destroyed) return
    snapshot = build()
    for (const l of listeners) l()
  }

  const failRun = (run: RunOf<K>, err: unknown): RunOf<K> => ({ ...run, status: 'error', error: messageOf(err) })

  interface StreamSpec {
    first: (signal: AbortSignal) => AsyncIterable<AnyEvent>
    resumable: boolean
    onFail: (run: RunOf<K>, err: unknown) => RunOf<K>
  }

  async function startStream(runId: string, spec: StreamSpec): Promise<void> {
    let id = runId
    const ac = new AbortController()
    streams.set(id, ac)
    const current = () => find(id)
    try {
      await runStream({
        first: () => spec.first(ac.signal),
        resume: spec.resumable
          ? (idx) => (isLocalId(id) ? null : routes.resume(id, { session_id: sessionId ?? undefined, last_event_index: idx ?? undefined }, { signal: ac.signal }))
          : null,
        onEvent: (ev) => {
          const run = current()
          if (!run) return
          const wasPaused = run.status === 'paused'
          let next = applyEvent(run, ev)
          if (typeof ev.event_index === 'number') next = { ...next, eventIndex: ev.event_index }
          replace(id, next)
          if (next.id !== id) { streams.delete(id); streams.set(next.id, ac); id = next.id }
          if (!sessionId && next.sessionId) sessionId = next.sessionId
          if (isTerminal(next.status)) resolutions.delete(next.id)
          commit()
          if (!wasPaused && next.status === 'paused') void autoRunTools(next.id)
        },
        getIndex: () => current()?.eventIndex ?? null,
        isDone: () => isTerminal(current()?.status),
        signal: ac.signal,
        delays: options.retryDelays,
      })
    } catch (err) {
      const run = current()
      if (run && !destroyed) { replace(id, spec.onFail(run, err)); commit() }
    } finally {
      if (streams.get(id) === ac) streams.delete(id)
    }
  }

  async function hydrate(): Promise<void> {
    if (!sessionId) { status = 'ready'; commit(); return }
    status = 'loading'; commit()
    try {
      const rows = (await options.api.sessions.runs(sessionId)) as unknown as RunRowLike[]
      const loaded = await Promise.all(rowsToRuns(kind, rows).map(async (r) => {
        if (r.status !== 'paused') return r
        const fresh = fromRow(kind, await routes.get(r.id, sessionId))
        return (asRun(r).kind === 'team' ? { ...fresh, members: (r as TeamRun).members } : fresh) as RunOf<K>
      }))
      if (destroyed) return
      runs = loaded; status = 'ready'; error = null; commit()
      for (const r of runs) {
        if (r.status !== 'running') continue
        void startStream(r.id, {
          first: (signal) => routes.resume(r.id, { session_id: sessionId ?? undefined }, { signal }),
          resumable: true,
          onFail: failRun,
        })
      }
    } catch (e) {
      if (destroyed) return
      status = 'error'; error = e instanceof Error ? e : new Error(String(e)); commit()
    }
  }

  async function send(input: string | SendInput<K>): Promise<void> {
    if (destroyed) throw new Error('Store destroyed')
    if (snapshot.isBusy) throw new Error('A run is already active')
    const body = (typeof input === 'string' ? { message: input } : input) as Record<string, unknown>
    const id = `local-${++localSeq}`
    const run = createRun(kind, targetId, {
      id, status: 'running', local: true, sessionId, createdAt: Date.now() / 1000,
      input: { message: typeof body.message === 'string' ? body.message : '', files: Array.isArray(body.files) ? (body.files as File[]) : [], media: null },
    } as Partial<RunOf<K>>)
    runs = [...runs, run]; commit()
    await startStream(id, {
      first: (signal) => routes.create({ ...body, session_id: sessionId ?? undefined, background, stream: true }, { signal }),
      resumable: background,
      onFail: failRun,
    })
  }

  async function resume(runId: string): Promise<void> {
    const run = find(runId)
    if (!run || run.status === 'completed' || run.status === 'cancelled' || isLocalId(run.id)) return
    replace(runId, { ...run, status: 'running', error: null }); commit()
    await startStream(runId, {
      first: (signal) => routes.resume(runId, { session_id: sessionId ?? undefined, last_event_index: run.eventIndex ?? undefined }, { signal }),
      resumable: true,
      onFail: failRun,
    })
  }

  async function cancel(runId?: string): Promise<void> {
    const run = runId ? find(runId) : [...runs].reverse().find((r) => r.local && !isTerminal(r.status))
    if (!run || isTerminal(run.status) || isLocalId(run.id)) return
    await routes.cancel(run.id, sessionId)
    const timer = setTimeout(() => {
      const r = find(run.id)
      if (!r || isTerminal(r.status) || destroyed) return
      streams.get(r.id)?.abort()
      replace(r.id, { ...r, status: 'cancelled' }); commit()
    }, cancelTimeoutMs)
    ;(timer as { unref?: () => void }).unref?.()
  }

  // ---- HITL ----

  function setResolution(runId: string, tool: ToolExecution) {
    const m = resolutions.get(runId) ?? new Map<string, ToolExecution>()
    m.set(tool.tool_call_id, tool)
    resolutions.set(runId, m)
  }

  function resolveTool(toolCallId: string, result: unknown): void {
    const p = snapshot.pending as { runId: string; tools?: ToolExecution[] } | null
    const t = p?.tools?.find((x) => x.tool_call_id === toolCallId)
    if (!p || !t) return
    setResolution(p.runId, setExternalResult(t, result)); commit()
  }

  const wrapRequirement = (run: AgentRun | TeamRun, t: ToolExecution): RunRequirement => {
    const orig = run.requirements?.find((q) => q.tool_execution?.tool_call_id === t.tool_call_id)
    return orig ? { ...orig, tool_execution: t } : { id: t.tool_call_id, tool_execution: t }
  }

  async function continueRun(decisions: Decision<K>[], extra?: ContinueExtra<K>): Promise<void> {
    if (destroyed) throw new Error('Store destroyed')
    const p = snapshot.pending
    if (!p) throw new Error('No paused run to continue')
    const run = asRun(find(p.runId)!)
    let wire: Record<string, unknown>
    if (run.kind === 'workflow') {
      const byStep = new Map((decisions as StepRequirement[]).map((d) => [d.step_id, d]))
      const list = ((run as WorkflowRun).stepRequirements ?? []).map((sr) => byStep.get(sr.step_id) ?? sr)
      const active = list.at(-1)
      if (active && !byStep.has(active.step_id)) throw new Error(`Step ${active.step_id} still pending`)
      wire = { step_requirements: list }
    } else {
      const res = new Map(resolutions.get(run.id) ?? [])
      for (const d of decisions as ToolExecution[]) res.set(d.tool_call_id, d)
      const final: ToolExecution[] = []
      for (const t of pendingTools(run)) {
        const d = res.get(t.tool_call_id)
        if (d) final.push(d)
        else if (t.approval_type === 'required') continue
        else throw new Error(`Tool ${t.tool_call_id} still pending`)
      }
      resolutions.set(run.id, res)
      wire = kind === 'agent' ? { tools: final } : { requirements: final.map((t) => wrapRequirement(run, t)) }
    }
    replace(run.id, { ...find(run.id)!, status: 'running', error: null }); commit()
    await startStream(run.id, {
      first: (signal) => routes.continue(run.id, { ...wire, ...(extra ?? {}), session_id: sessionId ?? undefined, background, stream: true }, { signal }),
      resumable: background,
      onFail: (r, err) => (isAgnoApiError(err) ? { ...r, status: 'paused', error: messageOf(err) } : failRun(r, err)),
    })
  }

  async function autoRunTools(runId: string): Promise<void> {
    const run = asRun(find(runId) as RunOf<K>)
    if (!run || run.status !== 'paused' || run.kind === 'workflow') return
    const already = resolutions.get(runId)
    const targets = pendingTools(run).filter((t) => t.external_execution_required && frontendTools[t.tool_name] && !already?.has(t.tool_call_id))
    if (targets.length === 0) return
    const ac = new AbortController()
    toolAborts.set(runId, ac)
    await Promise.all(targets.map(async (t) => {
      let resolved: ToolExecution
      try { resolved = setExternalResult(t, await frontendTools[t.tool_name]!(t.tool_args ?? {}, { run, tool: t, signal: ac.signal })) }
      catch (e) { resolved = { ...t, tool_call_error: true, result: messageOf(e) } }
      setResolution(runId, resolved)
    }))
    toolAborts.delete(runId)
    if (destroyed || ac.signal.aborted) return
    commit()
    const after = asRun(find(runId) as RunOf<K>)
    if (!after || after.status !== 'paused' || after.kind === 'workflow') return
    const m = resolutions.get(runId)
    const remaining = pendingTools(after).filter((t) => !m?.has(t.tool_call_id) && t.approval_type !== 'required')
    if (remaining.length === 0 && snapshot.pending?.runId === runId) await continueRun([])
  }

  function runTools(runId?: string): Promise<void> {
    const id = runId ?? snapshot.pending?.runId
    return id ? autoRunTools(id) : Promise.resolve()
  }

  function destroy() {
    destroyed = true
    for (const ac of streams.values()) ac.abort()
    for (const ac of toolAborts.values()) ac.abort()
    streams.clear(); toolAborts.clear(); listeners.clear()
  }

  void hydrate()

  return {
    kind,
    getSnapshot: () => snapshot,
    subscribe: (l) => { listeners.add(l); return () => { listeners.delete(l) } },
    send, continue: continueRun, resolveTool, runTools, resume, cancel,
    setFrontendTools: (t) => { frontendTools = t ?? {} },
    destroy,
  }
}
```

- [ ] **Step 4: Run, fix, commit**

Run: `cd packages/agno-hooks && bun test test/store && bun run typecheck` — Expected: PASS.

```bash
git add packages/agno-hooks/src/store packages/agno-hooks/test/store
git commit -m "feat(agno-hooks): createAgnoStore — hydrate, send, resume, cancel, destroy"
```

---

### Task 9: HITL in the store: `continue`, `resolveTool`, `runTools`, automatic `frontendTools`

**Files:**
- Create: `packages/agno-hooks/test/store/hitl.test.ts`
- Modify (only if a test finds a defect): `packages/agno-hooks/src/store/store.ts`

**Interfaces:**
- Consumes: everything from Task 8; `confirm`, `provideUserFeedback` from `run/hitl`.

- [ ] **Step 1: Tests** — `test/store/hitl.test.ts`

```ts
import { describe, expect, test } from 'bun:test'
import { confirm, provideUserFeedback } from '../../src/run/hitl'
import { createAgnoStore } from '../../src/store/store'
import type { AnyEvent } from '../../src/types'
import { apiWith, bodyParam, frames, json, mockFetch, until, wait } from './helpers'

const started = (run_id: string, extra: Record<string, unknown> = {}): AnyEvent => ({ event: 'RunStarted', run_id, session_id: 's1', agent_id: 'a', event_index: 0, ...extra })
const confirmTool = { tool_call_id: 'c1', tool_name: 'add_one', tool_args: { x: 1 }, requires_confirmation: true }
const askTool = { tool_call_id: 'c2', tool_name: 'ask_user', tool_args: {}, requires_user_input: true, user_feedback_schema: [{ question: 'Where?', header: 'Use', options: [{ label: 'Trail' }, { label: 'Road' }] }] }
const extTool = { tool_call_id: 'c3', tool_name: 'get_location', tool_args: {}, external_execution_required: true }
const pausedWith = (run_id: string, tools: unknown[], requirements?: unknown[]) =>
  frames([started(run_id), ...tools.map((t, i) => ({ event: 'ToolCallStarted', run_id, tool: t, event_index: i + 1 })), { event: 'RunPaused', run_id, tools, requirements, event_index: 9 }])
const continued = (run_id: string) => frames([{ event: 'RunContinued', run_id, event_index: 10 }, { event: 'RunCompleted', run_id, content: 'done', event_index: 11 }])

const agentStore = (fetchFn: typeof fetch, over: Partial<Parameters<typeof createAgnoStore>[0]> = {}) =>
  createAgnoStore({ api: apiWith(fetchFn), target: { kind: 'agent', id: 'a' }, retryDelays: [1, 1, 1], ...over })

describe('continue', () => {
  test('agent: decisions go out as tools JSON; pending clears; answered tool stays in run.tools', async () => {
    const m = mockFetch((call) => (call.url.endsWith('/continue') ? continued('r1') : pausedWith('r1', [confirmTool, askTool])))
    const store = agentStore(m.fetch)
    await store.send('hi')
    const s = store.getSnapshot()
    expect(s.runs[0]!.status).toBe('paused')
    expect(s.pending!.tools.map((t) => t.tool_call_id)).toEqual(['c1', 'c2'])
    expect(s.isBusy).toBe(true)
    await expect(store.continue([confirm(confirmTool)])).rejects.toThrow('Tool c2 still pending')
    expect(m.calls).toHaveLength(1)
    await store.continue([confirm(confirmTool), provideUserFeedback(askTool, { 'Where?': ['Trail'] })], { additional_instructions: 'be brief' })
    const call = m.calls[1]!
    expect(call.url).toContain('/agents/a/runs/r1/continue')
    const tools = JSON.parse(bodyParam(call, 'tools')!)
    expect(tools).toHaveLength(2)
    expect(tools[0]).toMatchObject({ tool_call_id: 'c1', confirmed: true })
    expect(tools[1].user_feedback_schema[0].selected_options).toEqual(['Trail'])
    expect(bodyParam(call, 'additional_instructions')).toBe('be brief')
    expect(bodyParam(call, 'background')).toBe('true')
    const done = store.getSnapshot()
    expect(done.pending).toBeNull()
    expect(done.runs[0]!.status).toBe('completed')
    expect(done.isBusy).toBe(false)
  })

  test('team: decisions are wrapped in the original requirement', async () => {
    const memberTool = { ...confirmTool, tool_call_id: 'm1' }
    const req = { id: 'req-1', tool_execution: memberTool, member_agent_id: 'agent', member_run_id: 'mr1' }
    const m = mockFetch((call) => call.url.endsWith('/continue')
      ? frames([{ event: 'TeamRunContinued', run_id: 't1' }, { event: 'TeamRunCompleted', run_id: 't1', content: 'ok' }])
      : frames([{ event: 'TeamRunStarted', run_id: 't1', session_id: 's1' }, { event: 'TeamRunPaused', run_id: 't1', tools: [], requirements: [req] }]))
    const store = createAgnoStore({ api: apiWith(m.fetch), target: { kind: 'team', id: 'team' } })
    await store.send('hi')
    expect(store.getSnapshot().pending!.tools).toEqual([memberTool])
    await store.continue([confirm(memberTool)])
    const reqs = JSON.parse(bodyParam(m.calls[1]!, 'requirements')!)
    expect(reqs[0]).toMatchObject({ id: 'req-1', member_run_id: 'mr1', tool_execution: { tool_call_id: 'm1', confirmed: true } })
    expect(bodyParam(m.calls[1]!, 'tools')).toBeNull()
  })

  test('workflow: step_requirements; only the last one must be decided', async () => {
    const sr = { step_id: 'st1', step_name: 'echo', requires_confirmation: true }
    const m = mockFetch((call) => call.url.endsWith('/continue')
      ? frames([{ event: 'StepContinued', run_id: 'w1', step_id: 'st1' }, { event: 'WorkflowCompleted', run_id: 'w1', content: 'ok' }])
      : frames([{ event: 'WorkflowStarted', run_id: 'w1', session_id: 's1' }, { event: 'WorkflowPaused', run_id: 'w1', pause_kind: 'step', step_requirements: [sr] }]))
    const store = createAgnoStore({ api: apiWith(m.fetch), target: { kind: 'workflow', id: 'wf' } })
    await store.send('go')
    expect(store.getSnapshot().pending).toEqual({ runId: 'w1', stepRequirements: [sr] })
    await expect(store.continue([])).rejects.toThrow('Step st1 still pending')
    await store.continue([{ ...sr, confirmed: true }])
    expect(JSON.parse(bodyParam(m.calls[1]!, 'step_requirements')!)[0]).toMatchObject({ step_id: 'st1', confirmed: true })
    expect(store.getSnapshot().runs[0]!.status).toBe('completed')
  })

  test('approval-gated tool needs no local decision; 403 keeps the run paused with error', async () => {
    const gated = { ...confirmTool, approval_type: 'required', approval_id: 'ap1' }
    let n = 0
    const m = mockFetch((call) => call.url.endsWith('/continue')
      ? (++n === 1 ? json({ detail: 'Approval pending' }, 403) : continued('r1'))
      : pausedWith('r1', [gated]))
    const store = agentStore(m.fetch)
    await store.send('hi')
    await store.continue([])
    expect(store.getSnapshot().runs[0]).toMatchObject({ status: 'paused', error: expect.stringContaining('Approval pending') })
    expect(store.getSnapshot().pending!.tools[0]!.approval_id).toBe('ap1')
    await store.continue([])
    expect(store.getSnapshot().runs[0]).toMatchObject({ status: 'completed', error: null })
    expect(JSON.parse(bodyParam(m.calls[2]!, 'tools')!)).toEqual([])
  })
})

describe('frontendTools', () => {
  test('runs mapped external tools and continues by itself; errors become tool errors', async () => {
    const boom = { ...extTool, tool_call_id: 'c4', tool_name: 'explode' }
    const m = mockFetch((call) => (call.url.endsWith('/continue') ? continued('r1') : pausedWith('r1', [extTool, boom])))
    const seen: unknown[] = []
    const store = agentStore(m.fetch, {
      frontendTools: {
        get_location: async (args, ctx) => { seen.push([args, ctx.tool.tool_call_id, ctx.run.id]); return { lat: 1 } },
        explode: async () => { throw new Error('gps off') },
      },
    })
    await store.send('hi')
    await until(store, (s) => s.runs[0]!.status === 'completed')
    expect(seen).toEqual([[{}, 'c3', 'r1']])
    const tools = JSON.parse(bodyParam(m.calls[1]!, 'tools')!)
    expect(tools).toEqual([
      expect.objectContaining({ tool_call_id: 'c3', result: '{"lat":1}' }),
      expect.objectContaining({ tool_call_id: 'c4', tool_call_error: true, result: 'gps off' }),
    ])
  })

  test('partial: unmapped or non-external tools keep the run paused; resolveTool completes it', async () => {
    const m = mockFetch((call) => (call.url.endsWith('/continue') ? continued('r1') : pausedWith('r1', [extTool, confirmTool, { ...extTool, tool_call_id: 'c5', tool_name: 'manual' }])))
    const store = agentStore(m.fetch, { frontendTools: { get_location: async () => 'here' } })
    await store.send('hi')
    await wait(20)
    const s = store.getSnapshot()
    expect(s.runs[0]!.status).toBe('paused')
    expect(s.pending!.tools.find((t) => t.tool_call_id === 'c3')!.result).toBe('here') // resolved, still listed
    store.resolveTool('c5', { ok: true })
    expect(store.getSnapshot().pending!.tools.find((t) => t.tool_call_id === 'c5')!.result).toBe('{"ok":true}')
    await store.continue([confirm(confirmTool)])
    const tools = JSON.parse(bodyParam(m.calls[1]!, 'tools')!)
    expect(tools.map((t: { tool_call_id: string }) => t.tool_call_id).sort()).toEqual(['c1', 'c3', 'c5'])
  })

  test('hydrated PAUSED run does not auto-run; runTools() does', async () => {
    const m = mockFetch((call) => {
      if (call.url.includes('/sessions/s1/runs')) return json([{ run_id: 'r1', agent_id: 'a', status: 'PAUSED', tools: [extTool] }])
      if (call.url.endsWith('/agents/a/runs/r1')) return json({ run_id: 'r1', agent_id: 'a', status: 'PAUSED', tools: [extTool] })
      if (call.url.endsWith('/continue')) return continued('r1')
      throw new Error('unexpected ' + call.url)
    })
    let calls = 0
    const store = agentStore(m.fetch, { sessionId: 's1', frontendTools: { get_location: async () => { calls++; return 'x' } } })
    await until(store, (s) => s.status === 'ready')
    await wait(20)
    expect(calls).toBe(0)
    expect(store.getSnapshot().runs[0]!.status).toBe('paused')
    await store.runTools()
    await until(store, (s) => s.runs[0]!.status === 'completed')
    expect(calls).toBe(1)
  })

  test('setFrontendTools swaps the map used at the next pause', async () => {
    const m = mockFetch((call) => (call.url.endsWith('/continue') ? continued('r1') : pausedWith('r1', [extTool])))
    const store = agentStore(m.fetch)
    store.setFrontendTools({ get_location: async () => 'late' })
    await store.send('hi')
    await until(store, (s) => s.runs[0]!.status === 'completed')
    expect(JSON.parse(bodyParam(m.calls[1]!, 'tools')!)[0].result).toBe('late')
  })
})
```

- [ ] **Step 2: Run; fix `store.ts` only where a test proves a defect; commit**

Run: `cd packages/agno-hooks && bun test test/store && bun run typecheck` — Expected: PASS.

```bash
git add packages/agno-hooks/test/store/hitl.test.ts packages/agno-hooks/src/store/store.ts
git commit -m "test(agno-hooks): HITL flows — continue wiring, approvals, frontend tools"
```

---

### Task 10: React layer (`react/provider.tsx`, `react/hooks.ts`)

**Files:**
- Create: `packages/agno-hooks/src/react/provider.tsx`, `packages/agno-hooks/src/react/hooks.ts`, `packages/agno-hooks/test/react/hooks.test.tsx`
- Modify: `packages/agno-hooks/test/dom.ts` (act environment flag)

**Interfaces:**
- Consumes: `createAgnoStore`, `AgnoStore` (Task 8); `createAgnoApi`, `AgnoApi`, `AgnoApiConfig` from `@rodrigocoliveira/agno-api`.
- Produces: `AgnoProvider`, `useAgnoApi()`, `createRegistry()` (internal, exported for tests), `useAgnoAgent(o)`, `useAgnoTeam(o)`, `useAgnoWorkflow(o)`, `AgnoHook<K>`, `AgentHookOptions`, `TeamHookOptions`, `WorkflowHookOptions`.

- [ ] **Step 1: `test/dom.ts`** — append after the register call:

```ts
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
```

- [ ] **Step 2: Failing tests** — `test/react/hooks.test.tsx`

```tsx
import { afterEach, describe, expect, test } from 'bun:test'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { StrictMode, useEffect } from 'react'
import { AgnoProvider, createRegistry } from '../../src/react/provider'
import { useAgnoAgent } from '../../src/react/hooks'
import type { AgnoStore } from '../../src/store/store'
import type { AnyEvent } from '../../src/types'
import { apiWith, bodyParam, frames, json, mockFetch } from '../store/helpers'

afterEach(cleanup)

const rows = (sessionId: string) => json([{ run_id: `${sessionId}-r1`, agent_id: 'a', status: 'COMPLETED', run_input: 'hi', content: `history of ${sessionId}` }])

function Chat({ sessionId, onStore, tools }: { sessionId?: string; onStore?: (s: AgnoStore<'agent'>) => void; tools?: Record<string, () => Promise<string>> }) {
  const chat = useAgnoAgent({ agentId: 'a', sessionId, frontendTools: tools })
  useEffect(() => { onStore?.(chat.store) }, [chat.store, onStore])
  return <div>
    <span data-testid="status">{chat.status}</span>
    <span data-testid="session">{chat.sessionId ?? '-'}</span>
    <span data-testid="content">{chat.runs.map((r) => r.content).join('|')}</span>
    <button onClick={() => void chat.send('hi')}>send</button>
  </div>
}

describe('AgnoProvider + useAgnoAgent', () => {
  test('hydrates through the provider api; two components share one store; StrictMode does not double-fetch', async () => {
    const m = mockFetch((call) => (call.url.includes('/sessions/s1/runs') ? rows('s1') : json({}, 404)))
    const stores: AgnoStore<'agent'>[] = []
    const { getAllByTestId } = render(
      <StrictMode>
        <AgnoProvider api={apiWith(m.fetch)}>
          <Chat sessionId="s1" onStore={(s) => stores.push(s)} />
          <Chat sessionId="s1" onStore={(s) => stores.push(s)} />
        </AgnoProvider>
      </StrictMode>,
    )
    await waitFor(() => expect(getAllByTestId('status').map((e) => e.textContent)).toEqual(['ready', 'ready']))
    expect(getAllByTestId('content')[0]!.textContent).toBe('history of s1')
    expect(new Set(stores).size).toBe(1)
    expect(m.calls.filter((c) => c.url.includes('/sessions/s1/runs'))).toHaveLength(1)
  })

  test('config props create the api once; useAgnoApi exposes it', async () => {
    const m = mockFetch((call) => (call.url.includes('/sessions/s1/runs') ? rows('s1') : json({}, 404)))
    const { getByTestId } = render(
      <AgnoProvider baseUrl="http://x" token={() => 'tok'} fetch={m.fetch}>
        <Chat sessionId="s1" />
      </AgnoProvider>,
    )
    await waitFor(() => expect(getByTestId('status').textContent).toBe('ready'))
    expect(new Headers(m.calls[0]!.init.headers).get('authorization')).toBe('Bearer tok')
  })

  test('changing sessionId swaps the store; learning the id from a send keeps it', async () => {
    const m = mockFetch((call) => {
      if (call.url.includes('/sessions/s1/runs')) return rows('s1')
      if (call.url.includes('/sessions/s2/runs')) return rows('s2')
      if (call.url.endsWith('/agents/a/runs')) return frames([{ event: 'RunStarted', run_id: 'r9', session_id: 'new-9', event_index: 0 } as AnyEvent, { event: 'RunCompleted', run_id: 'r9', content: 'fresh', event_index: 1 } as AnyEvent])
      return json({}, 404)
    })
    const stores: AgnoStore<'agent'>[] = []
    const api = apiWith(m.fetch)
    const ui = (sessionId?: string) => <AgnoProvider api={api}><Chat sessionId={sessionId} onStore={(s) => stores.push(s)} /></AgnoProvider>
    const { getByTestId, getByText, rerender } = render(ui('s1'))
    await waitFor(() => expect(getByTestId('content').textContent).toBe('history of s1'))
    rerender(ui('s2'))
    await waitFor(() => expect(getByTestId('content').textContent).toBe('history of s2'))
    expect(new Set(stores).size).toBe(2)

    rerender(ui(undefined))
    await waitFor(() => expect(getByTestId('content').textContent).toBe(''))
    await act(async () => { getByText('send').click() })
    await waitFor(() => expect(getByTestId('session').textContent).toBe('new-9'))
    const learned = stores.at(-1)!
    rerender(ui('new-9'))
    await waitFor(() => expect(getByTestId('content').textContent).toBe('fresh'))
    expect(stores.at(-1)).toBe(learned)
    expect(m.calls.some((c) => c.url.includes('/sessions/new-9/runs'))).toBe(false)
  })

  test('inline frontendTools always use the latest closure', async () => {
    const ext = { tool_call_id: 'c3', tool_name: 'get_location', tool_args: {}, external_execution_required: true }
    const m = mockFetch((call) => call.url.endsWith('/continue')
      ? frames([{ event: 'RunContinued', run_id: 'r1' } as AnyEvent, { event: 'RunCompleted', run_id: 'r1', content: 'ok' } as AnyEvent])
      : frames([{ event: 'RunStarted', run_id: 'r1', session_id: 's' } as AnyEvent, { event: 'RunPaused', run_id: 'r1', tools: [ext] } as AnyEvent]))
    const api = apiWith(m.fetch)
    const ui = (v: string) => <AgnoProvider api={api}><Chat tools={{ get_location: async () => v }} /></AgnoProvider>
    const { getByText, getByTestId, rerender } = render(ui('v1'))
    rerender(ui('v2'))
    await act(async () => { getByText('send').click() })
    await waitFor(() => expect(getByTestId('content').textContent).toBe('ok'))
    expect(JSON.parse(bodyParam(m.calls[1]!, 'tools')!)[0].result).toBe('v2')
  })

  test('registry destroys a store only after the last release', async () => {
    const reg = createRegistry()
    let destroyed = 0
    const fake = { destroy: () => destroyed++ } as unknown as AgnoStore<'agent'>
    expect(reg.get('k', () => fake)).toBe(fake)
    reg.retain('k'); reg.retain('k'); reg.release('k')
    await new Promise((r) => setTimeout(r, 5))
    expect(destroyed).toBe(0)
    reg.release('k')
    await new Promise((r) => setTimeout(r, 5))
    expect(destroyed).toBe(1)
    reg.get('old', () => fake); reg.retain('old'); reg.rekey('old', 'new'); reg.retain('new'); reg.release('old'); reg.release('new')
    await new Promise((r) => setTimeout(r, 5))
    expect(destroyed).toBe(2)
  })
})
```

Run: `cd packages/agno-hooks && bun test --preload ./test/dom.ts test/react` — Expected: FAIL (modules missing).

- [ ] **Step 3: `src/react/provider.tsx`**

```tsx
import { createAgnoApi, type AgnoApi, type AgnoApiConfig } from '@rodrigocoliveira/agno-api'
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AgnoStore } from '../store/store'
import type { Kind } from '../types'

type AnyStore = AgnoStore<Kind>
interface Entry { store: AnyStore; refs: number; timer: ReturnType<typeof setTimeout> | null }

export interface Registry {
  /** Returns the store for `key`, creating it when missing. Does not change the ref count. */
  get(key: string, create: () => AnyStore): AnyStore
  retain(key: string): void
  /** When the count reaches zero, destroys on the next tick unless retained again (StrictMode mount/unmount/mount). */
  release(key: string): void
  /** Moves an entry to a new key; the old key keeps working for retain/release of hooks that still hold it. */
  rekey(oldKey: string, newKey: string): void
  clear(): void
}

export function createRegistry(): Registry {
  const entries = new Map<string, Entry>()
  const aliases = new Map<string, string>()
  const resolve = (key: string) => { let k = key; while (aliases.has(k)) k = aliases.get(k)!; return k }
  return {
    get(key, create) {
      aliases.delete(key)
      let e = entries.get(key)
      if (!e) { e = { store: create(), refs: 0, timer: null }; entries.set(key, e) }
      return e.store
    },
    retain(key) {
      const e = entries.get(resolve(key)); if (!e) return
      e.refs++
      if (e.timer) { clearTimeout(e.timer); e.timer = null }
    },
    release(key) {
      const k = resolve(key); const e = entries.get(k); if (!e) return
      e.refs = Math.max(0, e.refs - 1)
      if (e.refs === 0 && !e.timer) {
        e.timer = setTimeout(() => {
          e.timer = null
          if (e.refs !== 0 || entries.get(k) !== e) return
          entries.delete(k); e.store.destroy()
          for (const [a, target] of aliases) if (target === k) aliases.delete(a)
        }, 0)
      }
    },
    rekey(oldKey, newKey) {
      const k = resolve(oldKey); const e = entries.get(k)
      if (!e || k === newKey || entries.has(newKey)) return
      entries.delete(k); entries.set(newKey, e); aliases.set(k, newKey)
    },
    clear() {
      for (const e of entries.values()) { if (e.timer) clearTimeout(e.timer); e.store.destroy() }
      entries.clear(); aliases.clear()
    },
  }
}

export interface AgnoContextValue { api: AgnoApi; registry: Registry }
const AgnoContext = createContext<AgnoContextValue | null>(null)

export interface AgnoProviderProps extends Partial<AgnoApiConfig> {
  /** A ready instance; wins over the config props. */
  api?: AgnoApi
  children?: ReactNode
}

/**
 * One connection. Creates the AgnoApi once from the config props (token / onTokenExpired are read through refs,
 * so inline closures never recreate it); recreates only when baseUrl, params, headers or fetch change.
 */
export function AgnoProvider({ api: given, children, ...config }: AgnoProviderProps) {
  const tokenRef = useRef(config.token); tokenRef.current = config.token
  const expiredRef = useRef(config.onTokenExpired); expiredRef.current = config.onTokenExpired
  const paramsKey = JSON.stringify(config.params ?? null)
  const headersKey = JSON.stringify(config.headers ?? null)
  const api = useMemo<AgnoApi>(() => {
    if (given) return given
    if (!config.baseUrl) throw new Error('AgnoProvider needs either `api` or `baseUrl`')
    return createAgnoApi({
      baseUrl: config.baseUrl,
      params: config.params,
      headers: config.headers,
      fetch: config.fetch,
      token: () => { const t = tokenRef.current; return typeof t === 'function' ? t() : t },
      onTokenExpired: () => expiredRef.current?.(),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [given, config.baseUrl, paramsKey, headersKey, config.fetch])
  const [registries] = useState(() => new WeakMap<AgnoApi, Registry>())
  const registry = useMemo(() => { let r = registries.get(api); if (!r) { r = createRegistry(); registries.set(api, r) } return r }, [api, registries])
  useEffect(() => () => registry.clear(), [registry])
  const value = useMemo(() => ({ api, registry }), [api, registry])
  return <AgnoContext.Provider value={value}>{children}</AgnoContext.Provider>
}

export function useAgnoContext(): AgnoContextValue {
  const ctx = useContext(AgnoContext)
  if (!ctx) throw new Error('useAgno* hooks must be used inside <AgnoProvider>')
  return ctx
}

export const useAgnoApi = (): AgnoApi => useAgnoContext().api
```

`TokenSource` in `packages/agno-api/src/transport.ts` is `string | (() => string | undefined | Promise<string | undefined>)`, which is why the ternary above handles both.

- [ ] **Step 4: `src/react/hooks.ts`**

```ts
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { createAgnoStore, type AgnoStore } from '../store/store'
import type { FrontendTool, Kind, Snapshot } from '../types'
import { useAgnoContext, type Registry } from './provider'

export interface AgnoHook<K extends Kind> extends Snapshot<K> {
  send: AgnoStore<K>['send']
  continue: AgnoStore<K>['continue']
  resolveTool: AgnoStore<K>['resolveTool']
  runTools: AgnoStore<K>['runTools']
  resume: AgnoStore<K>['resume']
  cancel: AgnoStore<K>['cancel']
  store: AgnoStore<K>
}

interface CommonOptions { sessionId?: string | null; background?: boolean; frontendTools?: Record<string, FrontendTool> }
export interface AgentHookOptions extends CommonOptions { agentId: string }
export interface TeamHookOptions extends CommonOptions { teamId: string }
export interface WorkflowHookOptions extends Omit<CommonOptions, 'frontendTools'> { workflowId: string }

const SERVER_SNAPSHOT = { status: 'loading', sessionId: null, runs: [], pending: null, isBusy: false, error: null } as const

function useAgnoStore<K extends Kind>(kind: K, targetId: string, opts: CommonOptions): AgnoHook<K> {
  const { api, registry } = useAgnoContext()
  const sessionId = opts.sessionId ?? null
  const wanted = `${kind}:${targetId}:${sessionId ?? '@new'}`
  const ref = useRef<{ key: string; registry: Registry; store: AgnoStore<K> } | null>(null)
  if (!ref.current || ref.current.key !== wanted || ref.current.registry !== registry) {
    const prev = ref.current
    const learned = prev && prev.registry === registry && prev.key === `${kind}:${targetId}:@new` && sessionId !== null && prev.store.getSnapshot().sessionId === sessionId
    if (learned) {
      registry.rekey(prev.key, wanted)
      ref.current = { key: wanted, registry, store: prev.store }
    } else {
      const store = registry.get(wanted, () => createAgnoStore({
        api, target: { kind, id: targetId }, sessionId, background: opts.background, frontendTools: opts.frontendTools,
      })) as AgnoStore<K>
      ref.current = { key: wanted, registry, store }
    }
  }
  const store = ref.current.store
  useEffect(() => { registry.retain(wanted); return () => registry.release(wanted) }, [registry, wanted])
  useEffect(() => { store.setFrontendTools(opts.frontendTools) })
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, () => SERVER_SNAPSHOT as unknown as Snapshot<K>)
  return useMemo(() => ({
    ...snapshot,
    send: store.send, continue: store.continue, resolveTool: store.resolveTool, runTools: store.runTools,
    resume: store.resume, cancel: store.cancel, store,
  }), [snapshot, store])
}

export const useAgnoAgent = (o: AgentHookOptions) => useAgnoStore('agent', o.agentId, o)
export const useAgnoTeam = (o: TeamHookOptions) => useAgnoStore('team', o.teamId, o)
export const useAgnoWorkflow = (o: WorkflowHookOptions) => useAgnoStore('workflow', o.workflowId, o)
```

- [ ] **Step 5: Run, commit**

Run: `cd packages/agno-hooks && bun run test && bun run typecheck` — Expected: PASS (both `bun test` invocations of the package script).

```bash
git add packages/agno-hooks/src/react packages/agno-hooks/test/react packages/agno-hooks/test/dom.ts
git commit -m "feat(agno-hooks): AgnoProvider, store registry and useAgnoAgent/Team/Workflow"
```

---

### Task 11: Public surface, README, changeset

**Files:**
- Modify: `packages/agno-hooks/src/index.ts`, root `README.md`
- Create: `packages/agno-hooks/README.md`, `packages/agno-hooks/test/exports.test.ts`, `.changeset/agno-hooks-initial.md`

- [ ] **Step 1: Failing test** — `test/exports.test.ts` (add `test/exports.test.ts` to the first `bun test` list in the package `test` script):

```ts
import { expect, test } from 'bun:test'
import * as hooks from '../src'

test('runtime exports are exactly the documented ones', () => {
  expect(Object.keys(hooks).sort()).toEqual([
    'AgnoProvider', 'confirm', 'createAgnoStore', 'fromServerStatus', 'isTerminal', 'isToolPending', 'pendingTools',
    'provideUserFeedback', 'provideUserInput', 'reject', 'setExternalResult', 'useAgnoAgent', 'useAgnoApi', 'useAgnoTeam', 'useAgnoWorkflow',
  ])
})
```

- [ ] **Step 2: `src/index.ts`**

```ts
export type * from './types'
export { fromServerStatus, isTerminal } from './types'
export { createAgnoStore } from './store/store'
export type { AgnoStore, StoreOptions } from './store/store'
export { isToolPending, pendingTools, confirm, reject, provideUserInput, provideUserFeedback, setExternalResult } from './run/hitl'
export { AgnoProvider, useAgnoApi } from './react/provider'
export type { AgnoProviderProps } from './react/provider'
export { useAgnoAgent, useAgnoTeam, useAgnoWorkflow } from './react/hooks'
export type { AgnoHook, AgentHookOptions, TeamHookOptions, WorkflowHookOptions } from './react/hooks'
```

Run: `bun test test/exports.test.ts` — Expected: PASS.

- [ ] **Step 3: `packages/agno-hooks/README.md`**

Write it in English, same tone as `packages/agno-api/README.md`, with these sections and code (copy the snippets verbatim; they must match the API):

1. Title + one paragraph: session store and React hooks for AgentOS v3; the unit of state is the run; built on `@rodrigocoliveira/agno-api`.
2. Install: `bun add @rodrigocoliveira/agno-hooks @rodrigocoliveira/agno-api react`.
3. Provider:
```tsx
import { AgnoProvider } from '@rodrigocoliveira/agno-hooks'

<AgnoProvider baseUrl="https://agentos.example.com" token={() => session.token} onTokenExpired={() => refresh()}>
  <App />
</AgnoProvider>
```
4. Chat with an agent (status, runs, send, isBusy, a `RunView` rendering `run.input.message`, `run.tools` chips and `run.content`).
5. Sessions: `sessionId` optional; no id → server creates one, `chat.sessionId` exposes it; change the prop to open another session; sidebar with `useAgnoApi().sessions.list(...)`.
6. Background runs and reload: default `background: true`; reload → history + `resume`; `chat.resume(run.id)` after `run.error === 'Connection lost'`.
7. Human in the loop: the table from spec §6.1 (flag → what you return → server behaviour), `chat.pending` rendered outside the chat flow, `isToolPending`, helpers `confirm/reject/provideUserInput/provideUserFeedback/setExternalResult`, `continue(decisions, extra)`, admin approvals (`approval_id`, 403, `continue([])`).
8. Frontend tools: `frontendTools` map, automatic continue, `resolveTool` / `runTools` for the manual path, note that hydrated pauses do not auto-run.
9. Teams and workflows: `useAgnoTeam` (`run.members`, member pauses in `pending`), `useAgnoWorkflow` (`run.steps`, `pending.stepRequirements`, `continue([{ ...sr, confirmed: true }])`).
10. Without React: `createAgnoStore` + `getSnapshot`/`subscribe`.
11. Errors: the table from spec §8.
12. What is not here (links to issues #4 #5 #6 #7).

Also replace the root `README.md` content with:

```md
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
```

- [ ] **Step 4: Changeset and commit**

`.changeset/agno-hooks-initial.md`:

```md
---
"@rodrigocoliveira/agno-hooks": minor
---

First release: `createAgnoStore` (run-based session state, background streaming with resume, HITL in Agno's vocabulary, frontend tools) and `useAgnoAgent` / `useAgnoTeam` / `useAgnoWorkflow` behind `AgnoProvider`.
```

Run: `cd packages/agno-hooks && bun run test && bun run typecheck && bun run build && ls dist` — Expected: PASS; `dist/index.js`, `dist/index.cjs`, `dist/index.d.ts` present.

```bash
git add packages/agno-hooks README.md .changeset/agno-hooks-initial.md
git commit -m "docs(agno-hooks): public surface, README and changeset"
```

---

### Task 12: Local AgentOS scripts for HITL and the E2E suite

**Files:**
- Modify: `examples/agentos/scripted_model.py`, `examples/agentos/server.py`, `examples/agentos/README.md`
- Create: `packages/agno-hooks/test/e2e/store.e2e.test.ts`, `packages/agno-hooks/test/e2e/README.md`

**Interfaces:**
- Server ids: agent `test-agent` (tools `add_one` requires_confirmation, `get_location` external_execution, `ask_user` via `UserFeedbackTools`), team `test-team`, workflows `test-workflow` and `test-workflow-hitl` (step `echo` with `HumanReview(requires_confirmation=True)`).
- Scripted triggers (last user message, case-insensitive): contains `ask` → `ask_user`; contains `locate` → `get_location`; contains `tool` → `add_one(x=41)`; a team leader always delegates first; otherwise `Echo: <message>` streamed word by word; after any tool result → `Done after tool.`

- [ ] **Step 1: `scripted_model.py`** — replace `_plan` with:

```python
    def _plan(self, messages: List[Message], tools: Optional[List[dict]]):
        last_user = next((m for m in reversed(messages) if m.role == "user"), None)
        text = str(last_user.content) if last_user and last_user.content else ""
        low = text.lower()
        has_tool_result = any(m.role == "tool" for m in messages)
        names = [(t.get("function") or t).get("name") for t in (tools or [])]
        if "delegate_task_to_member" in names and not has_tool_result:
            return "tool", ("delegate_task_to_member", {"member_id": self.delegate_to, "task": text})
        if tools and not has_tool_result:
            if "ask" in low and "ask_user" in names:
                return "tool", ("ask_user", {"questions": [{
                    "header": "Use", "question": "Where do you run?",
                    "options": [{"label": "Trail", "description": "Off road"}, {"label": "Road"}], "multi_select": False,
                }]})
            if "locate" in low and "get_location" in names:
                return "tool", ("get_location", {})
            if "tool" in low:
                fn = "add_one" if "add_one" in names else next(n for n in names if n != "delegate_task_to_member")
                return "tool", (fn, {"x": 41})
        return "text", ("Done after tool." if has_tool_result else f"Echo: {text}")
```

Update the module docstring to list the four triggers.

- [ ] **Step 2: `server.py`**

```python
import os

from agno.agent import Agent
from agno.db.sqlite import SqliteDb
from agno.os import AgentOS
from agno.team import Team
from agno.tools import tool
from agno.tools.user_feedback import UserFeedbackTools
from agno.workflow import Step, Workflow
from agno.workflow.types import HumanReview

from scripted_model import ScriptedModel


@tool(requires_confirmation=True)
def add_one(x: int) -> str:
    """Add one to x."""
    return str(x + 1)


@tool(external_execution=True)
def get_location() -> str:
    """Return the user's location. Executed by the frontend."""
    return ""


db = SqliteDb(db_file="tmp/agentos.db")
agent = Agent(
    id="test-agent", name="Test Agent", model=ScriptedModel(),
    tools=[add_one, get_location, UserFeedbackTools()], db=db, markdown=False,
)
team = Team(id="test-team", name="Test Team", model=ScriptedModel(), members=[agent], db=db)
workflow = Workflow(id="test-workflow", name="Test Workflow", db=db, steps=[Step(name="echo", agent=agent)])
workflow_hitl = Workflow(
    id="test-workflow-hitl", name="Test Workflow HITL", db=db,
    steps=[Step(name="echo", agent=agent, human_review=HumanReview(requires_confirmation=True, confirmation_message="Run echo?"))],
)
agent_os = AgentOS(id="spike", agents=[agent], teams=[team], workflows=[workflow, workflow_hitl], db=db)
app = agent_os.get_app()

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("AGNO_PORT", "7777")))
```

If `from agno.workflow.types import HumanReview` fails, find the class with `grep -rn "^class HumanReview" examples/agentos/.venv/lib/python3.12/site-packages/agno` and import from there. Start the server (`AGNO_PORT=7778 bun run agentos`) and confirm `curl localhost:7778/health` returns 200; run the existing suite `AGNO_URL=http://localhost:7778 bun test packages/agno-api/test/e2e` — it must still pass (its "Use the tool that needs confirmation." message still triggers `add_one`).

Update `examples/agentos/README.md` "What the scripted model does" with the four triggers and the new ids.

- [ ] **Step 3: E2E tests** — `packages/agno-hooks/test/e2e/store.e2e.test.ts`

```ts
import { describe, expect, test } from 'bun:test'
import { createAgnoApi } from '@rodrigocoliveira/agno-api'
import { confirm, provideUserFeedback } from '../../src/run/hitl'
import { createAgnoStore } from '../../src/store/store'
import { until } from '../store/helpers'

const url = process.env.AGNO_URL
const e2e = url ? describe : describe.skip
const api = createAgnoApi({ baseUrl: url ?? 'http://unused', token: process.env.AGNO_TOKEN })
const ids = { agent: 'test-agent', team: 'test-team', workflow: 'test-workflow', workflowHitl: 'test-workflow-hitl' }
const uid = () => `hooks-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const agent = (sessionId?: string, frontendTools?: Record<string, () => Promise<unknown>>) =>
  createAgnoStore({ api, target: { kind: 'agent', id: ids.agent }, sessionId, frontendTools })

e2e('agno-hooks store (live)', () => {
  test('send → completed; a fresh store hydrates the same run', async () => {
    const s = agent()
    await s.send('hello there')
    const a = s.getSnapshot()
    expect(a.runs[0]).toMatchObject({ status: 'completed', content: 'Echo: hello there ', input: { message: 'hello there' } })
    expect(a.sessionId).toBeTruthy()
    const h = await until(agent(a.sessionId!), (x) => x.status === 'ready')
    expect(h.runs.map((r) => [r.id, r.status, r.content, r.input.message])).toEqual(a.runs.map((r) => [r.id, r.status, r.content, r.input.message]))
    s.destroy()
  })

  test('confirmation: pause → continue(confirm) → completed, answer persisted', async () => {
    const s = agent(uid())
    await s.send('Use the tool that needs confirmation.')
    const p = s.getSnapshot().pending!
    expect(p.tools[0]).toMatchObject({ tool_name: 'add_one', requires_confirmation: true })
    await s.continue([confirm(p.tools[0]!)])
    expect(s.getSnapshot().runs[0]!.status).toBe('completed')
    const h = await until(agent(s.getSnapshot().sessionId!), (x) => x.status === 'ready')
    expect(h.runs[0]!.tools.find((t) => t.tool_name === 'add_one')).toMatchObject({ confirmed: true, result: '42' })
    s.destroy()
  })

  test('ask_user: user_feedback_schema → provideUserFeedback → selected_options persisted', async () => {
    const s = agent(uid())
    await s.send('please ask me')
    const t = s.getSnapshot().pending!.tools[0]!
    expect(t.tool_name).toBe('ask_user')
    expect(t.user_feedback_schema![0]!.options!.map((o) => o.label)).toEqual(['Trail', 'Road'])
    await s.continue([provideUserFeedback(t, { 'Where do you run?': ['Trail'] })])
    const done = s.getSnapshot().runs[0]!
    expect(done.status).toBe('completed')
    expect(done.tools[0]!.user_feedback_schema![0]!.selected_options).toEqual(['Trail'])
    const h = await until(agent(done.sessionId!), (x) => x.status === 'ready')
    expect(h.runs[0]!.tools[0]!.user_feedback_schema![0]!.selected_options).toEqual(['Trail'])
    s.destroy()
  })

  test('frontend tool: executed by the map, continued automatically', async () => {
    const s = agent(uid(), { get_location: async () => ({ lat: -23.5, lng: -46.6 }) })
    await s.send('locate me')
    await until(s, (x) => x.runs[0]!.status === 'completed')
    expect(s.getSnapshot().pending).toBeNull()
    expect(s.getSnapshot().runs[0]!.tools.find((t) => t.tool_name === 'get_location')!.result).toBe('{"lat":-23.5,"lng":-46.6}')
    s.destroy()
  })

  test('reload while streaming: the new store reattaches and ends with the full content', async () => {
    const s = agent(uid())
    const p = s.send('one two three four five six seven eight nine ten')
    await until(s, (x) => x.runs[0]!.id.startsWith('local-') === false)
    s.destroy()
    await p
    const fresh = agent(s.getSnapshot().sessionId!)
    const h = await until(fresh, (x) => x.status === 'ready' && x.runs[0]?.status === 'completed', 10000)
    expect(h.runs[0]!.content).toBe('Echo: one two three four five six seven eight nine ten ')
    fresh.destroy()
  })

  test('team: members are streamed; a member pause is continued through requirements', async () => {
    const t = createAgnoStore({ api, target: { kind: 'team', id: ids.team }, sessionId: uid() })
    await t.send('hi team')
    const r = t.getSnapshot().runs[0]!
    expect(r.status).toBe('completed')
    expect(r.members[0]).toMatchObject({ status: 'completed', content: 'Echo: hi team ' })

    const h = createAgnoStore({ api, target: { kind: 'team', id: ids.team }, sessionId: uid() })
    await h.send('Use the tool that needs confirmation.')
    const pending = h.getSnapshot().pending!
    expect(pending.tools[0]!.tool_name).toBe('add_one')
    await h.continue([confirm(pending.tools[0]!)])
    expect(h.getSnapshot().runs[0]!.status).toBe('completed')
    const back = await until(createAgnoStore({ api, target: { kind: 'team', id: ids.team }, sessionId: h.getSnapshot().sessionId }), (x) => x.status === 'ready')
    expect(back.runs[0]!.members).toHaveLength(1)
    t.destroy(); h.destroy()
  })

  test('workflow: steps; HITL step confirmed through step_requirements', async () => {
    const w = createAgnoStore({ api, target: { kind: 'workflow', id: ids.workflow }, sessionId: uid() })
    await w.send('hi wf')
    expect(w.getSnapshot().runs[0]!.steps[0]).toMatchObject({ name: 'echo', status: 'completed', content: 'Echo: hi wf ' })

    const h = createAgnoStore({ api, target: { kind: 'workflow', id: ids.workflowHitl }, sessionId: uid() })
    await h.send('hi hitl')
    const p = h.getSnapshot().pending!
    expect(h.getSnapshot().runs[0]!.pauseKind).toBe('step')
    expect(p.stepRequirements.at(-1)).toMatchObject({ step_name: 'echo', requires_confirmation: true })
    await h.continue([{ ...p.stepRequirements.at(-1)!, confirmed: true }])
    expect(h.getSnapshot().runs[0]!.status).toBe('completed')
    w.destroy(); h.destroy()
  })
})
```

`test/e2e/README.md`: three lines — how to start the server (`AGNO_PORT=7778 bun run agentos`), how to run (`AGNO_URL=http://localhost:7778 bun run test:e2e`), and that the suite is skipped without `AGNO_URL`.

- [ ] **Step 4: Run everything live, fix, commit**

Run (server on 7778): `AGNO_URL=http://localhost:7778 bun run test:e2e` — Expected: agno-api 14 tests + these 7 pass. Where the live shape differs from the plan (for example a step requirement field name), fix the **store or reducer**, never the assertion's intent; record what changed in the commit body.

```bash
git add examples/agentos packages/agno-hooks/test/e2e packages/agno-hooks/src
git commit -m "test(agno-hooks): E2E against examples/agentos with ask_user, frontend tool and workflow HITL"
```

---

### Task 13: `examples/react` and CI

**Files:**
- Create: `examples/react/package.json`, `index.html`, `vite.config.ts`, `tsconfig.json`, `README.md`, `src/main.tsx`, `src/App.tsx`, `src/Sidebar.tsx`, `src/RunView.tsx`, `src/PendingPanel.tsx`, `src/AgentView.tsx`, `src/TeamView.tsx`, `src/WorkflowView.tsx`, `src/styles.css`
- Modify: root `package.json` (`example` script), `.github/workflows/ci.yml` (build the example)

**Interfaces:**
- Consumes the whole public surface of `@rodrigocoliveira/agno-hooks` (Task 11) and `api.sessions.list` from `agno-api`.

- [ ] **Step 1: Package and build files**

`examples/react/package.json`:

```json
{
  "name": "react-example",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -p tsconfig.json && vite build",
    "typecheck": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "@rodrigocoliveira/agno-api": "workspace:*",
    "@rodrigocoliveira/agno-hooks": "workspace:*",
    "react": "^19.1.0",
    "react-dom": "^19.1.0"
  },
  "devDependencies": {
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "@vitejs/plugin-react": "^4.4.1",
    "typescript": "^5.9.3",
    "vite": "^6.3.5"
  }
}
```

`examples/react/vite.config.ts` (source aliases so edits in the packages hot-reload; a proxy so the browser never hits CORS):

```ts
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const pkg = (name: string) => fileURLToPath(new URL(`../../packages/${name}/src/index.ts`, import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@rodrigocoliveira/agno-hooks': pkg('agno-hooks'),
      '@rodrigocoliveira/agno-api': pkg('agno-api'),
    },
  },
  server: {
    proxy: {
      '/agno': {
        target: process.env.AGNO_URL ?? 'http://localhost:7778',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/agno/, ''),
      },
    },
  },
})
```

`examples/react/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "jsx": "react-jsx", "types": ["vite/client"] },
  "include": ["src", "vite.config.ts"]
}
```

`examples/react/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>agno-hooks example</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: App shell** — `src/main.tsx`, `src/App.tsx`, `src/Sidebar.tsx`, `src/styles.css`

`src/main.tsx`:

```tsx
import { AgnoProvider } from '@rodrigocoliveira/agno-hooks'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AgnoProvider baseUrl="/agno">
      <App />
    </AgnoProvider>
  </StrictMode>,
)
```

`src/App.tsx` — tab per target, session id in the URL hash (`#agent/<sessionId>`):

```tsx
import { useEffect, useState } from 'react'
import { AgentView } from './AgentView'
import { Sidebar } from './Sidebar'
import { TeamView } from './TeamView'
import { WorkflowView } from './WorkflowView'

export type Tab = 'agent' | 'team' | 'workflow'
const IDS: Record<Tab, string> = { agent: 'test-agent', team: 'test-team', workflow: 'test-workflow-hitl' }

function readHash(): { tab: Tab; sessionId?: string } {
  const [tab, sessionId] = location.hash.slice(1).split('/')
  return { tab: (tab === 'team' || tab === 'workflow' ? tab : 'agent'), sessionId: sessionId || undefined }
}

export function App() {
  const [route, setRoute] = useState(readHash)
  useEffect(() => {
    const onHash = () => setRoute(readHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const go = (tab: Tab, sessionId?: string) => { location.hash = sessionId ? `${tab}/${sessionId}` : tab }
  const onSession = (sessionId: string | null) => { if (sessionId && sessionId !== route.sessionId) go(route.tab, sessionId) }

  return (
    <div className="app">
      <Sidebar tab={route.tab} targetId={IDS[route.tab]} sessionId={route.sessionId} onPick={(id) => go(route.tab, id)} onNew={() => go(route.tab)} onTab={(t) => go(t)} />
      <main>
        {route.tab === 'agent' && <AgentView agentId={IDS.agent} sessionId={route.sessionId} onSession={onSession} />}
        {route.tab === 'team' && <TeamView teamId={IDS.team} sessionId={route.sessionId} onSession={onSession} />}
        {route.tab === 'workflow' && <WorkflowView workflowId={IDS.workflow} sessionId={route.sessionId} onSession={onSession} />}
      </main>
    </div>
  )
}
```

`src/Sidebar.tsx` — the one place that uses `agno-api` directly (sessions list is out of the 1.0 hooks scope):

```tsx
import { useAgnoApi } from '@rodrigocoliveira/agno-hooks'
import { useEffect, useState } from 'react'
import type { Tab } from './App'

interface Row { session_id?: string | null; session_name?: string | null; created_at?: string | null }

export function Sidebar(p: { tab: Tab; targetId: string; sessionId?: string; onPick: (id: string) => void; onNew: () => void; onTab: (t: Tab) => void }) {
  const api = useAgnoApi()
  const [rows, setRows] = useState<Row[]>([])
  useEffect(() => {
    let alive = true
    api.sessions.list({ type: p.tab, component_id: p.targetId, limit: 50 } as never)
      .then((res) => { if (alive) setRows(((res as { data?: Row[] }).data ?? []) as Row[]) })
      .catch(() => { if (alive) setRows([]) })
    return () => { alive = false }
  }, [api, p.tab, p.targetId, p.sessionId])
  return (
    <aside className="sidebar">
      <nav className="tabs">
        {(['agent', 'team', 'workflow'] as Tab[]).map((t) => <button key={t} className={t === p.tab ? 'active' : ''} onClick={() => p.onTab(t)}>{t}</button>)}
      </nav>
      <button className="new" onClick={p.onNew}>+ new session</button>
      <ul>
        {rows.map((r) => (
          <li key={r.session_id!} className={r.session_id === p.sessionId ? 'active' : ''}>
            <button onClick={() => p.onPick(r.session_id!)}>{r.session_name || r.session_id}</button>
          </li>
        ))}
      </ul>
    </aside>
  )
}
```

`GET /sessions` takes `type`, `component_id`, `user_id`, `session_name`, `limit`, `page`, `sort_by` (see `docs/agentos-v3-api-map.md`); the response is a `PaginatedResponse_SessionSchema_` (`{ data, meta }`).

`src/styles.css` (minimal, no library):

```css
* { box-sizing: border-box } body { margin: 0; font: 14px/1.4 system-ui, sans-serif; color: #111 }
.app { display: grid; grid-template-columns: 240px 1fr; height: 100vh }
.sidebar { border-right: 1px solid #ddd; padding: 12px; overflow: auto } .sidebar ul { list-style: none; padding: 0; margin: 8px 0 }
.sidebar li button, .sidebar .new, .tabs button { width: 100%; text-align: left; padding: 6px 8px; border: 0; background: none; cursor: pointer; border-radius: 6px }
.sidebar li.active button, .tabs button.active { background: #eef } .tabs { display: flex; gap: 4px; margin-bottom: 8px } .tabs button { text-align: center }
main { display: flex; flex-direction: column; height: 100vh }
.messages { flex: 1; overflow: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px }
.bubble { max-width: 70%; padding: 8px 12px; border-radius: 12px; white-space: pre-wrap } .bubble.user { align-self: flex-end; background: #dbeafe } .bubble.assistant { align-self: flex-start; background: #f3f4f6 }
.chip { display: inline-block; font-size: 12px; padding: 2px 8px; border-radius: 999px; background: #e5e7eb; margin: 2px 4px 2px 0 } .chip.error { background: #fee2e2 } .chip.pending { background: #fef3c7 }
.pending { border-top: 1px solid #ddd; background: #fffbeb; padding: 12px 16px } .pending .card { border: 1px solid #f59e0b; border-radius: 8px; padding: 10px; margin-bottom: 8px; background: #fff }
.composer { display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid #ddd } .composer input { flex: 1; padding: 8px; border: 1px solid #ccc; border-radius: 6px }
.error { color: #b91c1c } .steps { display: flex; flex-direction: column; gap: 6px } .step { border-left: 3px solid #999; padding-left: 8px } .step.completed { border-color: #16a34a } .step.paused { border-color: #f59e0b }
.members { margin-left: 16px; border-left: 2px dashed #ccc; padding-left: 8px }
```

- [ ] **Step 3: Run rendering** — `src/RunView.tsx` and `src/PendingPanel.tsx`

`src/RunView.tsx`: renders one agent or team run — user bubble, tool chips (`isToolPending` → `pending` chip; `tool_call_error` → `error` chip; `ask_user` answered → the chosen labels), assistant bubble, members (team), and a retry button when `run.error`:

```tsx
import { isToolPending, type AgentRun, type TeamRun } from '@rodrigocoliveira/agno-hooks'
import type { ToolExecution } from '@rodrigocoliveira/agno-api'

function ToolChip({ t }: { t: ToolExecution }) {
  const cls = t.tool_call_error ? 'chip error' : isToolPending(t) ? 'chip pending' : 'chip'
  const answered = t.user_feedback_schema?.map((q) => `${q.header ?? q.question}: ${(q.selected_options ?? []).join(', ')}`).join(' · ')
  return <span className={cls} title={JSON.stringify(t.tool_args)}>{t.tool_name}{answered ? ` → ${answered}` : t.result != null ? ' ✓' : isToolPending(t) ? ' …' : ''}</span>
}

export function RunView({ run, onRetry }: { run: AgentRun | TeamRun; onRetry?: (id: string) => void }) {
  return (
    <>
      {run.input.message && <div className="bubble user">{run.input.message}</div>}
      {run.tools.length > 0 && <div>{run.tools.map((t) => <ToolChip key={t.tool_call_id} t={t} />)}</div>}
      {run.kind === 'team' && run.members.length > 0 && (
        <div className="members">{run.members.map((m) => <RunView key={m.id} run={m} />)}</div>
      )}
      {run.content && <div className="bubble assistant">{run.content}</div>}
      {run.status === 'running' && !run.content && <div className="bubble assistant">…</div>}
      {run.error && <div className="error">{run.error} {onRetry && <button onClick={() => onRetry(run.id)}>retry</button>}</div>}
    </>
  )
}
```

`src/PendingPanel.tsx`: the HITL panel above the composer, one card per pending tool by flag:

```tsx
import { confirm, provideUserFeedback, provideUserInput, reject, isToolPending } from '@rodrigocoliveira/agno-hooks'
import type { ToolExecution } from '@rodrigocoliveira/agno-api'
import { useState } from 'react'

export function PendingPanel({ tools, onContinue, onResolve }: {
  tools: ToolExecution[]
  onContinue: (decisions: ToolExecution[]) => Promise<void>
  onResolve: (id: string, result: unknown) => void
}) {
  const [draft, setDraft] = useState<Record<string, ToolExecution>>({})
  const decide = (t: ToolExecution) => setDraft((d) => ({ ...d, [t.tool_call_id]: t }))
  const missing = tools.filter((t) => isToolPending(t) && !draft[t.tool_call_id] && t.approval_type !== 'required')
  return (
    <div className="pending">
      {tools.map((t) => (
        <div className="card" key={t.tool_call_id}>
          <strong>{t.tool_name}</strong>
          {t.approval_type === 'required' && <p>Waiting for an admin to resolve approval <code>{t.approval_id}</code>.</p>}
          {t.user_feedback_schema && t.user_feedback_schema.map((q) => (
            <div key={q.question}>
              <p>{q.header && <b>{q.header} · </b>}{q.question}</p>
              {q.options?.map((o) => (
                <button key={o.label} onClick={() => decide(provideUserFeedback(t, { [q.question]: [o.label] }))} title={o.description ?? ''}>{o.label}</button>
              ))}
            </div>
          ))}
          {t.user_input_schema && !t.user_feedback_schema && (
            <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); decide(provideUserInput(t, Object.fromEntries(fd.entries()))) }}>
              {t.user_input_schema.map((f) => <label key={f.name}>{f.description ?? f.name} <input name={f.name} /></label>)}
              <button type="submit">save</button>
            </form>
          )}
          {t.requires_confirmation && !t.approval_type && (
            <p>Run <code>{JSON.stringify(t.tool_args)}</code>? <button onClick={() => decide(confirm(t))}>yes</button> <button onClick={() => decide(reject(t))}>no</button></p>
          )}
          {t.external_execution_required && !t.result && <p>Needs a result: <button onClick={() => onResolve(t.tool_call_id, prompt('result') ?? '')}>provide</button></p>}
          {draft[t.tool_call_id] && <span className="chip">decided</span>}
          {t.external_execution_required && t.result && <span className="chip">resolved</span>}
        </div>
      ))}
      <button disabled={missing.length > 0} onClick={() => void onContinue(Object.values(draft)).then(() => setDraft({}))}>continue</button>
    </div>
  )
}
```

- [ ] **Step 4: The three views**

`src/AgentView.tsx`:

```tsx
import { useAgnoAgent } from '@rodrigocoliveira/agno-hooks'
import { useEffect, useState } from 'react'
import { PendingPanel } from './PendingPanel'
import { RunView } from './RunView'

export function AgentView({ agentId, sessionId, onSession }: { agentId: string; sessionId?: string; onSession: (id: string | null) => void }) {
  const chat = useAgnoAgent({
    agentId, sessionId,
    frontendTools: { get_location: async () => ({ lat: -23.55, lng: -46.63, source: 'examples/react' }) },
  })
  const [text, setText] = useState('')
  useEffect(() => onSession(chat.sessionId), [chat.sessionId, onSession])
  if (chat.status === 'loading') return <div className="messages">loading…</div>
  if (chat.status === 'error') return <div className="messages error">{chat.error?.message}</div>
  return (
    <>
      <div className="messages">
        {chat.runs.map((r) => <RunView key={r.id} run={r} onRetry={(id) => void chat.resume(id)} />)}
      </div>
      {chat.pending && <PendingPanel tools={chat.pending.tools} onContinue={(d) => chat.continue(d)} onResolve={chat.resolveTool} />}
      <form className="composer" onSubmit={(e) => { e.preventDefault(); if (!text.trim()) return; void chat.send(text); setText('') }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder='Try: "Use the tool", "ask me", "locate me"' disabled={chat.isBusy} />
        <button type="submit" disabled={chat.isBusy}>send</button>
        {chat.isBusy && <button type="button" onClick={() => void chat.cancel()}>cancel</button>}
      </form>
    </>
  )
}
```

`src/TeamView.tsx`: identical to `AgentView` with `useAgnoTeam({ teamId, sessionId, frontendTools })` and the `teamId` prop (member runs render through `RunView`'s `members` branch).

`src/WorkflowView.tsx`:

```tsx
import { useAgnoWorkflow } from '@rodrigocoliveira/agno-hooks'
import { useEffect, useState } from 'react'

export function WorkflowView({ workflowId, sessionId, onSession }: { workflowId: string; sessionId?: string; onSession: (id: string | null) => void }) {
  const wf = useAgnoWorkflow({ workflowId, sessionId })
  const [text, setText] = useState('')
  useEffect(() => onSession(wf.sessionId), [wf.sessionId, onSession])
  if (wf.status === 'loading') return <div className="messages">loading…</div>
  const active = wf.pending?.stepRequirements.at(-1)
  return (
    <>
      <div className="messages">
        {wf.runs.map((run) => (
          <div key={run.id}>
            <div className="bubble user">{run.input.message}</div>
            <div className="steps">
              {run.steps.map((s) => <div key={s.id} className={`step ${s.status}`}><b>{s.index}. {s.name}</b> · {s.status}<div>{s.content}</div></div>)}
            </div>
            {run.content && <div className="bubble assistant">{run.content}</div>}
            {run.error && <div className="error">{run.error} <button onClick={() => void wf.resume(run.id)}>retry</button></div>}
          </div>
        ))}
      </div>
      {wf.pending && active && (
        <div className="pending">
          <div className="card">
            <strong>{active.step_name}</strong> {active.confirmation_message ?? 'needs confirmation'}
            <p>
              <button onClick={() => void wf.continue([{ ...active, confirmed: true }])}>confirm</button>
              <button onClick={() => void wf.continue([{ ...active, confirmed: false }])}>reject</button>
            </p>
          </div>
        </div>
      )}
      <form className="composer" onSubmit={(e) => { e.preventDefault(); if (!text.trim()) return; void wf.send(text); setText('') }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Workflow input" disabled={wf.isBusy} />
        <button type="submit" disabled={wf.isBusy}>run</button>
      </form>
    </>
  )
}
```

- [ ] **Step 5: Root script, CI, README, verify in the browser**

Root `package.json` scripts: add `"example": "bun run --filter react-example dev"`. Run `bun install` at the root.

`.github/workflows/ci.yml`, job `ci`, after `- run: bun run build`, add `- run: bun run --filter react-example build`.

`examples/react/README.md`: what it is, `AGNO_PORT=7778 bun run agentos` + `bun run example`, the three tabs and the scripted messages that trigger each HITL kind, the `/agno` proxy note (`AGNO_URL` env to point elsewhere).

Verify: with the server on 7778, `bun run example`, open http://localhost:5173, and in the agent tab send `hello`, `Use the tool`, `ask me`, `locate me`; reload the page mid-stream of a long message; open a team session and a workflow session with HITL. Everything in spec §11 must work. Then:

Run: `bun run --filter react-example build && bun run test && bun run typecheck` — Expected: all green.

```bash
git add examples/react package.json bun.lock .github/workflows/ci.yml
git commit -m "feat(examples): Vite React app on agno-hooks against examples/agentos"
```

---

## Self-review (done while writing; kept for the executor)

- Spec §2 (surface): Tasks 8, 10, 11. §3 (Run model): Task 2. §4 (lifecycle): Task 8 (hydrate/reattach/send) + Task 10 (session swap). §5 (stream, reducers, reconnection, fromRow): Tasks 4–7. §6 (HITL, frontendTools): Tasks 3, 8, 9. §7 (React): Task 10. §8 (errors): Tasks 8, 9 tests. §9 (tests): every task + Task 12 E2E. §10 (structure, agno-api changes): Tasks 1, 2, 11. §11 (done criteria): Task 13 browser check.
- Names used across tasks: `createAgnoStore`, `AgnoStore`, `StoreOptions` (Task 8) ← Tasks 10, 11, 12; `runStream`, `routesFor` (Task 7) ← Task 8; `applyEvent`, `createRun`, `fromRow`, `rowsToRuns` (Task 6) ← Task 8; `pendingTools`, `setExternalResult`, `confirm`, `provideUserFeedback` (Task 3) ← Tasks 8, 9, 12, 13; `createRegistry`, `useAgnoContext` (Task 10) ← Task 10 hooks/tests.
- Not in this plan (spec says out of 1.0): sessions hook (#4), approvals hook (#5), send queue (#6), fork/regenerate sugar (#7).
