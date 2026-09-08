# Sessions and history

Every conversation lives in a session, and every hook can either start a brand new one or hydrate
an existing one from the `sessionId` option. This page covers that option, keeping it in sync with
the URL the way `examples/demo-react` does, what hydration actually does on mount, and listing a
target's sessions.

## `sessionId` option

Pass no `sessionId` (or `null`) and the hook starts a brand new session: `{ status: 'ready', runs:
[] }` immediately, and the server assigns a session id on the first `send`. Once that response
comes back, `hook.sessionId` exposes the newly learned id — the hook always tells you which session
it's actually talking to, whether you gave it one or not.

Passing a `sessionId` from the start hydrates that session's history instead (see Hydration
below). Changing the prop to a genuinely different id tears down the current store and opens
another one from scratch — a fresh hydrate, a fresh `runs` array.

The one case that *doesn't* tear anything down is the natural transition from "no session yet" to
"the session the server just assigned": the hook's internal registry recognizes that the store
which just learned a `sessionId` is the same one now being asked for by that id, and rekeys it in
place instead of throwing it away:

```ts
// packages/agno-hooks/src/react/hooks.ts
const prev = ref.current
const learned = prev && prev.registry === registry && prev.key === `${kind}:${targetId}:@new` && sessionId !== null && prev.entry.store.getSnapshot().sessionId === sessionId
if (learned) {
  registry.rekey(prev.entry, wanted)
  ref.current = { key: wanted, registry, entry: prev.entry }
}
```

This is what makes it safe for the app to write the just-learned `sessionId` back into a prop (or a
URL, next) without triggering a wasted refetch of history it already has in memory.

## Keep it in the URL

`RunShell` mirrors `hook.sessionId` into the `?session=` query param as soon as the hook learns it,
so a reload (or a shared link) lands back on the same session:

```tsx
// examples/demo-react/src/run/RunShell.tsx
const [params, setParams] = useSearchParams()
const sessionParam = params.get('session')
useEffect(() => {
  if (hook.sessionId && hook.sessionId !== sessionParam) setParams({ session: hook.sessionId }, { replace: true })
}, [hook.sessionId, sessionParam, setParams])
```

The page component reads it right back out and passes it in as the `sessionId` option — `AgentPage`,
`TeamPage` and `WorkflowPage` all do `sessionId: params.get('session')`.

## Hydration

Given a `sessionId`, the hook starts `status: 'loading'` and fetches `GET /sessions/{id}/runs`,
turning each row into a `Run` through `fromRow`. A caller-chosen session id only really exists once
its first run is created, so a session that has no runs yet answers with a 404 whose detail
mentions "session" — the store treats that as an empty session rather than a failure (any other 404
still surfaces as an error, since that could just as easily be a wrong `baseUrl`):

```ts
// packages/agno-hooks/src/store/store.ts
if (isAgnoApiError(e) && e.status === 404 && /session/i.test(String(e.detail ?? e.message))) {
  runs = []; status = 'ready'; error = null; commit(); return
}
```

Two kinds of loaded runs need more than the session-list row gives you. A `paused` run's row from
the list endpoint drops `requirements`/`step_requirements`, so the store re-fetches that one run's
detail (`routes.get`, i.e. `runs.get`) to get them back — if that request fails, it keeps the
row anyway rather than losing the whole session, since the pause is still visible through the
run's `tools`. A `running` run — one another tab or the server itself is still driving — is
reattached transparently with `resume`, replaying from its first event since there's no recorded
`eventIndex` yet for a run this client never streamed itself:

```ts
// packages/agno-hooks/src/store/store.ts
for (const r of runs) {
  if (r.status !== 'running') continue
  void startStream(r.id, {
    first: (signal) => routes.resume(r.id, { session_id: sessionId ?? undefined }, { signal }),
    resumable: true,
    replaysFromStart: true,
    onFail: failRun,
  })
}
```

## Listing sessions

There's no `useAgnoSessions` hook — list sessions with `useAgnoApi()` and
`api.sessions.list({ type, component_id, sort_by, sort_order })` directly. The demo's sidebar on
every conversation page does exactly this, refetching whenever the active session changes (a new
one appears in the list after the first run):

```tsx
// examples/demo-react/src/sessions/SessionList.tsx
useEffect(() => {
  let alive = true
  api.sessions.list({ type: kind, component_id: targetId, limit: 50, sort_by: 'updated_at', sort_order: 'desc' })
    .then((res) => { if (alive) setRows(res.data ?? []) })
    .catch(() => { if (alive) setRows([]) })
  return () => { alive = false }
}, [api, kind, targetId, activeId])
```

The standalone `/sessions` page (`SessionsPage`) is the same call without `component_id`, listing
every session of a kind (agent, team or workflow) the active token can see across every target —
useful as a "recent conversations" view rather than one scoped to a single agent's sidebar. Under
user isolation, a non-admin token only ever sees its own sessions either way.

**See it in the demo:** any target's session list, `/sessions`
