import { useAgnoApi } from '@rodrigocoliveira/agno-hooks'
import { useEffect, useState } from 'react'

/** `online` is null until the first /health answers; `osId` comes from /config when the token allows it. */
export function useHealth() {
  const api = useAgnoApi()
  const [state, setState] = useState<{ online: boolean | null; osId: string | null }>({ online: null, osId: null })
  useEffect(() => {
    let alive = true
    api.os.health()
      .then(() => api.os.config().then((c) => c.os_id ?? null).catch(() => null))
      .then((osId) => { if (alive) setState({ online: true, osId }) })
      .catch(() => { if (alive) setState({ online: false, osId: null }) })
    return () => { alive = false }
  }, [api])
  return state
}
