import { useState } from 'react'
import { cn } from '../lib/cn'
import { messageOf, short } from '../lib/format'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Input } from '../ui/Input'
import { Switch } from '../ui/Switch'
import { Textarea } from '../ui/Textarea'
import { parseTokens, useConnection } from './ConnectionContext'

const ROLES = [
  { label: 'admin', title: 'Admin', blurb: 'Sees every session, resolves approvals.' },
  { label: 'user-1', title: 'User 1', blurb: 'Everyday use — sees only its own sessions.' },
  { label: 'user-2', title: 'User 2', blurb: 'A second account, to see the isolation between users.' },
] as const

/**
 * The token management card. Defaults to "Quick demo login": fetches examples/demo-agentos's three
 * profile tokens from its unauthenticated GET /dev/tokens and lets you pick one, no terminal step.
 * Switching it off reveals the manual entry a real (non-demo) AgentOS needs.
 */
export function TokensCard() {
  const c = useConnection()
  const [guided, setGuided] = useState(true)
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [token, setToken] = useState('')
  const [json, setJson] = useState('')
  const [importError, setImportError] = useState<string | null>(null)

  const allPresent = ROLES.every((r) => c.tokens.some((t) => t.label === r.label))

  const fetchDemoTokens = async () => {
    setFetching(true)
    setFetchError(null)
    try {
      const res = await fetch(`${c.endpoint}/dev/tokens`)
      if (!res.ok) throw new Error(`server answered ${res.status}`)
      c.upsertTokens(parseTokens(await res.text()))
    } catch (e) {
      setFetchError(`Could not reach ${c.endpoint}/dev/tokens (${messageOf(e)}). Is this examples/demo-agentos? Turn off Quick demo login to paste a token by hand.`)
    } finally {
      setFetching(false)
    }
  }

  const importJson = () => {
    try { c.upsertTokens(parseTokens(json)); setJson(''); setImportError(null) } catch (e) { setImportError(`Not the tokens.py JSON: ${messageOf(e)}`) }
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Tokens</h2>
        <label className="flex items-center gap-2 text-xs text-neutral-500">
          Quick demo login
          <Switch checked={guided} onChange={setGuided} />
        </label>
      </div>

      {guided ? (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-neutral-500">For examples/demo-agentos — fetches its three demo tokens and lets you pick one.</p>
          {!allPresent && (
            <Button variant="secondary" onClick={() => void fetchDemoTokens()} disabled={fetching}>
              {fetching ? 'Fetching…' : 'Fetch demo tokens'}
            </Button>
          )}
          {fetchError && <p className="text-xs text-red-600">{fetchError}</p>}
          {allPresent && (
            <div className="grid gap-2 sm:grid-cols-3">
              {ROLES.map((r) => (
                <button
                  key={r.label}
                  type="button"
                  onClick={() => c.setActive(r.label)}
                  className={cn(
                    'rounded-lg border p-3 text-left text-sm transition',
                    c.activeLabel === r.label ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200 hover:bg-neutral-50',
                  )}
                >
                  <div className="font-medium">{r.title}</div>
                  <div className="mt-0.5 text-xs text-neutral-500">{r.blurb}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <ul className="divide-y divide-neutral-100 text-sm">
            <li className="flex items-center gap-3 py-2">
              <input type="radio" name="active" checked={c.activeLabel === null} onChange={() => c.setActive(null)} /> <span>no token</span>
            </li>
            {c.tokens.map((t) => (
              <li key={t.label} className="flex items-center gap-3 py-2">
                <input type="radio" name="active" checked={c.activeLabel === t.label} onChange={() => c.setActive(t.label)} />
                <span className="font-medium">{t.label}</span>
                <span className="font-mono text-xs text-neutral-400">{short(t.token, 24)}</span>
                <Button variant="ghost" className="ml-auto" onClick={() => c.removeToken(t.label)}>remove</Button>
              </li>
            ))}
          </ul>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (label && token) { c.upsertTokens([{ label, token }]); setLabel(''); setToken('') } }}>
            <Input className="w-32" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="label" />
            <Input value={token} onChange={(e) => setToken(e.target.value)} placeholder="paste a JWT" />
            <Button type="submit" variant="secondary">Add</Button>
          </form>
          <div>
            <Textarea rows={4} value={json} onChange={(e) => setJson(e.target.value)} placeholder='Paste the output of `bun run demo:tokens` ({"admin": "...", "user-1": "...", "user-2": "..."})' />
            <div className="mt-2 flex items-center gap-3">
              <Button variant="secondary" onClick={importJson} disabled={!json.trim()}>Import JSON</Button>
              {importError && <span className="text-xs text-red-600">{importError}</span>}
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}
