---
'@rodrigocoliveira/agno-api': minor
---

Spec updated to AgentOS `agno==3.1.0`. New `api.filesystem` namespace (`files`, `entries`, `content`, `search`) for the `/filesystem/*` routes, and the new optional response fields: `cancellation_stage` on agent/team/workflow runs, `filesystem` on agents and `/config`, `user_isolation` on `/info`. Nothing removed or renamed.
