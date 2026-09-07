import type { RunRequirement, StepRequirement, ToolExecution } from '@rodrigocoliveira/agno-api'

/** Same rule the server uses (`RunRequirement.needs_*` in agno 3.0.6). */
export function isToolPending(t: ToolExecution): boolean {
  if (t.requires_confirmation === true && t.confirmed == null) return true
  if (t.requires_user_input === true && t.answered !== true) return true
  if (t.external_execution_required === true && t.result == null) return true
  return false
}

/** tools ∪ requirements[].tool_execution (requirements win: a team member's pause only lives there), filtered by isToolPending. */
export function pendingTools(run: { tools: ToolExecution[]; requirements: RunRequirement[] | null }): ToolExecution[] {
  const byId = new Map<string, ToolExecution>()
  for (const r of run.requirements ?? []) if (r.tool_execution) byId.set(r.tool_execution.tool_call_id, r.tool_execution)
  for (const t of run.tools) if (!byId.has(t.tool_call_id)) byId.set(t.tool_call_id, t)
  return [...byId.values()].filter(isToolPending)
}

export const confirm = (t: ToolExecution, note?: string): ToolExecution =>
  ({ ...t, confirmed: true, confirmation_note: note ?? t.confirmation_note ?? null })

export const reject = (t: ToolExecution, note?: string): ToolExecution =>
  ({ ...t, confirmed: false, confirmation_note: note ?? t.confirmation_note ?? null })

export function provideUserInput(t: ToolExecution, values: Record<string, unknown>): ToolExecution {
  const schema = (t.user_input_schema ?? []).map((f) => (f.name in values ? { ...f, value: values[f.name] } : f))
  return { ...t, answered: true, user_input_schema: schema }
}

/**
 * Sets `selected_options` on the question at `index` — its position in `user_feedback_schema`, not its
 * `question` text. The LLM authors `question` freely (agno's `AskUserQuestion` puts no uniqueness
 * constraint on it, and a weak model can even leave it blank for every question), so two questions in the
 * same `ask_user` call can share the same text; keying by text would then answer both at once.
 */
export function provideUserFeedback(t: ToolExecution, index: number, selected: string[]): ToolExecution {
  const schema = (t.user_feedback_schema ?? []).map((q, i) => (i === index ? { ...q, selected_options: selected } : q))
  return { ...t, answered: true, user_feedback_schema: schema }
}

export function setExternalResult(t: ToolExecution, result: unknown): ToolExecution {
  return { ...t, result: typeof result === 'string' ? result : JSON.stringify(result ?? null) }
}

/** The pending ToolExecutions nested in a workflow requirement whose step executor (agent/team) paused. */
export function executorTools(sr: StepRequirement): ToolExecution[] {
  return (sr.executor_requirements ?? []).map((r) => r.tool_execution).filter((t): t is ToolExecution => !!t && isToolPending(t))
}

/** A copy of `sr` whose `executor_requirements[].tool_execution` are replaced by the decided ones (by tool_call_id). */
export function resolveExecutorTools(sr: StepRequirement, decided: ToolExecution[]): StepRequirement {
  const byId = new Map(decided.map((d) => [d.tool_call_id, d]))
  return {
    ...sr,
    executor_requirements: (sr.executor_requirements ?? []).map((r) => {
      const d = r.tool_execution ? byId.get(r.tool_execution.tool_call_id) : undefined
      return d ? { ...r, tool_execution: d } : r
    }),
  }
}
