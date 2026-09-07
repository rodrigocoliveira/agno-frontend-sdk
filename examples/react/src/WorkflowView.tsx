import { useAgnoWorkflow } from '@rodrigocoliveira/agno-hooks'
import { useEffect, useState } from 'react'

export function WorkflowView({ workflowId, sessionId, onSession }: { workflowId: string; sessionId?: string; onSession: (id: string | null) => void }) {
  const wf = useAgnoWorkflow({ workflowId, sessionId })
  const [text, setText] = useState('')
  useEffect(() => onSession(wf.sessionId), [wf.sessionId, onSession])
  if (wf.status === 'loading') return <div className="messages">loading…</div>
  const active = wf.pending?.stepRequirements.at(-1)
  return (
    <>
      <div className="messages">
        {wf.runs.map((run) => (
          <div key={run.id}>
            <div className="bubble user">{run.input.message}</div>
            <div className="steps">
              {run.steps.map((s) => <div key={s.id} className={`step ${s.status}`}><b>{s.index}. {s.name}</b> · {s.status}<div>{s.content}</div></div>)}
            </div>
            {run.content && <div className="bubble assistant">{run.content}</div>}
            {run.error && <div className="error">{run.error} <button onClick={() => void wf.resume(run.id)}>retry</button></div>}
          </div>
        ))}
      </div>
      {wf.pending && active && (
        <div className="pending">
          <div className="card">
            <strong>{active.step_name}</strong> {active.confirmation_message ?? 'needs confirmation'}
            <p>
              <button onClick={() => void wf.continue([{ ...active, confirmed: true }])}>confirm</button>
              <button onClick={() => void wf.continue([{ ...active, confirmed: false }])}>reject</button>
            </p>
          </div>
        </div>
      )}
      <form className="composer" onSubmit={(e) => { e.preventDefault(); if (!text.trim()) return; void wf.send(text); setText('') }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Workflow input" disabled={wf.isBusy} />
        <button type="submit" disabled={wf.isBusy}>run</button>
      </form>
    </>
  )
}
