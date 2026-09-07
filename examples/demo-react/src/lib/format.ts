export function formatTime(epochSeconds: number | string | null | undefined): string {
  if (epochSeconds == null) return ''
  const n = typeof epochSeconds === 'string' ? Date.parse(epochSeconds) / 1000 : epochSeconds
  if (!Number.isFinite(n)) return String(epochSeconds)
  return new Date(n * 1000).toLocaleString()
}

export function short(id: string | null | undefined, n = 8): string {
  return id ? (id.length > n ? `${id.slice(0, n)}…` : id) : ''
}

export const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Decodes a JWT payload without verifying it — for display only. */
export function jwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1]
    if (!part) return null
    return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>
  } catch {
    return null
  }
}
