import { AgnoApiError } from '@rodrigocoliveira/agno-api'
import type { AgnoHook, Kind, SendInput } from '@rodrigocoliveira/agno-hooks'
import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router'
import { PendingPanel } from '../pending/PendingPanel'
import { SessionList } from '../sessions/SessionList'
import { Button } from '../ui/Button'
import { Empty } from '../ui/Empty'
import { Composer } from './Composer'
import { RunList } from './RunList'

interface Props<K extends Kind> { kind: K; targetId: string; hook: AgnoHook<K>; hint: string }

function LoadError({ error }: { error: Error | null }) {
  const denied = error instanceof AgnoApiError && (error.status === 401 || error.status === 403)
  return (
    <Empty title={denied ? 'The active token cannot open this session' : 'Could not load the session'}>
      <p>{error?.message}</p>
      <div className="mt-3 flex justify-center gap-2">
        {denied && <Link to="/settings"><Button variant="secondary">Settings</Button></Link>}
        <Button onClick={() => window.location.reload()}>Reload</Button>
      </div>
    </Empty>
  )
}

/** One session of any kind: session list | pending panel, runs, composer. Keeps `?session=` in sync with the hook. */
export function RunShell<K extends Kind>({ kind, targetId, hook, hint }: Props<K>) {
  const [params, setParams] = useSearchParams()
  const sessionParam = params.get('session')
  useEffect(() => {
    if (hook.sessionId && hook.sessionId !== sessionParam) setParams({ session: hook.sessionId }, { replace: true })
  }, [hook.sessionId, sessionParam, setParams])

  const send = (message: string, files: File[], background: boolean) =>
    hook.send({ message, background, ...(files.length > 0 ? { files } : {}) } as SendInput<K>)

  return (
    <div className="grid h-full grid-cols-[200px_1fr]">
      <SessionList kind={kind} targetId={targetId} activeId={sessionParam} />
      <section className="flex min-h-0 min-w-0 flex-col">
        {hook.status === 'loading' && <Empty title="Loading session…" />}
        {hook.status === 'error' && <LoadError error={hook.error} />}
        {hook.status === 'ready' && (
          <>
            <PendingPanel hook={hook} />
            <RunList runs={hook.runs} hint={hint} onRetry={(id) => void hook.resume(id)} />
            <Composer busy={hook.isBusy} allowFiles={kind !== 'workflow'} placeholder={kind === 'workflow' ? 'Workflow input' : 'Message'} onSend={send} onCancel={() => void hook.cancel()} />
          </>
        )}
      </section>
    </div>
  )
}
