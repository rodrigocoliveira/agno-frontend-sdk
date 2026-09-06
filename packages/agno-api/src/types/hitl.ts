export interface UserInputField {
  name: string
  field_type?: string
  description?: string | null
  value?: unknown
}

export interface UserFeedbackQuestion {
  question: string
  answer?: string | null
  options?: string[] | null
}

/** Goes down in `tool` / `tools[]`; goes up in `tools` on agent `/continue`. */
export interface ToolExecution {
  tool_call_id: string
  tool_name: string
  tool_args?: Record<string, unknown>
  tool_call_error?: boolean | null
  result?: string | null
  metrics?: Record<string, unknown> | null
  child_run_id?: string | null
  stop_after_tool_call?: boolean
  created_at?: number
  requires_confirmation?: boolean | null
  confirmed?: boolean | null
  confirmation_note?: string | null
  requires_user_input?: boolean | null
  user_input_schema?: UserInputField[] | null
  user_feedback_schema?: UserFeedbackQuestion[] | null
  answered?: boolean | null
  external_execution_required?: boolean | null
  external_execution_silent?: boolean | null
  approval_type?: string | null
  approval_id?: string | null
}

/** Goes down in `requirements[]` of RunPaused/TeamRunPaused; goes up in `requirements` on team/workflow `/continue`. */
export interface RunRequirement {
  id: string
  tool_execution: ToolExecution
  created_at?: number
  confirmation?: boolean | null
  confirmation_note?: string | null
  user_input_schema?: UserInputField[] | null
  user_feedback_schema?: UserFeedbackQuestion[] | null
  external_execution_result?: string | null
  member_agent_id?: string | null
  member_agent_name?: string | null
  member_run_id?: string | null
}
