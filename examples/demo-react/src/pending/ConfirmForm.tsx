import type { ToolExecution } from '@rodrigocoliveira/agno-api'
import { confirm, reject } from '@rodrigocoliveira/agno-hooks'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'

export function ConfirmForm({ tool, decided, onDecide }: { tool: ToolExecution; decided?: ToolExecution; onDecide: (t: ToolExecution) => void }) {
  return (
    <Card className="flex items-center gap-3 text-sm">
      <div className="flex-1">
        Run <code className="font-mono">{tool.tool_name}</code> with <code className="font-mono text-xs">{JSON.stringify(tool.tool_args ?? {})}</code>?
      </div>
      <Button variant={decided?.confirmed === true ? 'primary' : 'secondary'} onClick={() => onDecide(confirm(tool))}>Approve</Button>
      <Button variant={decided?.confirmed === false ? 'danger' : 'secondary'} onClick={() => onDecide(reject(tool, 'rejected by the user'))}>Reject</Button>
    </Card>
  )
}
