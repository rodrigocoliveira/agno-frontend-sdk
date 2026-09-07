import { useAgnoAgent } from '@rodrigocoliveira/agno-hooks'
import { useEffect, useState } from 'react'
import { PendingPanel } from './PendingPanel'
import { RunView } from './RunView'

export function AgentView({ agentId, sessionId, onSession }: { agentId: string; sessionId?: string; onSession: (id: string | null) => void }) {
  const chat = useAgnoAgent({
    agentId, sessionId,
    frontendTools: { get_location: async () => ({ lat: -23.55, lng: -46.63, source: 'examples/react' }) },
  })
  const [text, setText] = useState('')
  useEffect(() => onSession(chat.sessionId), [chat.sessionId, onSession])
  if (chat.status === 'loading') return <div className="messages">loading…</div>
  if (chat.status === 'error') return <div className="messages error">{chat.error?.message}</div>
  return (
    <>
      <div className="messages">
        {chat.runs.map((r) => <RunView key={r.id} run={r} onRetry={(id) => void chat.resume(id)} />)}
      </div>
      {chat.pending && <PendingPanel tools={chat.pending.tools} onContinue={(d) => chat.continue(d)} onResolve={chat.resolveTool} />}
      <form className="composer" onSubmit={(e) => { e.preventDefault(); if (!text.trim()) return; void chat.send(text); setText('') }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder='Try: "Use the tool", "ask me", "locate me"' disabled={chat.isBusy} />
        <button type="submit" disabled={chat.isBusy}>send</button>
        {chat.isBusy && <button type="button" onClick={() => void chat.cancel()}>cancel</button>}
      </form>
    </>
  )
}
