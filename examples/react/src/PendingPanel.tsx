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
  const missing = tools.filter((t) => isToolPending(t) && !draft[t.tool_call_id] && t.approval_type !== 'required')
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
                <button key={o.label} onClick={() => decide(provideUserFeedback(t, { [q.question]: [o.label] }))} title={o.description ?? ''}>{o.label}</button>
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
          {draft[t.tool_call_id] && <span className="chip">decided</span>}
          {t.external_execution_required && t.result && <span className="chip">resolved</span>}
        </div>
      ))}
      <button disabled={missing.length > 0} onClick={() => void onContinue(Object.values(draft)).then(() => setDraft({}))}>continue</button>
    </div>
  )
}
