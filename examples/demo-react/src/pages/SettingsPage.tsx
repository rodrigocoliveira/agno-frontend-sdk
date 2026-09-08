import { useState } from 'react'
import { parseTokens, useConnection } from '../connection/ConnectionContext'
import { useHealth } from '../connection/useHealth'
import { jwtPayload, messageOf, short } from '../lib/format'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Input } from '../ui/Input'
import { Textarea } from '../ui/Textarea'

export function SettingsPage() {
  const c = useConnection()
  const { online, osId } = useHealth()
  const [endpoint, setEndpoint] = useState(c.endpoint)
  const [label, setLabel] = useState('')
  const [token, setToken] = useState('')
  const [json, setJson] = useState('')
  const [error, setError] = useState<string | null>(null)
  const payload = c.activeToken ? jwtPayload(c.activeToken) : null

  const importJson = () => {
    try { c.upsertTokens(parseTokens(json)); setJson(''); setError(null) } catch (e) { setError(`Not the tokens.py JSON: ${messageOf(e)}`) }
  }

  return (
    <div className="h-full space-y-4 overflow-y-auto p-6">
      <Card>
        <h2 className="mb-2 font-medium">Endpoint</h2>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); c.setEndpoint(endpoint) }}>
          <Input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="http://localhost:7777" />
          <Button type="submit">Save</Button>
        </form>
        <p className="mt-2 text-xs text-neutral-500">{online === null ? 'checking…' : online ? `online${osId ? ` · ${osId}` : ''}` : 'offline'}</p>
      </Card>

      <Card>
        <h2 className="mb-2 font-medium">Tokens</h2>
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
        <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (label && token) { c.upsertTokens([{ label, token }]); setLabel(''); setToken('') } }}>
          <Input className="w-32" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="label" />
          <Input value={token} onChange={(e) => setToken(e.target.value)} placeholder="paste a JWT" />
          <Button type="submit" variant="secondary">Add</Button>
        </form>
        <div className="mt-3">
          <Textarea rows={4} value={json} onChange={(e) => setJson(e.target.value)} placeholder='Paste the output of `bun run demo:tokens` ({"admin": "...", "user-1": "...", "user-2": "..."})' />
          <div className="mt-2 flex items-center gap-3">
            <Button variant="secondary" onClick={importJson} disabled={!json.trim()}>Import JSON</Button>
            {error && <span className="text-xs text-red-600">{error}</span>}
          </div>
        </div>
      </Card>

      {payload && (
        <Card>
          <h2 className="mb-2 font-medium">Active token payload</h2>
          <pre className="overflow-x-auto rounded bg-neutral-50 p-3 text-xs">{JSON.stringify(payload, null, 2)}</pre>
        </Card>
      )}
    </div>
  )
}
