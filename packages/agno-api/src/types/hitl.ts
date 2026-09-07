export interface UserInputField {
  name: string
  field_type?: string
  description?: string | null
  value?: unknown
}

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
