# @rodrigocoliveira/agno-api

## 0.1.0

### Minor Changes

- a257040: First release: typed client for all 125 AgentOS v3 operations, SSE streaming, 401 token refresh, single `AgnoApiError`.

### Patch Changes

- ad75be7: Fix `UserFeedbackQuestion` (real fields: `header`, `options[{label, description, selected}]`, `multi_select`, `selected_options`), add `StepRequirement`, give `WorkflowPaused` its real fields, add the workflow executor fields (`workflow_run_id`, `step_id`, `step_name`, `step_index`) to every event.
  
  A 401 whose refresh leaves the bearer token unchanged is no longer retried (without a `token`, e.g. cookie auth, the retry still happens).
