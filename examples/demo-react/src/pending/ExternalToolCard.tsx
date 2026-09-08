import type { ToolExecution } from '@rodrigocoliveira/agno-api'
import { useState } from 'react'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Input } from '../ui/Input'

/** A tool the server expects the client to execute. Shown for hydrated pauses (no auto-run) or tools with no frontendTools entry. */
export function ExternalToolCard({ tool, onRunTools, onResolve }: { tool: ToolExecution; onRunTools: () => void; onResolve: (result: string) => void }) {
  const [value, setValue] = useState('')
  const [sent, setSent] = useState(false)
  return (
    <Card className="space-y-2 text-sm">
      <div><code className="font-mono">{tool.tool_name}</code> must be executed by this app.</div>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onRunTools}>Run browser tools</Button>
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="or type a result" />
        <Button variant="secondary" disabled={!value} onClick={() => { onResolve(value); setSent(true) }}>{sent ? 'Recorded ✓' : 'Use result'}</Button>
      </div>
    </Card>
  )
}
