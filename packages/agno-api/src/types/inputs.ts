import type { RunRequirement, ToolExecution } from './hitl'

interface RunInputBase {
  message: string
  stream?: boolean
  background?: boolean
  session_id?: string | null
  user_id?: string | null
  version?: number | null
  /** Sent as a JSON string when an object is given. */
  factory_input?: string | Record<string, unknown> | null
}

export interface AgentRunInput extends RunInputBase {
  files?: (File | Blob)[]
  /** Sent as a JSON string when an object is given. */
  files_metadata?: string | Record<string, unknown> | null
}
export type TeamRunInput = AgentRunInput
export type WorkflowRunInput = RunInputBase

interface ContinueInputBase {
  input?: string | null
  continue_from?: 'end' | (string & {})
  fork?: boolean
  regenerate?: boolean
  replace_original?: boolean | null
  additional_instructions?: string | null
  session_id?: string | null
  user_id?: string | null
  stream?: boolean
  background?: boolean
}

/** Agent: decisions travel inside `tools` (matched by `tool_call_id`). Sent as a JSON string. */
export interface AgentContinueInput extends ContinueInputBase {
  tools?: ToolExecution[]
}

/** Team and workflow: decisions travel inside `requirements[].tool_execution` (matched by `id`). Sent as a JSON string. */
export interface TeamContinueInput extends ContinueInputBase {
  requirements?: RunRequirement[]
}
export type WorkflowContinueInput = TeamContinueInput

export interface ResumeInput {
  last_event_index?: number | null
  session_id?: string | null
}
