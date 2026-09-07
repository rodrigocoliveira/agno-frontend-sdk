import { createAgnoApi, type AgnoApi, type AgnoApiConfig } from '@rodrigocoliveira/agno-api'
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AgnoStore } from '../store/store'
import type { Kind } from '../types'

type AnyStore = AgnoStore<Kind>
interface Entry { store: AnyStore; refs: number; timer: ReturnType<typeof setTimeout> | null }

export interface Registry {
  /** Returns the store for `key`, creating it when missing. Does not change the ref count. */
  get(key: string, create: () => AnyStore): AnyStore
  retain(key: string): void
  /** When the count reaches zero, destroys on the next tick unless retained again (StrictMode mount/unmount/mount). */
  release(key: string): void
  /** Moves an entry to a new key; the old key keeps working for retain/release of hooks that still hold it. */
  rekey(oldKey: string, newKey: string): void
  clear(): void
}

export function createRegistry(): Registry {
  const entries = new Map<string, Entry>()
  const aliases = new Map<string, string>()
  const resolve = (key: string) => { let k = key; while (aliases.has(k)) k = aliases.get(k)!; return k }
  return {
    get(key, create) {
      aliases.delete(key)
      let e = entries.get(key)
      if (!e) { e = { store: create(), refs: 0, timer: null }; entries.set(key, e) }
      return e.store
    },
    retain(key) {
      const e = entries.get(resolve(key)); if (!e) return
      e.refs++
      if (e.timer) { clearTimeout(e.timer); e.timer = null }
    },
    release(key) {
      const k = resolve(key); const e = entries.get(k); if (!e) return
      e.refs = Math.max(0, e.refs - 1)
      if (e.refs === 0 && !e.timer) {
        e.timer = setTimeout(() => {
          e.timer = null
          if (e.refs !== 0 || entries.get(k) !== e) return
          entries.delete(k); e.store.destroy()
          for (const [a, target] of aliases) if (target === k) aliases.delete(a)
        }, 0)
      }
    },
    rekey(oldKey, newKey) {
      const k = resolve(oldKey); const e = entries.get(k)
      if (!e || k === newKey || entries.has(newKey)) return
      entries.delete(k); entries.set(newKey, e); aliases.set(k, newKey)
    },
    clear() {
      for (const e of entries.values()) { if (e.timer) clearTimeout(e.timer); e.store.destroy() }
      entries.clear(); aliases.clear()
    },
  }
}

export interface AgnoContextValue { api: AgnoApi; registry: Registry }
const AgnoContext = createContext<AgnoContextValue | null>(null)

export interface AgnoProviderProps extends Partial<AgnoApiConfig> {
  /** A ready instance; wins over the config props. */
  api?: AgnoApi
  children?: ReactNode
}

/**
 * One connection. Creates the AgnoApi once from the config props (token / onTokenExpired are read through refs,
 * so inline closures never recreate it); recreates only when baseUrl, params, headers or fetch change.
 */
export function AgnoProvider({ api: given, children, ...config }: AgnoProviderProps) {
  const tokenRef = useRef(config.token); tokenRef.current = config.token
  const expiredRef = useRef(config.onTokenExpired); expiredRef.current = config.onTokenExpired
  const paramsKey = JSON.stringify(config.params ?? null)
  const headersKey = JSON.stringify(config.headers ?? null)
  const api = useMemo<AgnoApi>(() => {
    if (given) return given
    if (!config.baseUrl) throw new Error('AgnoProvider needs either `api` or `baseUrl`')
    return createAgnoApi({
      baseUrl: config.baseUrl,
      params: config.params,
      headers: config.headers,
      fetch: config.fetch,
      token: () => { const t = tokenRef.current; return typeof t === 'function' ? t() : t },
      onTokenExpired: () => expiredRef.current?.(),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [given, config.baseUrl, paramsKey, headersKey, config.fetch])
  const [registries] = useState(() => new WeakMap<AgnoApi, Registry>())
  const registry = useMemo(() => { let r = registries.get(api); if (!r) { r = createRegistry(); registries.set(api, r) } return r }, [api, registries])
  // Deferred like `release`: StrictMode's mount/unmount/mount must not destroy the stores just created.
  const disposal = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (disposal.current) { clearTimeout(disposal.current); disposal.current = null }
    return () => { disposal.current = setTimeout(() => { disposal.current = null; registry.clear() }, 0) }
  }, [registry])
  const value = useMemo(() => ({ api, registry }), [api, registry])
  return <AgnoContext.Provider value={value}>{children}</AgnoContext.Provider>
}

export function useAgnoContext(): AgnoContextValue {
  const ctx = useContext(AgnoContext)
  if (!ctx) throw new Error('useAgno* hooks must be used inside <AgnoProvider>')
  return ctx
}

export const useAgnoApi = (): AgnoApi => useAgnoContext().api
