import { useAgnoWorkflow } from '@rodrigocoliveira/agno-hooks'
import { useParams, useSearchParams } from 'react-router'
import { RunShell } from '../run/RunShell'

export function WorkflowPage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const workflow = useAgnoWorkflow({ workflowId: id, sessionId: params.get('session') })
  return <RunShell kind="workflow" targetId={id} hook={workflow} hint="Give the workflow its input. Each step shows up as it runs." />
}
