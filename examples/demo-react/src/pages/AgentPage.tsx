import { useAgnoAgent } from '@rodrigocoliveira/agno-hooks'
import { useParams, useSearchParams } from 'react-router'
import { RunShell } from '../run/RunShell'
import { frontendTools } from '../tools/frontendTools'

export function AgentPage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const agent = useAgnoAgent({ agentId: id, sessionId: params.get('session'), frontendTools })
  return <RunShell kind="agent" targetId={id} hook={agent} hint="Send a message to start a run." />
}
