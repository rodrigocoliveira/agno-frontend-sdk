import { useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { createAgnoStore, type AgnoStore } from '../store/store'
import type { FrontendTool, Kind, Snapshot } from '../types'
import { useAgnoContext, type Registry, type RegistryEntry } from './provider'

// useLayoutEffect flushes synchronously in the browser's commit phase, before a competing
// setTimeout(0) (e.g. the registry's disposal timer in provider.tsx's `schedule()`) fires for a
// commit that is not itself deferred (e.g. by startTransition) — see provider.tsx's `schedule()`
// for that case, which is why the disposal check there is chained two ticks deep, not one. A plain
// useEffect is scheduled as a later, separate task and can lose the race outright. useEffect is
// fine outside the browser (SSR has no timers racing it), so fall back to it there to avoid React's
// "useLayoutEffect does nothing on the server" warning.
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

export interface AgnoHook<K extends Kind> extends Snapshot<K> {
  send: AgnoStore<K>['send']
  continue: AgnoStore<K>['continue']
  resolveTool: AgnoStore<K>['resolveTool']
  runTools: AgnoStore<K>['runTools']
  resume: AgnoStore<K>['resume']
  cancel: AgnoStore<K>['cancel']
  store: AgnoStore<K>
}

interface CommonOptions { sessionId?: string | null; background?: boolean; frontendTools?: Record<string, FrontendTool> }
export interface AgentHookOptions extends CommonOptions { agentId: string }
export interface TeamHookOptions extends CommonOptions { teamId: string }
export interface WorkflowHookOptions extends Omit<CommonOptions, 'frontendTools'> { workflowId: string }

const SERVER_SNAPSHOT = { status: 'loading', sessionId: null, runs: [], pending: null, isBusy: false, error: null } as const

function useAgnoStore<K extends Kind>(kind: K, targetId: string, opts: CommonOptions): AgnoHook<K> {
  const { api, registry } = useAgnoContext()
  const sessionId = opts.sessionId ?? null
  const wanted = `${kind}:${targetId}:${sessionId ?? '@new'}`
  // The hook holds the entry handle, not the key: after a rekey the handle still points at the same
  // entry, so another component claiming the freed `@new` key cannot steal this one's ref count.
  const ref = useRef<{ key: string; registry: Registry; entry: RegistryEntry } | null>(null)
  if (!ref.current || ref.current.key !== wanted || ref.current.registry !== registry) {
    const prev = ref.current
    const learned = prev && prev.registry === registry && prev.key === `${kind}:${targetId}:@new` && sessionId !== null && prev.entry.store.getSnapshot().sessionId === sessionId
    if (learned) {
      registry.rekey(prev.entry, wanted)
      ref.current = { key: wanted, registry, entry: prev.entry }
    } else {
      const entry = registry.get(wanted, () => createAgnoStore({
        api, target: { kind, id: targetId }, sessionId, background: opts.background, frontendTools: opts.frontendTools,
      }))
      ref.current = { key: wanted, registry, entry }
    }
  }
  const entry = ref.current.entry
  const store = entry.store as AgnoStore<K>
  useIsomorphicLayoutEffect(() => { registry.retain(entry); return () => registry.release(entry) }, [registry, entry])
  useEffect(() => { store.setFrontendTools(opts.frontendTools) })
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, () => SERVER_SNAPSHOT as unknown as Snapshot<K>)
  return useMemo(() => ({
    ...snapshot,
    send: store.send, continue: store.continue, resolveTool: store.resolveTool, runTools: store.runTools,
    resume: store.resume, cancel: store.cancel, store,
  }), [snapshot, store])
}

export const useAgnoAgent = (o: AgentHookOptions) => useAgnoStore('agent', o.agentId, o)
export const useAgnoTeam = (o: TeamHookOptions) => useAgnoStore('team', o.teamId, o)
export const useAgnoWorkflow = (o: WorkflowHookOptions) => useAgnoStore('workflow', o.workflowId, o)
