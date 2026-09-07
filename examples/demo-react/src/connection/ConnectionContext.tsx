import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

export interface TokenEntry { label: string; token: string }
export interface ConnectionState { endpoint: string; tokens: TokenEntry[]; activeLabel: string | null }

const STORAGE_KEY = 'demo-react:connection'
const DEFAULT: ConnectionState = { endpoint: 'http://localhost:7777', tokens: [], activeLabel: null }

/** Accepts the JSON printed by demo-agentos/tokens.py: { "admin": "<jwt>", "user-1": "<jwt>", ... } */
export function parseTokens(json: string): TokenEntry[] {
  const obj = JSON.parse(json) as Record<string, unknown>
  return Object.entries(obj)
    .filter((e): e is [string, string] => typeof e[1] === 'string' && e[1].length > 0)
    .map(([label, token]) => ({ label, token }))
}

function load(): ConnectionState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULT, ...(JSON.parse(raw) as Partial<ConnectionState>) }
  } catch { /* unavailable or corrupted storage: start fresh */ }
  const seeded = import.meta.env.VITE_AGNO_TOKENS as string | undefined
  try { return seeded ? { ...DEFAULT, tokens: parseTokens(seeded) } : DEFAULT } catch { return DEFAULT }
}

function persist(state: ConnectionState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch { /* private mode: keep in memory */ }
}

export interface Connection extends ConnectionState {
  activeToken: string | null
  setEndpoint(url: string): void
  setActive(label: string | null): void
  upsertTokens(entries: TokenEntry[]): void
  removeToken(label: string): void
}

const Ctx = createContext<Connection | null>(null)

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConnectionState>(load)
  const update = (patch: (s: ConnectionState) => ConnectionState) =>
    setState((s) => { const next = patch(s); persist(next); return next })

  const value = useMemo<Connection>(() => ({
    ...state,
    activeToken: state.tokens.find((t) => t.label === state.activeLabel)?.token ?? null,
    setEndpoint: (url) => update((s) => ({ ...s, endpoint: url.trim().replace(/\/+$/, '') })),
    setActive: (activeLabel) => update((s) => ({ ...s, activeLabel })),
    upsertTokens: (entries) => update((s) => ({
      ...s,
      tokens: [...s.tokens.filter((t) => !entries.some((e) => e.label === t.label)), ...entries],
    })),
    removeToken: (label) => update((s) => ({
      ...s,
      tokens: s.tokens.filter((t) => t.label !== label),
      activeLabel: s.activeLabel === label ? null : s.activeLabel,
    })),
  }), [state])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useConnection(): Connection {
  const v = useContext(Ctx)
  if (!v) throw new Error('useConnection must be used inside <ConnectionProvider>')
  return v
}
