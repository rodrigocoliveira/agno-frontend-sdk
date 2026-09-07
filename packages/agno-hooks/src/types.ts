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

/** Agent/team: a decided ToolExecution. Workflow: a decided StepRequirement (step pause) or a decided
 *  ToolExecution from the active requirement's `executor_requirements` (executor pause). */
export type Decision<K extends Kind> = K extends 'workflow' ? StepRequirement | ToolExecution : ToolExecution

export type Pending<K extends Kind> = K extends 'workflow'
  /** `tools`: the pending ToolExecutions of the ACTIVE (last) requirement when the step's agent/team
   *  paused (`pause_kind: 'executor'`); empty for a step pause. */
  ? { runId: string; stepRequirements: StepRequirement[]; tools: ToolExecution[] }
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
