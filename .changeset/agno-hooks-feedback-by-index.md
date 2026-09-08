---
"@rodrigocoliveira/agno-hooks": minor
---

Fixed `provideUserFeedback` collapsing two `ask_user` questions into one when they share the same `question` text — the LLM authors that text freely (agno's `AskUserQuestion` puts no uniqueness constraint on it, and a weak model can even leave it blank for every question), so a lookup keyed by that text could answer both questions at once. `provideUserFeedback` now takes the question's `index` (its position in `user_feedback_schema`) instead of a `{ question -> labels }` map: `provideUserFeedback(tool, index, selected)`.
