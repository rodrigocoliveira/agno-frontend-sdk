import type { ToolExecution } from '@rodrigocoliveira/agno-api'
import { Link } from 'react-router'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'

export function ApprovalNotice({ tool, onRetry }: { tool: ToolExecution; onRetry: () => void }) {
  return (
    <Card className="flex items-center gap-3 text-sm">
      <div className="flex-1">
        <code className="font-mono">{tool.tool_name}</code> is waiting for an admin. Approval <code className="font-mono text-xs">{tool.approval_id}</code>.
        <div className="text-xs text-neutral-500">Switch to the <code>admin</code> token, resolve it in <Link className="underline" to="/approvals">Approvals</Link>, come back and continue.</div>
      </div>
      <Button variant="secondary" onClick={onRetry}>Continue</Button>
    </Card>
  )
}
