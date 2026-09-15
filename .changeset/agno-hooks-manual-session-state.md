---
"@rodrigocoliveira/agno-hooks": minor
---

Add manual editing of `session_state` (e.g. a shopping-list quantity +/- button) without going through the agent: `sessionState` on every `useAgnoAgent`/`useAgnoTeam`/`useAgnoWorkflow` snapshot, and a new `mergeSessionState(patch | updater)` action that deep-merges, locks while any run is active for the session, serializes concurrent writes, and resyncs from the server on failure.
