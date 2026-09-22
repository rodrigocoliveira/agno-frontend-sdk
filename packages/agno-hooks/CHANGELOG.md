# @rodrigocoliveira/agno-hooks

## 0.1.0

### Minor Changes

- 7b5d91b: Fixed `provideUserFeedback` collapsing two `ask_user` questions into one when they share the same `question` text — the LLM authors that text freely (agno's `AskUserQuestion` puts no uniqueness constraint on it, and a weak model can even leave it blank for every question), so a lookup keyed by that text could answer both questions at once. `provideUserFeedback` now takes the question's `index` (its position in `user_feedback_schema`) instead of a `{ question -> labels }` map: `provideUserFeedback(tool, index, selected)`.
- ad75be7: First release: `createAgnoStore` (run-based session state, background streaming with resume, HITL in Agno's vocabulary, frontend tools) and `useAgnoAgent` / `useAgnoTeam` / `useAgnoWorkflow` behind `AgnoProvider`.
- 60414eb: Add manual editing of `session_state` (e.g. a shopping-list quantity +/- button) without going through the agent: `sessionState` on every `useAgnoAgent`/`useAgnoTeam`/`useAgnoWorkflow` snapshot, and a new `mergeSessionState(patch | updater)` action that deep-merges, locks while any run is active for the session, serializes concurrent writes, and resyncs from the server on failure.

### Patch Changes

- 7b5d91b: Fixed reopening a paused session showing the raw internal input object instead of the original message text.
- d7394a9: Fixed a still-running run reattached on page load (hydrate) never counting as `isBusy` and never being reachable by a no-arg `cancel()` — after a reload, a run you were actively watching stream showed a disabled Send button instead of Stop, and there was no way to cancel it until it finished on its own. A reattached run is now marked `local` exactly like a run started or manually resumed in this session, so it blocks new sends and can be cancelled the same way.
- 7b5d91b: Fixed a second case of the same store-destroyed-before-use race, specifically when a route change (or any other React-scheduled low-priority update, such as one wrapped in `startTransition`) defers a component's commit past a single event-loop tick.
- 7b5d91b: Fixed a race where a freshly-created store could be destroyed before it was retained, breaking the first send on a new session in some browsers.
- Updated dependencies [ad75be7]
- Updated dependencies [a257040]
  - @rodrigocoliveira/agno-api@0.1.0
