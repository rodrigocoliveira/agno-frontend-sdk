import { useAgnoTeam } from '@rodrigocoliveira/agno-hooks'
import { useParams, useSearchParams } from 'react-router'
import { RunShell } from '../run/RunShell'
import { frontendTools } from '../tools/frontendTools'

export function TeamPage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const team = useAgnoTeam({ teamId: id, sessionId: params.get('session'), frontendTools })
  return <RunShell kind="team" targetId={id} hook={team} hint="Ask the team something. Member runs appear nested under the leader." />
}
