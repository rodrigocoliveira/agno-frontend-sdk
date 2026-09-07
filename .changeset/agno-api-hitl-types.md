---
"@rodrigocoliveira/agno-api": patch
---

Fix `UserFeedbackQuestion` (real fields: `header`, `options[{label, description, selected}]`, `multi_select`, `selected_options`), add `StepRequirement`, give `WorkflowPaused` its real fields, add the workflow executor fields (`workflow_run_id`, `step_id`, `step_name`, `step_index`) to every event.

A 401 whose refresh leaves the bearer token unchanged is no longer retried (without a `token`, e.g. cookie auth, the retry still happens).
