import type { components } from '../generated/openapi'
import type { RunRequirement, StepRequirement, ToolExecution } from './hitl'

export type RunStatus = components['schemas']['RunStatus'] // 'PENDING' | 'RUNNING' | 'COMPLETED' | 'PAUSED' | 'CANCELLED' | 'ERROR' | 'REGENERATED'

export interface RunMessage {
  role: string
  content?: unknown
  tool_calls?: unknown[]
  tool_call_id?: string | null
  created_at?: number
  [key: string]: unknown
}

/** `RunOutput.to_dict()` — non-stream response, GET .../runs/{run_id}, items of GET /sessions/{id}/runs. */
export interface RunOutput {
  run_id: string
  agent_id?: string | null
  agent_name?: string | null
  session_id?: string | null
  parent_run_id?: string | null
  workflow_id?: string | null
  user_id?: string | null
  input?: unknown
  content?: unknown
  content_type?: string | null
  reasoning_content?: string | null
  reasoning_steps?: unknown[] | null
  reasoning_messages?: RunMessage[] | null
  model?: string | null
  model_provider?: string | null
  model_provider_data?: Record<string, unknown> | null
  messages?: RunMessage[] | null
  metrics?: Record<string, unknown> | null
  additional_input?: unknown[] | null
  tools?: ToolExecution[] | null
  images?: unknown[] | null
  videos?: unknown[] | null
  audio?: unknown[] | null
  files?: unknown[] | null
  response_audio?: unknown
  citations?: unknown
  references?: unknown[] | null
  followups?: string[] | null
  metadata?: Record<string, unknown> | null
  session_state?: Record<string, unknown> | null
  created_at?: number
  events?: Record<string, unknown>[] | null
  status: RunStatus
  queue_attempt?: number | null
  /** Present on GET .../runs/{run_id} (RunOutput.to_dict). NOT present on GET /sessions/{id}/runs (RunSchema drops it) — fetch the run to recover a paused team member's requirement. */
  requirements?: RunRequirement[] | null
  last_checkpoint_at_message_index?: number | null
  forked_from_run_id?: string | null
  forked_from_message_index?: number | null
  forked_from_session_id?: string | null
  regenerated_from?: string | null
  workflow_step_id?: string | null
}

export interface TeamRunOutput extends RunOutput {
  team_id?: string | null
  team_name?: string | null
  member_responses?: (RunOutput | TeamRunOutput)[] | null
}

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
