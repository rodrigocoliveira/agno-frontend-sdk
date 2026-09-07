import type { RunRequirement, StepRequirement, ToolExecution } from './hitl'

export interface RunInputBase {
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

export interface TeamRunInput extends AgentRunInput {
  monitor?: boolean
}

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

/** Team: decisions travel inside `requirements[].tool_execution` (matched by `id`). Sent as a JSON string. */
export interface TeamContinueInput extends ContinueInputBase {
  requirements?: RunRequirement[]
}

/** Workflow: decisions travel inside step_requirements[] (StepRequirement, matched by step_id; only the last one is active). Sent as a JSON string. No fork/regenerate fields on this route. */
export interface WorkflowContinueInput {
  step_requirements?: StepRequirement[]
  session_id?: string | null
  user_id?: string | null
  stream?: boolean
  background?: boolean
  /** Sent as a JSON string when an object is given. */
  factory_input?: string | Record<string, unknown> | null
}

export interface ResumeInput {
  last_event_index?: number | null
  session_id?: string | null
}

export interface KnowledgeUploadInput {
  db_id?: string | null; knowledge_id?: string | null
  name?: string | null; description?: string | null; url?: string | null
  metadata?: string | Record<string, unknown> | null
  file?: File | Blob | null; text_content?: string | null; reader_id?: string | null
  chunker?: string | null; chunk_size?: number | null; chunk_overlap?: number | null
}
