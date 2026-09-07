import { confirm, provideUserFeedback, provideUserInput, reject, isToolPending } from '@rodrigocoliveira/agno-hooks'
import type { ToolExecution } from '@rodrigocoliveira/agno-api'
import { useState } from 'react'

export function PendingPanel({ tools, onContinue, onResolve }: {
  tools: ToolExecution[]
  onContinue: (decisions: ToolExecution[]) => Promise<void>
  onResolve: (id: string, result: unknown) => void
}) {
  const [draft, setDraft] = useState<Record<string, ToolExecution>>({})
  const decide = (t: ToolExecution) => setDraft((d) => ({ ...d, [t.tool_call_id]: t }))
  // ask_user: build on the draft, not on the pristine tool, so answers to several questions accumulate;
  // multi_select toggles a label, single-select replaces the answer.
  const pick = (t: ToolExecution, question: string, label: string, multi: boolean) => {
    const base = draft[t.tool_call_id] ?? t
    const current = base.user_feedback_schema?.find((q) => q.question === question)?.selected_options ?? []
    const next = multi ? (current.includes(label) ? current.filter((l) => l !== label) : [...current, label]) : [label]
    decide(provideUserFeedback(base, { [question]: next }))
  }
  const selected = (t: ToolExecution, question: string, label: string) =>
    (draft[t.tool_call_id]?.user_feedback_schema?.find((q) => q.question === question)?.selected_options ?? []).includes(label)
  // a feedback tool is decided only when every question has an answer
  const isDecided = (t: ToolExecution) => {
    const d = draft[t.tool_call_id]
    if (!d) return false
    return d.user_feedback_schema ? d.user_feedback_schema.every((q) => (q.selected_options?.length ?? 0) > 0) : true
  }
  const missing = tools.filter((t) => isToolPending(t) && !isDecided(t) && t.approval_type !== 'required')
  return (
    <div className="pending">
      {tools.map((t) => (
        <div className="card" key={t.tool_call_id}>
          <strong>{t.tool_name}</strong>
          {t.approval_type === 'required' && <p>Waiting for an admin to resolve approval <code>{t.approval_id}</code>.</p>}
          {t.user_feedback_schema && t.user_feedback_schema.map((q) => (
            <div key={q.question}>
              <p>{q.header && <b>{q.header} · </b>}{q.question}</p>
              {q.options?.map((o) => (
                <button key={o.label} className={selected(t, q.question, o.label) ? 'active' : ''} onClick={() => pick(t, q.question, o.label, !!q.multi_select)} title={o.description ?? ''}>{o.label}</button>
              ))}
            </div>
          ))}
          {t.user_input_schema && !t.user_feedback_schema && (
            <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); decide(provideUserInput(t, Object.fromEntries(fd.entries()))) }}>
              {t.user_input_schema.map((f) => <label key={f.name}>{f.description ?? f.name} <input name={f.name} /></label>)}
              <button type="submit">save</button>
            </form>
          )}
          {t.requires_confirmation && !t.approval_type && (
            <p>Run <code>{JSON.stringify(t.tool_args)}</code>? <button onClick={() => decide(confirm(t))}>yes</button> <button onClick={() => decide(reject(t))}>no</button></p>
          )}
          {t.external_execution_required && !t.result && <p>Needs a result: <button onClick={() => onResolve(t.tool_call_id, prompt('result') ?? '')}>provide</button></p>}
          {isDecided(t) && <span className="chip">decided</span>}
          {t.external_execution_required && t.result && <span className="chip">resolved</span>}
        </div>
      ))}
      <button disabled={missing.length > 0} onClick={() => void onContinue(Object.values(draft).filter(isDecided)).then(() => setDraft({}))}>continue</button>
    </div>
  )
}
