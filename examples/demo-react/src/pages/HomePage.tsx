import { Link } from 'react-router'
import { CATALOG, GUIDE_URL, pathFor } from '../catalog'
import { useTargets } from '../connection/TargetsContext'
import { useHealth } from '../connection/useHealth'
import { Badge } from '../ui/Badge'
import { Card } from '../ui/Card'

export function HomePage() {
  const { online } = useHealth()
  const t = useTargets()
  const known = new Set([...t.agents.map((a) => `agent:${a.id}`), ...t.teams.map((x) => `team:${x.id}`), ...t.workflows.map((w) => `workflow:${w.id}`)])
  return (
    <div className="h-full space-y-6 overflow-y-auto p-6">
      {online === false && <Card className="border-red-300 text-sm">AgentOS did not answer. Check the endpoint in <Link className="underline" to="/settings">Settings</Link>.</Card>}
      {t.status === 'error' && <Card className="border-amber-300 text-sm">Could not list targets: {t.error?.message}. This OS may require a token — see <Link className="underline" to="/settings">Settings</Link>.</Card>}
      <div className="grid grid-cols-3 gap-4">
        {([['Agents', t.agents.length], ['Teams', t.teams.length], ['Workflows', t.workflows.length]] as const).map(([label, n]) => (
          <Card key={label}><div className="text-xs uppercase text-neutral-500">{label}</div><div className="text-3xl font-semibold">{n}</div></Card>
        ))}
      </div>
      <Card>
        <h2 className="mb-3 font-medium">What each demo shows</h2>
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-neutral-500"><tr><th className="py-1">target</th><th>try</th><th>shows</th><th>guide</th></tr></thead>
          <tbody>
            {CATALOG.map((c) => {
              const present = known.has(`${c.kind}:${c.id}`)
              return (
                <tr key={`${c.kind}:${c.id}`} className="border-t border-neutral-100 align-top">
                  <td className="py-2 pr-3 whitespace-nowrap">
                    <Badge>{c.kind}</Badge>{' '}
                    {present ? <Link className="underline" to={pathFor(c.kind, c.id)}>{c.id}</Link> : <span className="text-neutral-400" title="not in this OS">{c.id}</span>}
                  </td>
                  <td className="py-2 pr-3 text-neutral-600">“{c.try}”</td>
                  <td className="py-2 pr-3">{c.shows}</td>
                  <td className="py-2"><a className="underline" href={GUIDE_URL + c.guide} target="_blank" rel="noreferrer">{c.guide}</a></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
