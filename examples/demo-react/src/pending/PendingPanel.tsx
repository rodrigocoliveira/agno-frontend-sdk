import type { AgnoHook, Kind } from '@rodrigocoliveira/agno-hooks'

export function PendingPanel<K extends Kind>(_: { hook: AgnoHook<K> }) {
  return null
}
