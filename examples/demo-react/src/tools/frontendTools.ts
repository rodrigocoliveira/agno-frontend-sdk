import type { FrontendTool } from '@rodrigocoliveira/agno-hooks'

/** Tools the demo server declares with external_execution=True. The hook runs them when a live run pauses on them. */
export const frontendTools: Record<string, FrontendTool> = {
  get_location: () =>
    new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        (e) => reject(new Error(e.message)),
        { timeout: 10_000 },
      ),
    ),
  get_local_time: () => ({ iso: new Date().toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
}
