import { isAgnoApiError, type AgnoApi, type RunRequirement, type StepRequirement, type ToolExecution } from '@rodrigocoliveira/agno-api'
import { applyEvent, createRun, fromRow, pendingTools, rowsToRuns, setExternalResult } from '../run'
import {
  isTerminal, type AgentRun, type AnyEvent, type ContinueExtra, type Decision, type FrontendTool, type Kind, type Pending,
  type Run, type RunOf, type RunRowLike, type SendInput, type Snapshot, type Target, type TeamRun, type WorkflowRun,
} from '../types'
import { routesFor } from './routes'
import { runStream } from './stream'

export interface StoreOptions<K extends Kind> {
  api: AgnoApi
  target: Target & { kind: K }
  sessionId?: string | null
  /** Default true: runs survive disconnects and can be resumed. */
  background?: boolean
  frontendTools?: Record<string, FrontendTool>
  /** Test hooks. */
  retryDelays?: number[]
  cancelTimeoutMs?: number
}

export interface AgnoStore<K extends Kind> {
  readonly kind: K
  getSnapshot(): Snapshot<K>
  subscribe(listener: () => void): () => void
  send(input: string | SendInput<K>): Promise<void>
  continue(decisions: Decision<K>[], extra?: ContinueExtra<K>): Promise<void>
  resolveTool(toolCallId: string, result: unknown): void
  runTools(runId?: string): Promise<void>
  resume(runId: string): Promise<void>
  cancel(runId?: string): Promise<void>
  setFrontendTools(tools: Record<string, FrontendTool> | undefined): void
  destroy(): void
}

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e))
const isLocalId = (id: string) => id.startsWith('local-')

