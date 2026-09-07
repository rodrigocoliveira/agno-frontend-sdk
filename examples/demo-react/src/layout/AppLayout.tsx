import { Link, Outlet } from 'react-router'
import { useConnection } from '../connection/ConnectionContext'
import { TargetsProvider } from '../connection/TargetsContext'
import { useHealth } from '../connection/useHealth'
import { cn } from '../lib/cn'
import { Badge } from '../ui/Badge'
import { Sidebar } from './Sidebar'

function Header() {
  const { endpoint, activeLabel } = useConnection()
  const { online, osId } = useHealth()
  return (
    <header className="flex items-center gap-3 border-b border-neutral-200 bg-white px-4 py-2 text-sm">
      <span className={cn('h-2 w-2 rounded-full', online === null ? 'bg-neutral-300' : online ? 'bg-green-500' : 'bg-red-500')} />
      <span className="font-mono text-xs text-neutral-600">{endpoint}</span>
      {osId && <Badge>{osId}</Badge>}
      <span className="ml-auto text-neutral-500">token:</span>
      <Link to="/settings"><Badge tone={activeLabel ? 'blue' : 'neutral'}>{activeLabel ?? 'none'}</Badge></Link>
    </header>
  )
}

export function AppLayout() {
  return (
    <TargetsProvider>
      <div className="grid h-screen grid-cols-[220px_1fr] grid-rows-[auto_1fr]">
        <div className="col-span-2"><Header /></div>
        <Sidebar />
        <main className="min-h-0 min-w-0 overflow-hidden"><Outlet /></main>
      </div>
    </TargetsProvider>
  )
}
