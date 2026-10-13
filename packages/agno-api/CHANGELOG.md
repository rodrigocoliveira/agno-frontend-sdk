# @rodrigocoliveira/agno-api

## 1.0.0

### Major Changes

- 79fb5ab: First stable release. From here on the public API follows semver: a breaking change only ships in a new major version. No API changes of its own beyond the entries below.

### Minor Changes

- 21d3a05: Spec updated to AgentOS `agno==3.1.0`. New `api.filesystem` namespace (`files`, `entries`, `content`, `search`) for the `/filesystem/*` routes, and the new optional response fields: `cancellation_stage` on agent/team/workflow runs, `filesystem` on agents and `/config`, `user_isolation` on `/info`. Nothing removed or renamed.

## 0.1.0

### Minor Changes

- a257040: First release: typed client for all 125 AgentOS v3 operations, SSE streaming, 401 token refresh, single `AgnoApiError`.

### Patch Changes

- ad75be7: Fix `UserFeedbackQuestion` (real fields: `header`, `options[{label, description, selected}]`, `multi_select`, `selected_options`), add `StepRequirement`, give `WorkflowPaused` its real fields, add the workflow executor fields (`workflow_run_id`, `step_id`, `step_name`, `step_index`) to every event.
  
  A 401 whose refresh leaves the bearer token unchanged is no longer retried (without a `token`, e.g. cookie auth, the retry still happens).
