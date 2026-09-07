import { isAgnoApiError, type AgnoApi, type RunRequirement, type StepRequirement, type ToolExecution } from '@rodrigocoliveira/agno-api'
import { applyEvent, createRun, fromRow, pendingTools, reconcileSteps, rowsToRuns, setExternalResult } from '../run'
import { upsertTool } from '../run/base'
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

  /**
   * A stream opened without `last_event_index` replays the run from its very first event, so whatever the
   * run row already held would be appended to (a checkpointing agent shows its content twice). Re-seed the
   * run with only what a replay cannot rebuild — its identity and the input the caller gave — and let the
   * events rebuild content, reasoning, tools, requirements, media, citations, metrics, members and steps.
   */
  const reseedForReplay = (run: RunOf<K>): RunOf<K> => createRun(kind, targetId, {
    id: run.id, sessionId: run.sessionId, input: run.input, createdAt: run.createdAt, local: run.local, raw: run.raw,
  } as Partial<RunOf<K>>)

  /** The events that prove the server took a continue; the first one applies `onAccepted`. */
  const ACCEPTED = new Set(['RunContinued', 'TeamRunContinued', 'StepContinued'])

  interface StreamSpec {
    first: (signal: AbortSignal) => AsyncIterable<AnyEvent>
    /** `false` = never reconnect. A function is re-read on every reconnect (a 409-downgraded continue). */
    resumable: boolean | (() => boolean)
    onFail: (run: RunOf<K>, err: unknown) => RunOf<K>
    /** Applied once, to the run produced by the first event of `ACCEPTED`. */
    onAccepted?: (run: RunOf<K>) => RunOf<K>
    /** `first` opens with no `last_event_index`, so it replays the run from event 0. */
    replaysFromStart?: boolean
  }

  /**
   * AgentOS can close a background SSE stream before the pause reaches the client: a background workflow
   * that pauses streams `StepPaused` and then ends, and its `WorkflowPaused` (the frame carrying
   * `pause_kind` and `step_requirements`) is published after the response is already closed. When a stream
   * ends cleanly while the run still looks like it is running, take the state from the run row.
   */
  async function settleFromRow(id: string, ac: AbortController): Promise<void> {
    const owns = () => streams.get(id) === ac && !destroyed && !ac.signal.aborted
    const run = find(id)
    if (!owns() || !run || run.status !== 'running' || isLocalId(run.id)) return
    let row: RunRowLike
    try { row = await routes.get(run.id, sessionId) } catch { return }
    const current = find(id)
    // A continue (or another send) may have taken this run over while the row was in flight; that stream
    // owns the state now.
    if (!owns() || !current) return
    const fresh = fromRow(kind, row)
    if (current.status !== 'running' || fresh.status === 'running') return
    // The row is authoritative, but it does not carry what only the stream saw: a team's member runs, and
    // the steps a paused workflow had already started (`step_results` holds only the finished ones).
    const cur = asRun(current)
    const merged = (cur.kind === 'team' ? { ...fresh, members: cur.members }
      : cur.kind === 'workflow' ? { ...fresh, steps: reconcileSteps(cur.steps, row.step_results) }
      : fresh) as RunOf<K>
    // The row cannot know the local run identity: `local` (what `cancel()` looks for) and the `File[]`
    // the caller attached only ever existed on this client.
    replace(id, { ...merged, local: current.local, input: current.input, eventIndex: current.eventIndex })
    if (isTerminal(merged.status)) resolutions.delete(id)
    commit()
    if (merged.status === 'paused') void autoRunTools(id).catch(() => {})
  }

  async function startStream(runId: string, spec: StreamSpec): Promise<void> {
    let id = runId
    const ac = new AbortController()
    streams.set(id, ac)
    const current = () => find(id)
    const canResume = typeof spec.resumable === 'function' ? spec.resumable : () => spec.resumable === true
    let onAccepted = spec.onAccepted
    // Consumed by the first event of every connection that starts the replay over from event 0.
    let reseedPending = spec.replaysFromStart === true
    try {
      await runStream({
        first: () => spec.first(ac.signal),
        resume: (idx) => {
          if (isLocalId(id) || !canResume()) return null
          if (idx == null) reseedPending = true
          return routes.resume(id, { session_id: sessionId ?? undefined, last_event_index: idx ?? undefined }, { signal: ac.signal })
        },
        onEvent: (ev) => {
          const found = current()
          if (!found) return
          const wasPaused = found.status === 'paused'
          const run = reseedPending ? reseedForReplay(found) : found
          reseedPending = false
          let next = applyEvent(run, ev)
          if (onAccepted && ACCEPTED.has(ev.event)) { next = onAccepted(next); onAccepted = undefined }
          if (typeof ev.event_index === 'number') next = { ...next, eventIndex: ev.event_index }
          replace(id, next)
          if (next.id !== id) { streams.delete(id); streams.set(next.id, ac); id = next.id }
          if (!sessionId && next.sessionId) sessionId = next.sessionId
          if (isTerminal(next.status)) resolutions.delete(next.id)
          commit()
          if (!wasPaused && next.status === 'paused') void autoRunTools(next.id).catch(() => {})
        },
        getIndex: () => current()?.eventIndex ?? null,
        isDone: () => isTerminal(current()?.status),
        signal: ac.signal,
        delays: options.retryDelays,
      })
      await settleFromRow(id, ac)
      // A create stream that closed before its RunStarted never gave the run a real id: nothing can
      // settle, resume or cancel it, so it must not stay `running` (that would block `send` forever).
      const after = current()
      if (after && isLocalId(after.id) && after.status === 'running' && streams.get(id) === ac && !destroyed) {
        replace(id, { ...after, status: 'error', error: 'Stream ended before the run started' }); commit()
      }
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
    let rows: RunRowLike[]
    try {
      rows = (await options.api.sessions.runs(sessionId)) as unknown as RunRowLike[]
    } catch (e) {
      if (destroyed) return
      // A caller-chosen session id only exists once its first run is created: until then AgentOS
      // answers GET /sessions/{id}/runs with 404 "Session with ID … not found". That is an empty session,
      // not a failure — but a plain 404 (a wrong baseUrl, say) must still surface as an error.
      if (isAgnoApiError(e) && e.status === 404 && /session/i.test(String(e.detail ?? e.message))) {
        runs = []; status = 'ready'; error = null; commit(); return
      }
      status = 'error'; error = e instanceof Error ? e : new Error(String(e)); commit()
      return
    }
    try {
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
          replaysFromStart: true,
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
    if (status === 'loading') throw new Error('Session is still loading')
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
    if (streams.has(runId)) return
    const run = find(runId)
    if (!run || run.status === 'completed' || run.status === 'cancelled' || isLocalId(run.id)) return
    // `local` is what `cancel()` and `isBusy` look for: a run this client is actively driving, whether it
    // was created here or picked up from history.
    replace(runId, { ...run, status: 'running', error: null, local: true }); commit()
    await startStream(runId, {
      first: (signal) => routes.resume(runId, { session_id: sessionId ?? undefined, last_event_index: run.eventIndex ?? undefined }, { signal }),
      resumable: true,
      replaysFromStart: run.eventIndex == null,
      onFail: failRun,
    })
  }

  async function cancel(runId?: string): Promise<void> {
    const run = runId ? find(runId) : [...runs].reverse().find((r) => r.local && !isTerminal(r.status))
    if (!run || isTerminal(run.status)) return
    if (isLocalId(run.id)) {
      // No RunStarted yet: the server has nothing to cancel by id, but the request is still ours to
      // drop. Abort the stream and settle the run locally.
      streams.get(run.id)?.abort()
      replace(run.id, { ...run, status: 'cancelled', error: null }); commit()
      return
    }
    try {
      await routes.cancel(run.id, sessionId)
    } catch (err) {
      const r = find(run.id)
      if (r) { replace(run.id, { ...r, error: messageOf(err) }); commit() }
      return
    }
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

  /**
   * Files the submitted executions back into the run: into `members[member_run_id].tools` for the team
   * decisions that came from a member's requirement, into the run's own `tools` for everything else
   * (including a member id the run never saw, so no decision is dropped).
   */
  function mergeSubmitted(r: RunOf<K>, submitted: ToolExecution[], memberOf: Map<string, string>): RunOf<K> {
    const team = asRun(r).kind === 'team' ? (r as unknown as TeamRun) : null
    let members = team?.members ?? []
    let tools = r.tools
    for (const t of submitted) {
      const mid = memberOf.get(t.tool_call_id)
      const i = mid == null || !team ? -1 : members.findIndex((m) => m.id === mid)
      if (i === -1) { tools = upsertTool(tools, t); continue }
      members = members.slice()
      members[i] = { ...members[i]!, tools: upsertTool(members[i]!.tools, t) }
    }
    return (team ? { ...r, tools, members } : { ...r, tools }) as RunOf<K>
  }

  async function continueRun(decisions: Decision<K>[], extra?: ContinueExtra<K>): Promise<void> {
    if (destroyed) throw new Error('Store destroyed')
    const p = snapshot.pending
    if (!p) throw new Error('No paused run to continue')
    const run = asRun(find(p.runId)!)
    let wire: Record<string, unknown>
    let submitted: ToolExecution[] = []
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
      submitted = final
      wire = kind === 'agent' ? { tools: final } : { requirements: final.map((t) => wrapRequirement(run, t)) }
    }
    // A team pause is a member's pause: the requirement says which member run the execution belongs to, and
    // that is where the answered execution has to land — the team's own `tools` never held it.
    const memberOf = new Map<string, string>()
    if (run.kind === 'team') {
      for (const t of submitted) {
        const orig = run.requirements?.find((q) => q.tool_execution?.tool_call_id === t.tool_call_id)
        const mid = (orig as { member_run_id?: unknown } | undefined)?.member_run_id
        if (typeof mid === 'string' && mid !== '') memberOf.set(t.tool_call_id, mid)
      }
    }
    // The decisions stay out of the run until the server accepts them: a rejected continue must leave the
    // pause exactly as it was (a merged `confirmed: true` empties `pendingTools` and strands the run).
    const before = find(run.id)!
    // A continue is this client driving the run, hydrated or not: `local` is what `isBusy` and `cancel()`
    // look for while the continue stream is open.
    replace(run.id, { ...before, status: 'running', error: null, local: true }); commit()
    const body = { ...wire, ...(extra ?? {}), session_id: sessionId ?? undefined, stream: true }
    let downgraded = false
    await startStream(run.id, {
      first: async function* (signal) {
        try {
          yield* routes.continue(run.id, { ...body, background }, { signal })
        } catch (err) {
          // AgentOS refuses `background=true` on a paused run with no durable queue ticket (409,
          // "Retry without background") — a workflow paused on a plain SqliteDb is always one of these.
          if (!background || !isAgnoApiError(err) || err.status !== 409) throw err
          // The retried run is foreground: there is nothing to reconnect to, so the stream must not resume.
          downgraded = true
          yield* routes.continue(run.id, { ...body, background: false }, { signal })
        }
      },
      resumable: () => background && !downgraded,
      // AgentOS answers a background continue with a `RunCompleted` that carries no `tools`, so the run
      // would keep the unanswered executions from `RunPaused`. Once the server has taken the continue, the
      // decisions we sent are the truth until it sends its own list back.
      onAccepted: submitted.length === 0 ? undefined : (r) => mergeSubmitted(r, submitted, memberOf),
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
