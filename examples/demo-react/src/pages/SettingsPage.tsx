import { useState } from 'react'
import { TokensCard } from '../connection/TokensCard'
import { useConnection } from '../connection/ConnectionContext'
import { useHealth } from '../connection/useHealth'
import { jwtPayload } from '../lib/format'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Input } from '../ui/Input'

export function SettingsPage() {
  const c = useConnection()
  const { online, osId } = useHealth()
  const [endpoint, setEndpoint] = useState(c.endpoint)
  const payload = c.activeToken ? jwtPayload(c.activeToken) : null

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

      <TokensCard />

      {payload && (
        <Card>
          <h2 className="mb-2 font-medium">Active token payload</h2>
          <pre className="overflow-x-auto rounded bg-neutral-50 p-3 text-xs">{JSON.stringify(payload, null, 2)}</pre>
        </Card>
      )}
    </div>
  )
}
