/**
 * Deep-merge pra `session_state`: objetos planos recursam em qualquer profundidade;
 * arrays e primitivos substituem (sem concat, sem merge por índice); `null` seta a
 * chave (não apaga — apagar é fora de escopo, ver o spec). Nunca muta os argumentos.
 */

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

export function deepMerge<T extends Record<string, unknown>>(base: T, partial: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...base }
  for (const key of Object.keys(partial)) {
    // `out['__proto__'] = value` hits Object.prototype's inherited setter instead of creating an own
    // property: it would silently swap this result's prototype (nothing shared is mutated, but the
    // merged object stops being plain, and `isPlainObject` would reject it downstream).
    if (key === '__proto__') continue
    const current = out[key]
    const incoming = partial[key]
    out[key] = isPlainObject(current) && isPlainObject(incoming) ? deepMerge(current, incoming) : incoming
  }
  return out as T
}
