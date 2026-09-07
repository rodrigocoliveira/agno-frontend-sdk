import { createAgnoApi, type AgnoApi, type AgnoApiConfig } from '@rodrigocoliveira/agno-api'
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AgnoStore } from '../store/store'
import type { Kind } from '../types'

type AnyStore = AgnoStore<Kind>

/**
 * An opaque handle to a registered store. Callers keep the handle (never the key) so that a
 * later `rekey` cannot be shadowed by another component claiming the freed key.
 */
export interface RegistryEntry { readonly store: AnyStore }

/** The handle plus the registry's own bookkeeping; never widened beyond `RegistryEntry` for callers. */
interface Entry { key: string; readonly store: AnyStore; refs: number; timer: ReturnType<typeof setTimeout> | null }

export interface Registry {
  /** The entry filed under `key`, or a new one (ref count 0) holding `create()`. Does not change the ref count. */
  get(key: string, create: () => AnyStore): RegistryEntry
  retain(entry: RegistryEntry): void
  /** When the count reaches zero, destroys on the next tick unless retained again (StrictMode mount/unmount/mount). */
  release(entry: RegistryEntry): void
  /** Moves the entry to `newKey`; a no-op when `newKey` is already taken by another entry. */
  rekey(entry: RegistryEntry, newKey: string): void
  clear(): void
}

export function createRegistry(): Registry {
  const entries = new Map<string, Entry>()
  // A handle only counts while it is still the entry filed under its own key: an entry that was
  // destroyed (or cleared) is inert, so late retain/release calls from unmounting hooks are no-ops.
  const live = (entry: RegistryEntry): Entry | null => {
    const e = entry as Entry
    return e && entries.get(e.key) === e ? e : null
  }
  return {
    get(key, create) {
      let e = entries.get(key)
      if (!e) { e = { key, store: create(), refs: 0, timer: null }; entries.set(key, e) }
      return e
    },
    retain(entry) {
      const e = live(entry); if (!e) return
      e.refs++
      if (e.timer) { clearTimeout(e.timer); e.timer = null }
    },
    release(entry) {
      const e = live(entry); if (!e) return
      e.refs = Math.max(0, e.refs - 1)
      if (e.refs === 0 && !e.timer) {
        e.timer = setTimeout(() => {
          e.timer = null
          if (e.refs !== 0 || entries.get(e.key) !== e) return
          entries.delete(e.key); e.store.destroy()
        }, 0)
      }
    },
    rekey(entry, newKey) {
      const e = live(entry); if (!e || e.key === newKey || entries.has(newKey)) return
      entries.delete(e.key); e.key = newKey; entries.set(newKey, e)
    },
    clear() {
      for (const e of entries.values()) { if (e.timer) clearTimeout(e.timer); e.store.destroy() }
      entries.clear()
    },
  }
}

export interface AgnoContextValue { api: AgnoApi; registry: Registry }
const AgnoContext = createContext<AgnoContextValue | null>(null)

export interface AgnoProviderProps extends Partial<AgnoApiConfig> {
  /**
   * A ready instance; wins over the config props. It must be stable across renders — create it once
   * (module scope, `useMemo` or `useState`), because an inline `createAgnoApi(...)` is a new instance
   * on every render and every store is recreated with it.
   */
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
  // The pending clear is tagged with its own registry, so remounting cancels only that registry's clear —
  // a discarded registry's clear still fires when `api` changes.
  const disposal = useRef<{ registry: Registry; timer: ReturnType<typeof setTimeout> } | null>(null)
  useEffect(() => {
    const pending = disposal.current
    if (pending && pending.registry === registry) { clearTimeout(pending.timer); disposal.current = null }
    return () => {
      const timer = setTimeout(() => {
        if (disposal.current?.timer === timer) disposal.current = null
        registry.clear()
      }, 0)
      disposal.current = { registry, timer }
    }
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
