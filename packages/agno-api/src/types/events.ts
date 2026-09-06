import type { RunRequirement, ToolExecution } from './hitl'
import type { RunStatus } from './run'

export interface RunEventBase {
  event: string
  run_id: string
  session_id?: string | null
  created_at?: number
  /** Only present on background runs and on the /resume stream; foreground SSE events do not carry it. */
  event_index?: number
  agent_id?: string | null
  agent_name?: string | null
  team_id?: string | null
  team_name?: string | null
  workflow_id?: string | null
  workflow_name?: string | null
  parent_run_id?: string | null
}

// ---- Agents (35) ----
export type AgentRunEventName =
  | 'RunStarted' | 'RunContent' | 'RunContentCompleted' | 'RunIntermediateContent' | 'RunCompleted' | 'RunError'
  | 'RunCancelled' | 'RunPaused' | 'RunContinued' | 'PreHookStarted' | 'PreHookCompleted' | 'PostHookStarted'
  | 'PostHookCompleted' | 'ToolCallStarted' | 'ToolCallCompleted' | 'ToolCallError' | 'ReasoningStarted'
  | 'ReasoningStep' | 'ReasoningContentDelta' | 'ReasoningCompleted' | 'MemoryUpdateStarted' | 'MemoryUpdateCompleted'
  | 'SessionSummaryStarted' | 'SessionSummaryCompleted' | 'ParserModelResponseStarted' | 'ParserModelResponseCompleted'
  | 'OutputModelResponseStarted' | 'OutputModelResponseCompleted' | 'ModelRequestStarted' | 'ModelRequestCompleted'
  | 'CompressionStarted' | 'CompressionCompleted' | 'FollowupsStarted' | 'FollowupsCompleted' | 'CustomEvent'

interface ContentFields { content?: unknown; content_type?: string | null }
interface CompletedFields extends ContentFields {
  reasoning_content?: string | null
  tools?: ToolExecution[] | null
  metrics?: Record<string, unknown> | null
  images?: unknown[] | null; videos?: unknown[] | null; audio?: unknown[] | null; files?: unknown[] | null
  citations?: unknown; references?: unknown[] | null; followups?: string[] | null
  metadata?: Record<string, unknown> | null; session_state?: Record<string, unknown> | null
  status?: RunStatus
}
interface ErrorFields { error?: string | null; content?: string | null }
interface PausedFields { tools?: ToolExecution[] | null; requirements?: RunRequirement[] | null }
interface ToolFields { tool: ToolExecution; content?: unknown }
interface ReasoningFields { reasoning_content?: string | null; content?: unknown; content_type?: string | null }

interface AgentEventFields {
  RunStarted: { model?: string | null; model_provider?: string | null }
  RunContent: { content: string; content_type?: string | null; reasoning_content?: string | null }
  RunContentCompleted: ContentFields
  RunIntermediateContent: ContentFields
  RunCompleted: CompletedFields
  RunError: ErrorFields
  RunCancelled: { reason?: string | null }
  RunPaused: PausedFields
  RunContinued: PausedFields
  ToolCallStarted: ToolFields
  ToolCallCompleted: ToolFields
  ToolCallError: ToolFields & ErrorFields
  ReasoningStep: ReasoningFields
  ReasoningContentDelta: { reasoning_content: string }
  ReasoningCompleted: ReasoningFields
  FollowupsCompleted: { followups?: string[] | null }
  CustomEvent: Record<string, unknown>
}

export type AgentRunEvent = {
  [K in AgentRunEventName]: RunEventBase & { event: K } & (K extends keyof AgentEventFields ? AgentEventFields[K] : {})
}[AgentRunEventName]

// ---- Teams (40) ----
export type TeamRunEventName =
  | 'TeamRunStarted' | 'TeamRunContent' | 'TeamRunIntermediateContent' | 'TeamRunContentCompleted' | 'TeamRunCompleted'
  | 'TeamRunError' | 'TeamRunCancelled' | 'TeamPreHookStarted' | 'TeamPreHookCompleted' | 'TeamPostHookStarted'
  | 'TeamPostHookCompleted' | 'TeamToolCallStarted' | 'TeamToolCallCompleted' | 'TeamToolCallError'
  | 'TeamReasoningStarted' | 'TeamReasoningStep' | 'TeamReasoningContentDelta' | 'TeamReasoningCompleted'
  | 'TeamMemoryUpdateStarted' | 'TeamMemoryUpdateCompleted' | 'TeamSessionSummaryStarted' | 'TeamSessionSummaryCompleted'
  | 'TeamParserModelResponseStarted' | 'TeamParserModelResponseCompleted' | 'TeamOutputModelResponseStarted'
  | 'TeamOutputModelResponseCompleted' | 'TeamModelRequestStarted' | 'TeamModelRequestCompleted'
  | 'TeamCompressionStarted' | 'TeamCompressionCompleted' | 'TeamFollowupsStarted' | 'TeamFollowupsCompleted'
  | 'TeamRunPaused' | 'TeamRunContinued' | 'TeamTaskIterationStarted' | 'TeamTaskIterationCompleted'
  | 'TeamTaskStateUpdated' | 'TeamTaskCreated' | 'TeamTaskUpdated' | 'CustomEvent'

