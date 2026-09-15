import { AgnoApiError } from '@rodrigocoliveira/agno-api'
import { useAgnoAgent, type SendInput } from '@rodrigocoliveira/agno-hooks'
import { useEffect } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { PendingPanel } from '../pending/PendingPanel'
import { Composer } from '../run/Composer'
import { RunList } from '../run/RunList'
import { SessionList } from '../sessions/SessionList'
import { ShoppingListPanel } from '../shopping/ShoppingListPanel'
import { Button } from '../ui/Button'
import { Empty } from '../ui/Empty'

/** Same session list | chat layout as RunShell, plus a third column for the shopping-list panel —
 *  both the chat's `add_item`/`remove_item` tool calls and the panel's +/- buttons write the same
 *  session, so the manual-edit lock and deep merge from agno-hooks are visible side by side. */
export function ShoppingListPage() {
  const { id = 'shopping' } = useParams()
  const [params, setParams] = useSearchParams()
  const agent = useAgnoAgent({ agentId: id, sessionId: params.get('session') })

  const sessionParam = params.get('session')
  useEffect(() => {
    if (agent.sessionId && agent.sessionId !== sessionParam) setParams({ session: agent.sessionId }, { replace: true })
  }, [agent.sessionId, sessionParam, setParams])

  const send = (message: string, files: File[]) =>
    agent.send(files.length > 0 ? ({ message, files } as SendInput<'agent'>) : message)

  const denied = agent.error instanceof AgnoApiError && (agent.error.status === 401 || agent.error.status === 403)

  return (
    <div className="grid h-full grid-cols-[200px_1fr_260px]">
      <SessionList kind="agent" targetId={id} activeId={sessionParam} />
      <section className="flex min-h-0 min-w-0 flex-col border-r border-neutral-200">
        {agent.status === 'loading' && <Empty title="Loading session…" />}
        {agent.status === 'error' && (
          <Empty title={denied ? 'The active token cannot open this session' : 'Could not load the session'}>
            <p>{agent.error?.message}</p>
            <div className="mt-3 flex justify-center gap-2">
              {denied && <Link to="/settings"><Button variant="secondary">Settings</Button></Link>}
              <Button onClick={() => window.location.reload()}>Reload</Button>
            </div>
          </Empty>
        )}
        {agent.status === 'ready' && (
          <>
            <PendingPanel hook={agent} />
            <RunList runs={agent.runs} hint="Add 2 apples and a loaf of bread." onRetry={(runId) => void agent.resume(runId)} />
            <Composer busy={agent.isBusy} allowFiles placeholder="Message" onSend={send} onCancel={() => void agent.cancel()} />
          </>
        )}
      </section>
      <ShoppingListPanel sessionState={agent.sessionState} isBusy={agent.isBusy} mergeSessionState={agent.mergeSessionState} />
    </div>
  )
}