export function createAgnoStore<K extends Kind>(options: StoreOptions<K>): AgnoStore<K> {
  const kind = options.target.kind
  const targetId = options.target.id
  const routes = routesFor(options.api, options.target)
  const background = options.background ?? true
  const cancelTimeoutMs = options.cancelTimeoutMs ?? 5000
  let frontendTools: Record<string, FrontendTool> = options.frontendTools ?? {}

  let runs: RunOf<K>[] = []
  let status: Snapshot<K>['status'] = options.sessionId ? 'loading' : 'ready'
  let sessionId: string | null = options.sessionId ?? null
  let error: Error | null = null
  let destroyed = false
  let localSeq = 0
  const listeners = new Set<() => void>()
  const streams = new Map<string, AbortController>()     // keyed by the run's CURRENT id
  const toolAborts = new Map<string, AbortController>()
  const resolutions = new Map<string, Map<string, ToolExecution>>()

  const find = (id: string) => runs.find((r) => r.id === id)
  const replace = (id: string, next: RunOf<K>) => { runs = runs.map((r) => (r.id === id ? next : r)) }
  const asRun = (r: RunOf<K>) => r as unknown as Run

  function computePending(): Pending<K> | null {
    for (let i = runs.length - 1; i >= 0; i--) {
      const r = asRun(runs[i]!)
      if (r.status !== 'paused') continue
      if (r.kind === 'workflow') return { runId: r.id, stepRequirements: r.stepRequirements ?? [] } as Pending<K>
      const res = resolutions.get(r.id)
      return { runId: r.id, tools: pendingTools(r).map((t) => res?.get(t.tool_call_id) ?? t) } as Pending<K>
    }
    return null
  }
  const build = (): Snapshot<K> => ({
    status, sessionId, runs, pending: computePending(),
    isBusy: runs.some((r) => (r.local && r.status === 'running') || r.status === 'paused'),
    error,
  })
  let snapshot: Snapshot<K> = build()
  function commit() {
    if (destroyed) return
    snapshot = build()
    for (const l of listeners) l()
  }

  const failRun = (run: RunOf<K>, err: unknown): RunOf<K> => ({ ...run, status: 'error', error: messageOf(err) })

  interface StreamSpec {
    first: (signal: AbortSignal) => AsyncIterable<AnyEvent>
    resumable: boolean
    onFail: (run: RunOf<K>, err: unknown) => RunOf<K>
  }

  async function startStream(runId: string, spec: StreamSpec): Promise<void> {
    let id = runId
    const ac = new AbortController()
    streams.set(id, ac)
    const current = () => find(id)
    try {
      await runStream({
        first: () => spec.first(ac.signal),
        resume: spec.resumable
          ? (idx) => (isLocalId(id) ? null : routes.resume(id, { session_id: sessionId ?? undefined, last_event_index: idx ?? undefined }, { signal: ac.signal }))
          : null,
        onEvent: (ev) => {
          const run = current()
          if (!run) return
          const wasPaused = run.status === 'paused'
          let next = applyEvent(run, ev)
          if (typeof ev.event_index === 'number') next = { ...next, eventIndex: ev.event_index }
          replace(id, next)
          if (next.id !== id) { streams.delete(id); streams.set(next.id, ac); id = next.id }
          if (!sessionId && next.sessionId) sessionId = next.sessionId
          if (isTerminal(next.status)) resolutions.delete(next.id)
          commit()
          if (!wasPaused && next.status === 'paused') void autoRunTools(next.id)
        },
        getIndex: () => current()?.eventIndex ?? null,
        isDone: () => isTerminal(current()?.status),
        signal: ac.signal,
        delays: options.retryDelays,
      })
    } catch (err) {
      const run = current()
      if (run && !destroyed) { replace(id, spec.onFail(run, err)); commit() }
    } finally {
      if (streams.get(id) === ac) streams.delete(id)
    }
  }

  async function hydrate(): Promise<void> {
    if (!sessionId) { status = 'ready'; commit(); return }
    status = 'loading'; commit()
    try {
      const rows = (await options.api.sessions.runs(sessionId)) as unknown as RunRowLike[]
      const loaded = await Promise.all(rowsToRuns(kind, rows).map(async (r) => {
        if (r.status !== 'paused') return r
        const fresh = fromRow(kind, await routes.get(r.id, sessionId))
        return (asRun(r).kind === 'team' ? { ...fresh, members: (r as TeamRun).members } : fresh) as RunOf<K>
      }))
      if (destroyed) return
      runs = loaded; status = 'ready'; error = null; commit()
      for (const r of runs) {
        if (r.status !== 'running') continue
        void startStream(r.id, {
          first: (signal) => routes.resume(r.id, { session_id: sessionId ?? undefined }, { signal }),
          resumable: true,
          onFail: failRun,
        })
      }
    } catch (e) {
      if (destroyed) return
      status = 'error'; error = e instanceof Error ? e : new Error(String(e)); commit()
    }
  }

  async function send(input: string | SendInput<K>): Promise<void> {
    if (destroyed) throw new Error('Store destroyed')
    if (snapshot.isBusy) throw new Error('A run is already active')
    const body = (typeof input === 'string' ? { message: input } : input) as Record<string, unknown>
    const id = `local-${++localSeq}`
    const run = createRun(kind, targetId, {
      id, status: 'running', local: true, sessionId, createdAt: Date.now() / 1000,
      input: { message: typeof body.message === 'string' ? body.message : '', files: Array.isArray(body.files) ? (body.files as File[]) : [], media: null },
    } as Partial<RunOf<K>>)
    runs = [...runs, run]; commit()
    await startStream(id, {
      first: (signal) => routes.create({ ...body, session_id: sessionId ?? undefined, background, stream: true }, { signal }),
      resumable: background,
      onFail: failRun,
    })
  }

  async function resume(runId: string): Promise<void> {
    const run = find(runId)
    if (!run || run.status === 'completed' || run.status === 'cancelled' || isLocalId(run.id)) return
    replace(runId, { ...run, status: 'running', error: null }); commit()
    await startStream(runId, {
      first: (signal) => routes.resume(runId, { session_id: sessionId ?? undefined, last_event_index: run.eventIndex ?? undefined }, { signal }),
      resumable: true,
      onFail: failRun,
    })
  }

  async function cancel(runId?: string): Promise<void> {
    const run = runId ? find(runId) : [...runs].reverse().find((r) => r.local && !isTerminal(r.status))
    if (!run || isTerminal(run.status) || isLocalId(run.id)) return
    await routes.cancel(run.id, sessionId)
    const timer = setTimeout(() => {
      const r = find(run.id)
      if (!r || isTerminal(r.status) || destroyed) return
      streams.get(r.id)?.abort()
      replace(r.id, { ...r, status: 'cancelled' }); commit()
    }, cancelTimeoutMs)
    ;(timer as { unref?: () => void }).unref?.()
  }

  // ---- HITL ----

  function setResolution(runId: string, tool: ToolExecution) {
    const m = resolutions.get(runId) ?? new Map<string, ToolExecution>()
    m.set(tool.tool_call_id, tool)
    resolutions.set(runId, m)
  }

  function resolveTool(toolCallId: string, result: unknown): void {
    const p = snapshot.pending as { runId: string; tools?: ToolExecution[] } | null
    const t = p?.tools?.find((x) => x.tool_call_id === toolCallId)
    if (!p || !t) return
    setResolution(p.runId, setExternalResult(t, result)); commit()
  }

  const wrapRequirement = (run: AgentRun | TeamRun, t: ToolExecution): RunRequirement => {
    const orig = run.requirements?.find((q) => q.tool_execution?.tool_call_id === t.tool_call_id)
    return orig ? { ...orig, tool_execution: t } : { id: t.tool_call_id, tool_execution: t }
  }

  async function continueRun(decisions: Decision<K>[], extra?: ContinueExtra<K>): Promise<void> {
    if (destroyed) throw new Error('Store destroyed')
    const p = snapshot.pending
    if (!p) throw new Error('No paused run to continue')
    const run = asRun(find(p.runId)!)
    let wire: Record<string, unknown>
    if (run.kind === 'workflow') {
      const byStep = new Map((decisions as StepRequirement[]).map((d) => [d.step_id, d]))
      const list = ((run as WorkflowRun).stepRequirements ?? []).map((sr) => byStep.get(sr.step_id) ?? sr)
      const active = list.at(-1)
      if (active && !byStep.has(active.step_id)) throw new Error(`Step ${active.step_id} still pending`)
      wire = { step_requirements: list }
    } else {
      const res = new Map(resolutions.get(run.id) ?? [])
      for (const d of decisions as ToolExecution[]) res.set(d.tool_call_id, d)
      const final: ToolExecution[] = []
      for (const t of pendingTools(run)) {
        const d = res.get(t.tool_call_id)
        if (d) final.push(d)
        else if (t.approval_type === 'required') continue
        else throw new Error(`Tool ${t.tool_call_id} still pending`)
      }
      resolutions.set(run.id, res)
      wire = kind === 'agent' ? { tools: final } : { requirements: final.map((t) => wrapRequirement(run, t)) }
    }
    replace(run.id, { ...find(run.id)!, status: 'running', error: null }); commit()
    await startStream(run.id, {
      first: (signal) => routes.continue(run.id, { ...wire, ...(extra ?? {}), session_id: sessionId ?? undefined, background, stream: true }, { signal }),
      resumable: background,
      onFail: (r, err) => (isAgnoApiError(err) ? { ...r, status: 'paused', error: messageOf(err) } : failRun(r, err)),
    })
  }

  async function autoRunTools(runId: string): Promise<void> {
    const run = asRun(find(runId) as RunOf<K>)
    if (!run || run.status !== 'paused' || run.kind === 'workflow') return
    const already = resolutions.get(runId)
    const targets = pendingTools(run).filter((t) => t.external_execution_required && frontendTools[t.tool_name] && !already?.has(t.tool_call_id))
    if (targets.length === 0) return
    const ac = new AbortController()
    toolAborts.set(runId, ac)
    await Promise.all(targets.map(async (t) => {
      let resolved: ToolExecution
      try { resolved = setExternalResult(t, await frontendTools[t.tool_name]!(t.tool_args ?? {}, { run, tool: t, signal: ac.signal })) }
      catch (e) { resolved = { ...t, tool_call_error: true, result: messageOf(e) } }
      setResolution(runId, resolved)
    }))
    toolAborts.delete(runId)
    if (destroyed || ac.signal.aborted) return
    commit()
    const after = asRun(find(runId) as RunOf<K>)
    if (!after || after.status !== 'paused' || after.kind === 'workflow') return
    const m = resolutions.get(runId)
    const remaining = pendingTools(after).filter((t) => !m?.has(t.tool_call_id) && t.approval_type !== 'required')
    if (remaining.length === 0 && snapshot.pending?.runId === runId) await continueRun([])
  }

  function runTools(runId?: string): Promise<void> {
    const id = runId ?? snapshot.pending?.runId
    return id ? autoRunTools(id) : Promise.resolve()
  }

  function destroy() {
    destroyed = true
    for (const ac of streams.values()) ac.abort()
    for (const ac of toolAborts.values()) ac.abort()
    streams.clear(); toolAborts.clear(); listeners.clear()
  }

  void hydrate()

  return {
    kind,
    getSnapshot: () => snapshot,
    subscribe: (l) => { listeners.add(l); return () => { listeners.delete(l) } },
    send, continue: continueRun, resolveTool, runTools, resume, cancel,
    setFrontendTools: (t) => { frontendTools = t ?? {} },
    destroy,
  }
}
