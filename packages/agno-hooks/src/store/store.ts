import { isAgnoApiError, type AgnoApi, type RunRequirement, type StepRequirement, type ToolExecution } from '@rodrigocoliveira/agno-api'
import { applyEvent, createRun, executorTools, fromRow, pendingTools, reconcileSteps, resolveExecutorTools, rowsToRuns, setExternalResult } from '../run'
import { upsertTool } from '../run/base'
import {
  isTerminal, type AgentRun, type AnyEvent, type ContinueExtra, type Decision, type FrontendTool, type Kind, type Pending,
  type Run, type RunOf, type RunRowLike, type SendInput, type Snapshot, type Target, type TeamRun, type WorkflowRun,
} from '../types'
import { deepMerge, isPlainObject } from '../utils/deep-merge'
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
  mergeSessionState(patch: Record<string, unknown> | ((current: Record<string, unknown>) => Record<string, unknown>)): Promise<void>
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
  let sessionState: Record<string, unknown> | null = null
  // True once some value more authoritative than the initial `hydrate()` seed exists: a terminal run
  // event, a successful manual merge, or a seed `mergeSessionState` fetched on demand. Any of those is
  // newer than the parallel `hydrate()` fetch, so a still-pending `hydrate()` response must not
  // overwrite it when it finally lands.
  let sessionStateSeeded = false
  let destroyed = false
  let localSeq = 0
  let stateWriteQueue: Promise<unknown> = Promise.resolve()
  let stateWritesInFlight = 0
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
      const res = resolutions.get(r.id)
      if (r.kind === 'workflow') {
        const reqs = r.stepRequirements ?? []
        const active = reqs.at(-1)
        const tools = active ? executorTools(active).map((t) => res?.get(t.tool_call_id) ?? t) : []
        return { runId: r.id, stepRequirements: reqs, tools } as Pending<K>
      }
      return { runId: r.id, tools: pendingTools(r).map((t) => res?.get(t.tool_call_id) ?? t) } as Pending<K>
    }
    return null
  }
  const build = (): Snapshot<K> => ({
    status, sessionId, runs, pending: computePending(),
    isBusy: runs.some((r) => (r.local && r.status === 'running') || r.status === 'paused'),
    error, sessionState,
  })
  let snapshot: Snapshot<K> = build()
  function commit() {
    if (destroyed) return
    snapshot = build()
    for (const l of listeners) l()
  }

  const failRun = (run: RunOf<K>, err: unknown): RunOf<K> => ({ ...run, status: 'error', error: messageOf(err) })

  /**
   * The tail of the manual `session_state` write queue, or `null` when nothing is in flight or queued.
   * A run must not start while a write is outstanding: that PATCH carries the complete PRE-run state, so
   * letting it land after the run mutated `session_state` server-side would silently erase what the run
   * wrote (`mergeSessionState`'s lock only covers the mirror image — an edit starting during a run).
   * Returning `null` instead of an already-resolved promise keeps the common path free of even a
   * microtask, so `send()` still creates its optimistic run — and flips `isBusy` — synchronously.
   * The queue is built never to reject (every job is chained through `.catch`), so awaiting it is safe.
   */
  const pendingStateWrites = (): Promise<unknown> | null => (stateWritesInFlight > 0 ? stateWriteQueue : null)

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
    try {
      row = await routes.get(run.id, sessionId)
    } catch (err) {
      // Without the row the run would stay `running` (and block `send`) with nothing left to feed it.
      // Surface it as an error the app can retry with resume(), which replays from the last index.
      const cur = find(id)
      if (owns() && cur && cur.status === 'running') { replace(id, { ...cur, status: 'error', error: messageOf(err) }); commit() }
      return
    }
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
          const evState = (ev as { session_state?: unknown }).session_state
          if (isPlainObject(evState)) { sessionState = evState; sessionStateSeeded = true }
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
    const sid = sessionId
    void options.api.sessions.get(sid).then((session) => {
      // A fresher, event-driven sync (a terminal run event already updated `sessionState`) always wins
      // over this fetch: it only seeds state before any interaction, so a late response here is stale.
      if (destroyed || sessionId !== sid || sessionStateSeeded) return
      const state = (session as { session_state?: unknown }).session_state
      sessionState = isPlainObject(state) ? state : null
      commit()
    }).catch(() => { /* estado é auxiliar; falha aqui não derruba o hydrate */ })
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
        // The session list drops `requirements`; the run detail has them. If that one request fails,
        // keep the row (the pause is still visible through its tools) rather than losing the session.
        let detail: RunRowLike
        try { detail = await routes.get(r.id, sessionId) } catch { return r }
        const fresh = fromRow(kind, detail)
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
    // Wait for any in-flight manual state write to land before starting a run, so its stale pre-run
    // PATCH can't overwrite what this run is about to do to `session_state`.
    const writes = pendingStateWrites()
    if (writes) {
      await writes
      if (destroyed) throw new Error('Store destroyed')
      if (snapshot.isBusy) throw new Error('A run is already active')
    }
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
    let run = find(runId)
    if (!run || run.status === 'completed' || run.status === 'cancelled' || isLocalId(run.id)) return
    // Wait for any in-flight manual state write to land before starting a run, so its stale pre-run
    // PATCH can't overwrite what this run is about to do to `session_state`.
    const writes = pendingStateWrites()
    if (writes) {
      await writes
      if (destroyed || streams.has(runId)) return
      run = find(runId)
      if (!run || run.status === 'completed' || run.status === 'cancelled') return
    }
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

  async function mergeSessionState(
    patch: Record<string, unknown> | ((current: Record<string, unknown>) => Record<string, unknown>),
  ): Promise<void> {
    if (destroyed) throw new Error('Store destroyed')
    // Stricter than `snapshot.isBusy`: a run this client merely reattached to (never taken over via
    // resume()/continue(), so `local` is false and `isBusy` — deliberately — ignores it for `send()`)
    // can still have `session_state` mutated server-side at any moment. Any run running/paused for this
    // session must block a manual edit, regardless of who is driving it.
    if (runs.some((r) => r.status === 'running' || r.status === 'paused')) throw new Error('A run is already active')
    if (!sessionId) throw new Error('mergeSessionState requires an active session — send a message first')
    const sid = sessionId

    /** Applies the patch to `current`, commits it, and PATCHes it to the server (with failure-resync). */
    async function commitAndPatch(current: Record<string, unknown>): Promise<void> {
      const resolved = typeof patch === 'function' ? patch(current) : patch
      const next = deepMerge(current, resolved)
      sessionState = next
      // Same guard hydrate()'s sessions.get callback checks: this optimistic write is authoritative, so a
      // slower, stale hydrate() fetch resolving afterward must not clobber it either.
      sessionStateSeeded = true
      commit()
      try {
        await options.api.sessions.update(sid, { session_state: next })
      } catch (err) {
        // Best-effort resync from the server. Anything queued behind this failed write computes its own
        // merge only when the queue reaches it (see the slow path below), so it composes onto this fresh
        // value — the resync rebases the rest of the queue for free.
        try {
          const session = await options.api.sessions.get(sid)
          const state = (session as { session_state?: unknown }).session_state
          sessionState = isPlainObject(state) ? state : null
        } catch { /* melhor esforço: mantém o que já tinha localmente */ }
        commit()
        throw err
      }
    }

    // `stateWritesInFlight` is counted (not just queued) so `pendingStateWrites()` can tell "nothing
    // outstanding" from "a write is in flight", and keep the no-write path of send()/continue()/resume()
    // synchronous. Both the count and the queue tail must be updated synchronously, before ANY await —
    // the seed fetch below included: a merge parked on its own seed is every bit as outstanding as one
    // parked on its PATCH, and if it were invisible to pendingStateWrites() a run could open alongside
    // it, letting the run's server-side `session_state` changes and this whole-field write clobber each
    // other.
    if (stateWritesInFlight === 0 && sessionState !== null) {
      // FAST PATH: nothing else is queued or in flight, and there's nothing to seed — safe to compute
      // and apply the merge synchronously, right here, so the caller's very next line already sees it
      // (this is what keeps a rapid, isolated +/- click feeling instant). Only safe when idle: if
      // anything were ahead of us in the queue, freezing our payload now — before that ahead-of-us work
      // has applied its own result — would send payloads out of queue order and silently drop a patch.
      const current = sessionState
      stateWritesInFlight++
      const run = commitAndPatch(current).finally(() => { stateWritesInFlight-- })
      // The tail never rejects (so awaiting it elsewhere is safe) and only settles once this job's own
      // count has been released, so a waiter never sees a phantom in-flight write.
      stateWriteQueue = run.catch(() => {})
      return run
    }

    // SLOW PATH: either something is already queued/in-flight (must wait our turn before we can even
    // COMPUTE our merge, so we compose onto the right base and our payload lands in the right order), or
    // `sessionState` hasn't been seeded yet (must fetch it first). The ENTIRE remaining sequence — seed if
    // needed, merge, apply, PATCH — is the callback passed to `previousQueue.then(...)`, not a separate
    // `await previousQueue` statement: a `.then()`-produced promise structurally cannot settle before its
    // source resolves AND its callback completes, so there is no way for this job's published tail to
    // settle early (a throw before the await would) or for its payload to be computed out of queue order.
    const previousQueue = stateWriteQueue
    stateWritesInFlight++
    const runSeedMergeAndPatch = async () => {
      try {
        let current = sessionState
        if (current === null) {
          // The PATCH replaces the whole `session_state` field, never a delta — merging onto `{}` here
          // would erase every server-side key the agent had written. `sessionState` is still null
          // whenever hydrate()'s seed fetch has not landed (or failed — hydrate treats that as harmless),
          // or the session was learned from a send() whose terminal event carried no state. Seed it from
          // the server first; if that fetch fails too, let it reject rather than write a partial state.
          const session = await options.api.sessions.get(sid)
          const state = (session as { session_state?: unknown }).session_state
          // A terminal event, or whatever the job ahead of us in the queue just applied, may have landed
          // a fresher value while this fetch was in flight; prefer the live one over what THIS fetch saw.
          current = sessionState ?? (isPlainObject(state) ? state : {})
        }
        await commitAndPatch(current)
      } finally {
        stateWritesInFlight--
      }
    }
    // `previousQueue` is designed to never reject (every value ever assigned to `stateWriteQueue` is
    // either `Promise.resolve()` or `someRun.catch(() => {})`), so passing the same callback as both the
    // resolve AND reject handler is belt-and-suspenders: if that invariant were ever violated by a future
    // change elsewhere in this file, the decrement above would still run instead of permanently stranding
    // `stateWritesInFlight` above 0 and wedging every future send()/resume()/continueRun().
    const run = previousQueue.then(runSeedMergeAndPatch, runSeedMergeAndPatch)
    stateWriteQueue = run.catch(() => {})
    return run
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
    // Wait for any in-flight manual state write to land before resuming a run, so its stale pre-run
    // PATCH can't overwrite what this run is about to do to `session_state`. Reachable even though the
    // merge lock blocks edits during a pause: the write can have started before hydrate() reported the
    // already-paused run. `pending` is read after the await, so it is re-checked for free.
    const writes = pendingStateWrites()
    if (writes) {
      await writes
      if (destroyed) throw new Error('Store destroyed')
    }
    const p = snapshot.pending
    if (!p) throw new Error('No paused run to continue')
    const run = asRun(find(p.runId)!)
    let wire: Record<string, unknown>
    let submitted: ToolExecution[] = []
    if (run.kind === 'workflow') {
      const stepDecisions = (decisions as Decision<'workflow'>[]).filter((d): d is StepRequirement => 'step_id' in d)
      const toolDecisions = (decisions as Decision<'workflow'>[]).filter((d): d is ToolExecution => 'tool_call_id' in d)
      const reqs = (run as WorkflowRun).stepRequirements ?? []
      // A paused workflow without requirements (the WorkflowPaused frame never reached us and the row
      // carried none) has nothing a decision can attach to: say so instead of posting an empty list.
      if (reqs.length === 0 && decisions.length > 0) throw new Error('No step requirement to continue')
      // Only the LAST requirement is active (the server accumulates them across pauses, and the same
      // step_id can appear twice: a pre-execution gate and a post-execution review). Earlier entries are
      // history and go back untouched; a decision is matched to the active one by step_id.
      const list = reqs.slice()
      const active = list.at(-1)
      const decided = active ? stepDecisions.find((d) => d.step_id === active.step_id) : undefined
      if (active && decided) list[list.length - 1] = decided
      if (active?.requires_executor_input) {
        // The step's agent/team paused: the decision lives in executor_requirements[].tool_execution.
        const res = new Map(resolutions.get(run.id) ?? [])
        for (const d of toolDecisions) res.set(d.tool_call_id, d)
        const final: ToolExecution[] = []
        for (const t of executorTools(active)) {
          const d = res.get(t.tool_call_id)
          if (d) final.push(d)
          else if (t.approval_type === 'required') continue
          else throw new Error(`Tool ${t.tool_call_id} still pending`)
        }
        list[list.length - 1] = resolveExecutorTools(list[list.length - 1]!, final)
      } else if (active && !decided) throw new Error(`Step ${active.step_id} still pending`)
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
    send, continue: continueRun, resolveTool, runTools, resume, cancel, mergeSessionState,
    setFrontendTools: (t) => { frontendTools = t ?? {} },
    destroy,
  }
}