interface TeamEventFields {
  TeamRunStarted: { model?: string | null; model_provider?: string | null }
  TeamRunContent: { content: string; content_type?: string | null; reasoning_content?: string | null }
  TeamRunIntermediateContent: ContentFields
  TeamRunContentCompleted: ContentFields
  TeamRunCompleted: CompletedFields & { member_responses?: unknown[] | null }
  TeamRunError: ErrorFields
  TeamRunCancelled: { reason?: string | null }
  TeamRunPaused: PausedFields
  TeamRunContinued: PausedFields
  TeamToolCallStarted: ToolFields
  TeamToolCallCompleted: ToolFields
  TeamToolCallError: ToolFields & ErrorFields
  TeamReasoningStep: ReasoningFields
  TeamReasoningContentDelta: { reasoning_content: string }
  TeamReasoningCompleted: ReasoningFields
  TeamFollowupsCompleted: { followups?: string[] | null }
  TeamTaskCreated: { task?: Record<string, unknown> | null }
  TeamTaskUpdated: { task?: Record<string, unknown> | null }
  TeamTaskStateUpdated: { tasks?: Record<string, unknown>[] | null }
  CustomEvent: Record<string, unknown>
}

export type TeamRunEvent = {
  [K in TeamRunEventName]: RunEventBase & { event: K } & (K extends keyof TeamEventFields ? TeamEventFields[K] : {})
}[TeamRunEventName]

// ---- Workflows (31) ----
export type WorkflowRunEventName =
  | 'WorkflowStarted' | 'WorkflowCompleted' | 'WorkflowPaused' | 'WorkflowCancelled' | 'WorkflowError'
  | 'WorkflowAgentStarted' | 'WorkflowAgentCompleted' | 'StepStarted' | 'StepCompleted' | 'StepPaused' | 'StepContinued'
  | 'StepExecutorPaused' | 'StepExecutorContinued' | 'StepOutputReview' | 'StepError' | 'LoopExecutionStarted'
  | 'LoopIterationStarted' | 'LoopIterationCompleted' | 'LoopExecutionCompleted' | 'ParallelExecutionStarted'
  | 'ParallelExecutionCompleted' | 'ConditionExecutionStarted' | 'ConditionExecutionCompleted' | 'ConditionPaused'
  | 'RouterExecutionStarted' | 'RouterExecutionCompleted' | 'RouterPaused' | 'StepsExecutionStarted'
  | 'StepsExecutionCompleted' | 'StepOutput' | 'CustomEvent'

interface StepFields { step_name?: string | null; step_index?: number | string | null; step_id?: string | null; content?: unknown }

interface WorkflowEventFields {
  WorkflowCompleted: CompletedFields & { step_results?: unknown[] | null }
  WorkflowError: ErrorFields
  WorkflowPaused: PausedFields & { step_results?: unknown[] | null }
  WorkflowCancelled: { reason?: string | null }
  StepStarted: StepFields
  StepCompleted: StepFields & { step_response?: unknown }
  StepPaused: StepFields & PausedFields
  StepContinued: StepFields
  StepExecutorPaused: StepFields & PausedFields
  StepExecutorContinued: StepFields
  StepOutputReview: StepFields
  StepError: StepFields & ErrorFields
  StepOutput: StepFields
  ConditionPaused: StepFields & PausedFields
  RouterPaused: StepFields & PausedFields
  CustomEvent: Record<string, unknown>
}

export type WorkflowRunEvent = {
  [K in WorkflowRunEventName]: RunEventBase & { event: K } & (K extends keyof WorkflowEventFields ? WorkflowEventFields[K] : {})
}[WorkflowRunEventName]

// ---- /resume meta events (no run_id on `error`) ----
export type ResumeMetaEvent =
  | { event: 'catch_up'; run_id: string; status: 'running'; missed_events: number; current_event_count: number }
  | { event: 'replay'; run_id: string; status: string; total_events: number; total_buffered?: number; message?: string }
  | { event: 'subscribed'; run_id: string; status: 'running'; current_event_count: number; message?: string }
  | { event: 'error'; error: string }

export type AgentStreamEvent = AgentRunEvent | ResumeMetaEvent
export type TeamStreamEvent = TeamRunEvent | ResumeMetaEvent
export type WorkflowStreamEvent = WorkflowRunEvent | ResumeMetaEvent
