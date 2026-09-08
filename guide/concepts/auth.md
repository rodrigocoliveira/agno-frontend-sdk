# Auth

AgentOS authenticates every request with a JWT and can scope what each token is allowed to do
down to specific resources and actions. This page covers how the SDK carries that token, what the
server reads out of it, and what a real deployment's scopes and user isolation look like — all
drawn from `examples/demo-agentos`'s own auth setup.

## Provider and token

`AgnoProvider` takes `token` as either a plain string or a function returning one (sync or async),
and reads it on every request — so a function that reads from `localStorage` or a cookie always
sends the current value, never a stale one captured at mount. `onTokenExpired` is called on a 401
and can return a fresh token for the AgnoProvider to retry the failed request with once.

## One provider, one connection

A single `AgnoProvider` is one HTTP/SSE connection: every `useAgnoAgent`/`useAgnoTeam`/
`useAgnoWorkflow` hook under it shares the same `baseUrl`, `token` and retry behavior. Switching
users means remounting the provider — `examples/demo-react` does this by keying it on the
endpoint and the active token, so every hook underneath gets a brand-new store instead of one that
might still hold another user's runs:

```tsx
// examples/demo-react/src/main.tsx
function Root() {
  const { endpoint, activeLabel, activeToken } = useConnection()
  // Keyed by endpoint + token: switching users remounts every hook, so no store keeps another user's runs.
  return (
    <AgnoProvider key={`${endpoint}|${activeLabel ?? ''}`} baseUrl={endpoint} token={activeToken ?? undefined}>
      <AppRoutes />
    </AgnoProvider>
  )
}
```

## What the server reads from the JWT

AgentOS's JWT middleware reads the user id from the `sub` claim (`user_id_claim: str = "sub"` by
default) and the caller's permissions from a `scopes` claim. Every request is then checked against
those scopes before it is allowed to reach a route.

## Scopes

`examples/demo-agentos/auth.py` defines the scopes a regular demo user needs — enough to use every
page of `demo-react` except resolving approvals, which stays admin-only:

```python
# examples/demo-agentos/auth.py
USER_SCOPES = [
    "config:read",
    "agents:read", "agents:run",
    "teams:read", "teams:run",
    "workflows:read", "workflows:run",
    "sessions:read", "sessions:write",
    "approvals:read",
]
```

`agent_os:admin` bypasses scope checks entirely — it's what the demo's `admin` profile uses to see
every session and resolve approvals. The scopes above map onto AgentOS's own route table
(`agno/os/scopes.py`'s `get_default_scope_mappings()`); the parts this SDK exercises look like:

```
# derived from agno/os/scopes.py's get_default_scope_mappings()
POST /agents/*/runs                    -> agents:run
POST /agents/*/runs/*/continue         -> agents:run
POST /agents/*/runs/*/cancel           -> agents:run
GET  /sessions/*                       -> sessions:read
POST /sessions                          -> sessions:write
GET  /approvals                        -> approvals:read
POST /approvals/*/resolve              -> approvals:write   # admin only in the demo
```

`teams:*` and `workflows:*` mirror the `agents:*` rows. Since `USER_SCOPES` has `approvals:read`
but not `approvals:write`, a demo user can see that a run is waiting on approval but only an admin
token can resolve it.

## User isolation

`examples/demo-agentos/auth.py` turns on `AuthorizationConfig(user_isolation=True)`: a non-admin
caller's session list is filtered to sessions created under their own `sub`, and `sessions:read`
alone can't see anyone else's. The store already sends what user isolation needs — `continue`,
`resume` and `cancel` all include `session_id` on the wire, so the server can check it belongs to
the caller before acting on it.

**See it in the demo:** `/settings`, `/sessions`
