import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { createAgnoStore, type AgnoStore } from '../store/store'
import type { FrontendTool, Kind, Snapshot } from '../types'
import { useAgnoContext, type Registry } from './provider'

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
  const ref = useRef<{ key: string; registry: Registry; store: AgnoStore<K> } | null>(null)
  if (!ref.current || ref.current.key !== wanted || ref.current.registry !== registry) {
    const prev = ref.current
    const learned = prev && prev.registry === registry && prev.key === `${kind}:${targetId}:@new` && sessionId !== null && prev.store.getSnapshot().sessionId === sessionId
    if (learned) {
      registry.rekey(prev.key, wanted)
      ref.current = { key: wanted, registry, store: prev.store }
    } else {
      const store = registry.get(wanted, () => createAgnoStore({
        api, target: { kind, id: targetId }, sessionId, background: opts.background, frontendTools: opts.frontendTools,
      })) as AgnoStore<K>
      ref.current = { key: wanted, registry, store }
    }
  }
  const store = ref.current.store
  useEffect(() => { registry.retain(wanted); return () => registry.release(wanted) }, [registry, wanted])
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
