# Edição manual de `session_state` — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar o app consumidor de `@rodrigocoliveira/agno-hooks` ler e editar `session_state` manualmente (ex.: botão +/- numa lista de compras), sem depender do agente pra mudar o estado, com lock real contra edição durante uma run ativa.

**Architecture:** Tudo entra na `AgnoStore<K>` genérica já existente (`packages/agno-hooks/src/store/store.ts`) — `session_state` é propriedade da sessão, não da run, então nenhuma lógica por `kind` é necessária; `useAgnoAgent`/`useAgnoTeam`/`useAgnoWorkflow` ganham a feature de graça via o spread já existente em `react/hooks.ts`. Leitura vem de duas fontes (`GET /sessions/{id}` no hydrate, e o campo `session_state` que já vem — hoje ignorado — nos eventos terminais de run). Escrita é deep merge local otimista + fila de PATCH serializada, com resync em falha.

**Tech Stack:** TypeScript, Bun test runner, `@rodrigocoliveira/agno-api` (rotas já existentes, nenhuma mudança nesse pacote).

**Spec:** `docs/superpowers/specs/2026-09-09-manual-session-state-design.md`

## Global Constraints

- Merge é **deep merge**: objetos planos recursam em qualquer profundidade; arrays e primitivos substituem; `null` seta a chave (não apaga). Algoritmo portado de `agno-client/packages/core/src/utils/deep-merge.ts`.
- `mergeSessionState` lança `Error('A run is already active')` quando `isBusy === true` — mesma mensagem que `send()` já usa.
- `mergeSessionState` lança `Error('mergeSessionState requires an active session — send a message first')` quando `sessionId === null`.
- Escritas são sempre serializadas por instância de store: nunca dois `PATCH /sessions/{id}` em voo ao mesmo tempo; cada PATCH manda o `session_state` **completo** já mesclado no momento em que foi enfileirado, nunca um delta.
- Falha de PATCH: resincroniza via `sessions.get`, rejeita a promise daquela chamada específica; chamadas seguintes na fila não são afetadas.
- Nenhuma mudança em `@rodrigocoliveira/agno-api` — `sessions.get` e `sessions.update` já existem e já são genéricos.
- Fora de escopo (não implementar): edição antes da primeira run (`sessionId` null), `statePath`/namespace de chaves, primitivo de replace/delete de branch.

---

## File Structure

- **Create** `packages/agno-hooks/src/utils/deep-merge.ts` — `isPlainObject`, `deepMerge`. Nenhuma dependência de store/tipos de run; puro.
- **Create** `packages/agno-hooks/test/utils/deep-merge.test.ts` — testes do algoritmo isolado.
- **Modify** `packages/agno-hooks/src/types.ts` — `Snapshot<K>` ganha `sessionState`.
- **Modify** `packages/agno-hooks/src/store/store.ts` — estado `sessionState` no closure, popular via `hydrate()` + eventos terminais, ação `mergeSessionState` com lock/fila/resync.
- **Modify** `packages/agno-hooks/test/store/store.test.ts` — testes de leitura e escrita do `sessionState`.
- **Modify** `packages/agno-hooks/src/react/hooks.ts` — `AgnoHook<K>` e `SERVER_SNAPSHOT` ganham `sessionState`/`mergeSessionState`.
- **Modify** `packages/agno-hooks/test/react/hooks.test.tsx` — teste end-to-end via `useAgnoAgent`.

---

### Task 1: utilitário de deep merge

**Files:**
- Create: `packages/agno-hooks/src/utils/deep-merge.ts`
- Test: `packages/agno-hooks/test/utils/deep-merge.test.ts`

**Interfaces:**
- Consumes: nada (função pura, sem dependências do resto do pacote).
- Produces: `isPlainObject(value: unknown): value is Record<string, unknown>` e `deepMerge<T extends Record<string, unknown>>(base: T, partial: Record<string, unknown>): T` — usados pela Task 2 (leitura, pra checar `ev.session_state`) e pela Task 3 (escrita).

- [ ] **Step 1: Escrever o teste que falha**

Criar `packages/agno-hooks/test/utils/deep-merge.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { deepMerge, isPlainObject } from '../../src/utils/deep-merge'

describe('isPlainObject', () => {
  test('true só pra objeto literal; false pra array, null, Date, classe', () => {
    expect(isPlainObject({})).toBe(true)
    expect(isPlainObject({ a: 1 })).toBe(true)
    expect(isPlainObject([1, 2])).toBe(false)
    expect(isPlainObject(null)).toBe(false)
    expect(isPlainObject(new Date())).toBe(false)
    expect(isPlainObject('x')).toBe(false)
    expect(isPlainObject(1)).toBe(false)
  })
})

describe('deepMerge', () => {
  test('mescla objetos planos em qualquer profundidade; chaves-irmãs sobrevivem', () => {
    const base = { cart: { items: [{ id: 'a', qty: 1 }], delivery: { notes: 'x' }, _audit: { by: 'agent' } } }
    const out = deepMerge(base, { cart: { items: [{ id: 'a', qty: 2 }] } })
    expect(out).toEqual({ cart: { items: [{ id: 'a', qty: 2 }], delivery: { notes: 'x' }, _audit: { by: 'agent' } } })
  })

  test('array e primitivo substituem, não mesclam por índice', () => {
    expect(deepMerge({ items: [1, 2, 3] }, { items: [9] })).toEqual({ items: [9] })
    expect(deepMerge({ count: 1 }, { count: 2 })).toEqual({ count: 2 })
  })

  test('null seta a chave, não apaga', () => {
    expect(deepMerge({ a: { b: 1 } }, { a: null })).toEqual({ a: null })
  })

  test('chave nova é adicionada; troca de tipo objeto<->primitivo substitui', () => {
    expect(deepMerge({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 })
    expect(deepMerge({ a: { x: 1 } }, { a: 'now a string' })).toEqual({ a: 'now a string' })
  })

  test('não muta os argumentos', () => {
    const base = { a: { b: 1 } }
    const partial = { a: { c: 2 } }
    deepMerge(base, partial)
    expect(base).toEqual({ a: { b: 1 } })
    expect(partial).toEqual({ a: { c: 2 } })
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd packages/agno-hooks && bun test test/utils/deep-merge.test.ts`
Expected: FAIL — `Cannot find module '../../src/utils/deep-merge'` (o arquivo de origem ainda não existe).

- [ ] **Step 3: Implementar**

Criar `packages/agno-hooks/src/utils/deep-merge.ts`:

```ts
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
    const current = out[key]
    const incoming = partial[key]
    out[key] = isPlainObject(current) && isPlainObject(incoming) ? deepMerge(current, incoming) : incoming
  }
  return out as T
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd packages/agno-hooks && bun test test/utils/deep-merge.test.ts`
Expected: PASS (5 testes)

- [ ] **Step 5: Commit**

```bash
git add packages/agno-hooks/src/utils/deep-merge.ts packages/agno-hooks/test/utils/deep-merge.test.ts
git commit -m "$(cat <<'EOF'
feat(agno-hooks): deep-merge utility for session_state

Ported from agno-client v2 (proven algorithm, same semantics): plain
objects recurse, arrays/primitives replace, null sets not deletes.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: leitura de `sessionState` (hydrate + eventos terminais)

**Files:**
- Modify: `packages/agno-hooks/src/types.ts:87-94` (`Snapshot<K>`)
- Modify: `packages/agno-hooks/src/store/store.ts` (closure state, `build()`, `hydrate()`, `onEvent` em `startStream()`)
- Test: `packages/agno-hooks/test/store/store.test.ts`

**Interfaces:**
- Consumes: `isPlainObject` de `../utils/deep-merge` (Task 1).
- Produces: `Snapshot<K>.sessionState: Record<string, unknown> | null`, populado. Task 3 (escrita) lê e escreve essa mesma variável de closure `sessionState` dentro de `store.ts`.

- [ ] **Step 1: Escrever os testes que falham**

Em `packages/agno-hooks/test/store/store.test.ts`, adicionar (após o `describe('hydrate', ...)` existente, mesmo nível):

```ts
describe('sessionState (read)', () => {
  test('hydrate busca session_state via sessions.get em paralelo com os runs', async () => {
    const m = mockFetch((call) => {
      if (call.url.includes('/sessions/s1/runs')) return json([])
      if (call.url.endsWith('/sessions/s1') && call.init.method === 'GET') return json({ session_id: 's1', session_state: { count: 1 } })
      throw new Error('unexpected ' + call.url)
    })
    const s = await until(agentStore(m.fetch, { sessionId: 's1' }), (s) => s.status === 'ready' && s.sessionState !== null)
    expect(s.sessionState).toEqual({ count: 1 })
  })

  test('sem sessionId, sessionState fica null e sessions.get não é chamado', async () => {
    const m = mockFetch(() => json({}, 404))
    const s = agentStore(m.fetch).getSnapshot()
    expect(s.sessionState).toBeNull()
    expect(m.calls).toHaveLength(0)
  })

  test('sessions.get falhando não quebra o hydrate; sessionState fica null', async () => {
    const m = mockFetch((call) => {
      if (call.url.includes('/sessions/s1/runs')) return json([])
      if (call.url.endsWith('/sessions/s1') && call.init.method === 'GET') return json({ detail: 'boom' }, 500)
      throw new Error('unexpected ' + call.url)
    })
    const s = await until(agentStore(m.fetch, { sessionId: 's1' }), (s) => s.status === 'ready')
    expect(s.sessionState).toBeNull()
    expect(s.error).toBeNull()
  })

  test('evento terminal de run com session_state atualiza o snapshot', async () => {
    const withState = (run_id: string, text: string, i: number, session_state: Record<string, unknown>): AnyEvent =>
      ({ event: 'RunCompleted', run_id, content: text, event_index: i, session_state })
    const m = mockFetch(() => frames([started('r1', 's9'), withState('r1', 'hello', 1, { count: 5 })]))
    const store = agentStore(m.fetch)
    await store.send('hi')
    expect(store.getSnapshot().sessionState).toEqual({ count: 5 })
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd packages/agno-hooks && bun test test/store/store.test.ts`
Expected: FAIL — os três novos testes do `describe('sessionState (read)', ...)` falham (`sessionState` não existe no `Snapshot`/store ainda). Os testes existentes de `hydrate` continuam passando normalmente (ver nota no Step 3, item 6, sobre por que a chamada nova não os afeta).

- [ ] **Step 3: Implementar**

Em `packages/agno-hooks/src/types.ts`, adicionar o campo em `Snapshot<K>` (linha 87-94):

```ts
export interface Snapshot<K extends Kind> {
  status: 'loading' | 'ready' | 'error'
  sessionId: string | null
  runs: RunOf<K>[]
  pending: Pending<K> | null
  isBusy: boolean
  error: Error | null
  sessionState: Record<string, unknown> | null
}
```

Em `packages/agno-hooks/src/store/store.ts`:

1. Import (topo do arquivo, junto aos outros imports de `../run` etc.):

```ts
import { isPlainObject } from '../utils/deep-merge'
```

2. Variável de closure, junto às outras (perto de `let error: Error | null = null`):

```ts
let sessionState: Record<string, unknown> | null = null
```

3. Incluir no `build()`:

```ts
const build = (): Snapshot<K> => ({
  status, sessionId, runs, pending: computePending(),
  isBusy: runs.some((r) => (r.local && r.status === 'running') || r.status === 'paused'),
  error, sessionState,
})
```

4. Em `hydrate()`, logo após `status = 'loading'; commit()` (antes do `try { rows = ... }` existente), disparar a busca em paralelo, sem bloquear nem afetar o fluxo de erro dos runs:

```ts
async function hydrate(): Promise<void> {
  if (!sessionId) { status = 'ready'; commit(); return }
  status = 'loading'; commit()
  const sid = sessionId
  void options.api.sessions.get(sid).then((session) => {
    if (destroyed || sessionId !== sid) return
    const state = (session as { session_state?: unknown }).session_state
    sessionState = isPlainObject(state) ? state : null
    commit()
  }).catch(() => { /* estado é auxiliar; falha aqui não derruba o hydrate */ })
  let rows: RunRowLike[]
  // ...resto do corpo de hydrate() inalterado
```

5. No handler `onEvent` dentro de `startStream()`, logo antes do `commit()` existente (depois da linha que atualiza `eventIndex`):

```ts
onEvent: (ev) => {
  const found = current()
  if (!found) return
  const wasPaused = found.status === 'paused'
  const run = reseedPending ? reseedForReplay(found) : found
  reseedPending = false
  let next = applyEvent(run, ev)
  if (onAccepted && ACCEPTED.has(ev.event)) { next = onAccepted(next); onAccepted = undefined }
  if (typeof ev.event_index === 'number') next = { ...next, eventIndex: ev.event_index }
  const evState = (ev as { session_state?: unknown }).session_state
  if (isPlainObject(evState)) sessionState = evState
  replace(id, next)
  if (next.id !== id) { streams.delete(id); streams.set(next.id, ac); id = next.id }
  if (!sessionId && next.sessionId) sessionId = next.sessionId
  if (isTerminal(next.status)) resolutions.delete(next.id)
  commit()
  if (!wasPaused && next.status === 'paused') void autoRunTools(next.id).catch(() => {})
},
```

6. Nenhum teste existente precisa de ajuste pra conviver com essa chamada nova. `mockFetch`'s `fetchFn` (`test/store/../../agno-api/test/helpers.ts`) é declarado `async`, então mesmo um handler síncrono que faz `throw new Error('unexpected ' + call.url)` pra uma URL não reconhecida vira uma **promise rejeitada** na chamada de `fetch(...)` — nunca uma exceção síncrona na criação do store (`void hydrate()` já é fire-and-forget). Como o `.catch(() => {})` do passo anterior absorve exatamente essa rejeição, os testes que hoje têm um handler "lança pra URL desconhecida" continuam passando sem mudança nenhuma: a chamada extra falha silenciosamente, `sessionState` fica `null`, e nada mais no snapshot é afetado. Verificado que nenhum teste existente com `sessionId` definido faz asserção de contagem total de `m.calls` (as poucas asserções `toHaveLength`/`calls.length ===` do arquivo são todas em stores sem `sessionId`, que nunca disparam essa chamada) — só o Step 4 (rodar a suíte inteira) é necessário como rede de segurança.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd packages/agno-hooks && bun test test/store/store.test.ts`
Expected: PASS (todos os testes de `hydrate` e o novo `describe('sessionState (read)', ...)`)

Run também a suíte inteira do pacote pra garantir que nada mais quebrou:
Run: `cd packages/agno-hooks && bun test test/hitl test/run test/store test/types.test.ts test/exports.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/agno-hooks/src/types.ts packages/agno-hooks/src/store/store.ts packages/agno-hooks/test/store/store.test.ts
git commit -m "$(cat <<'EOF'
feat(agno-hooks): expose session_state on the snapshot (read side)

Snapshot<K> gains sessionState, populated from GET /sessions/{id}
during hydrate() (parallel to the runs fetch, best-effort) and kept in
sync from session_state already carried by terminal run events
(RunCompleted/TeamRunCompleted/WorkflowCompleted), previously ignored.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: escrita de `sessionState` (`mergeSessionState`)

**Files:**
- Modify: `packages/agno-hooks/src/store/store.ts` (`AgnoStore<K>` interface, implementação, valor de retorno)
- Test: `packages/agno-hooks/test/store/store.test.ts`

**Interfaces:**
- Consumes: `sessionState` (closure var, Task 2), `deepMerge` de `../utils/deep-merge` (Task 1), `snapshot.isBusy` e `sessionId` (closure var já existente), `options.api.sessions.update`/`sessions.get`.
- Produces: `AgnoStore<K>.mergeSessionState(patch: Record<string, unknown> | ((current: Record<string, unknown>) => Record<string, unknown>)): Promise<void>` — usado pela Task 4 (`react/hooks.ts`).

- [ ] **Step 1: Escrever os testes que falham**

Em `packages/agno-hooks/test/store/store.test.ts`, adicionar novo `describe`:

```ts
describe('mergeSessionState (write)', () => {
  test('mescla localmente e faz PATCH do estado completo; irmãs sobrevivem, array substitui', async () => {
    const m = mockFetch((call) => {
      if (call.url.includes('/sessions/s1/runs')) return json([])
      if (call.url.endsWith('/sessions/s1') && call.init.method === 'GET')
        return json({ session_id: 's1', session_state: { cart: { items: [{ id: 'a', qty: 1 }], delivery: { notes: 'x' } } } })
      if (call.url.endsWith('/sessions/s1') && call.init.method === 'PATCH')
        return json({ session_id: 's1', session_state: JSON.parse(String(call.init.body)).session_state })
      throw new Error('unexpected ' + call.url)
    })
    const store = agentStore(m.fetch, { sessionId: 's1' })
    await until(store, (s) => s.sessionState !== null)
    await store.mergeSessionState({ cart: { items: [{ id: 'a', qty: 2 }] } })
    const s = store.getSnapshot()
    expect(s.sessionState).toEqual({ cart: { items: [{ id: 'a', qty: 2 }], delivery: { notes: 'x' } } })
    const patchCall = m.calls.find((c) => c.url.endsWith('/sessions/s1') && c.init.method === 'PATCH')!
    expect(JSON.parse(String(patchCall.init.body)).session_state).toEqual(s.sessionState)
  })

  test('aceita updater function recebendo o current certo', async () => {
    const m = mockFetch((call) => {
      if (call.url.includes('/sessions/s1/runs')) return json([])
      if (call.url.endsWith('/sessions/s1') && call.init.method === 'GET') return json({ session_id: 's1', session_state: { count: 3 } })
      if (call.url.endsWith('/sessions/s1') && call.init.method === 'PATCH')
        return json({ session_id: 's1', session_state: JSON.parse(String(call.init.body)).session_state })
      throw new Error('unexpected ' + call.url)
    })
    const store = agentStore(m.fetch, { sessionId: 's1' })
    await until(store, (s) => s.sessionState !== null)
    await store.mergeSessionState((current) => ({ count: (current.count as number) + 1 }))
    expect(store.getSnapshot().sessionState).toEqual({ count: 4 })
  })

  test('lança se isBusy e não chama a API', async () => {
    const m = mockFetch(() => frames([started('r1', 's9'), content('r1', 'hel', 1), completed('r1', 'hello', 2)]))
    const store = agentStore(m.fetch)
    const p = store.send('hi')
    // Checagem síncrona, sem `until`: o run otimista fica 'running' antes de qualquer rede (mesmo
    // padrão do teste de `send()` já existente no arquivo) — esperar via `until` aqui arriscaria
    // flakiness, já que o stream mockado (frames pré-montados) pode terminar rápido demais.
    expect(store.getSnapshot().isBusy).toBe(true)
    await expect(store.mergeSessionState({ a: 1 })).rejects.toThrow('A run is already active')
    expect(m.calls.some((c) => c.init.method === 'PATCH')).toBe(false)
    await p
  })

  test('lança se não há sessão ainda', async () => {
    const m = mockFetch(() => json({}, 404))
    const store = agentStore(m.fetch)
    await expect(store.mergeSessionState({ a: 1 })).rejects.toThrow('mergeSessionState requires an active session')
    expect(m.calls).toHaveLength(0)
  })

  test('chamadas concorrentes serializam: merge local em ordem, PATCH sequencial com o total acumulado', async () => {
    const patchBodies: unknown[] = []
    const m = mockFetch((call) => {
      if (call.url.includes('/sessions/s1/runs')) return json([])
      if (call.url.endsWith('/sessions/s1') && call.init.method === 'GET') return json({ session_id: 's1', session_state: { count: 0 } })
      if (call.url.endsWith('/sessions/s1') && call.init.method === 'PATCH') {
        const state = JSON.parse(String(call.init.body)).session_state
        patchBodies.push(state)
        return json({ session_id: 's1', session_state: state })
      }
      throw new Error('unexpected ' + call.url)
    })
    const store = agentStore(m.fetch, { sessionId: 's1' })
    await until(store, (s) => s.sessionState !== null)
    const p1 = store.mergeSessionState({ count: 1 })
    const p2 = store.mergeSessionState((current) => ({ count: (current.count as number) + 10 }))
    expect(store.getSnapshot().sessionState).toEqual({ count: 11 }) // ambos os merges locais já aplicaram, antes de qualquer PATCH resolver
    await Promise.all([p1, p2])
    expect(patchBodies).toEqual([{ count: 1 }, { count: 11 }]) // PATCH em ordem, cada um com o total daquele momento
  })

  test('PATCH falhando resincroniza do servidor e rejeita só aquela chamada; fila continua', async () => {
    let failNext = true
    const m = mockFetch((call) => {
      if (call.url.includes('/sessions/s1/runs')) return json([])
      if (call.url.endsWith('/sessions/s1') && call.init.method === 'GET') return json({ session_id: 's1', session_state: { count: failNext ? 0 : 99 } })
      if (call.url.endsWith('/sessions/s1') && call.init.method === 'PATCH') {
        if (failNext) { failNext = false; return json({ detail: 'boom' }, 500) }
        return json({ session_id: 's1', session_state: JSON.parse(String(call.init.body)).session_state })
      }
      throw new Error('unexpected ' + call.url)
    })
    const store = agentStore(m.fetch, { sessionId: 's1' })
    await until(store, (s) => s.sessionState !== null)
    await expect(store.mergeSessionState({ count: 1 })).rejects.toThrow()
    expect(store.getSnapshot().sessionState).toEqual({ count: 99 }) // resincronizado, não ficou preso no otimista {count:1}
    await store.mergeSessionState({ count: 2 })
    expect(store.getSnapshot().sessionState).toEqual({ count: 2 })
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd packages/agno-hooks && bun test test/store/store.test.ts`
Expected: FAIL — `store.mergeSessionState is not a function`

- [ ] **Step 3: Implementar**

Em `packages/agno-hooks/src/store/store.ts`:

1. Na interface `AgnoStore<K>` (linhas 23-35), adicionar:

```ts
export interface AgnoStore<K extends Kind> {
  readonly kind: K
  getSnapshot(): Snapshot<K>
  subscribe(listener: () => void): () => void
  send(input: string | SendInput<K>): Promise<void>
  continue(decisions: Decision<K>[], extra?: ContinueExtra<K>): Promise<void>
  resolveTool(toolCallId: string, result: unknown): void
  runTools(runId?: string): Promise<void>
  resume(runId: string): Promise<void>
  cancel(runId?: string): Promise<void>
  mergeSessionState(patch: Record<string, unknown> | ((current: Record<string, unknown>) => Record<string, unknown>)): Promise<void>
  setFrontendTools(tools: Record<string, FrontendTool> | undefined): void
  destroy(): void
}
```

2. Variável de fila de escrita, junto às outras variáveis de closure (perto de `let localSeq = 0`):

```ts
let stateWriteQueue: Promise<unknown> = Promise.resolve()
```

3. A função, colocada depois de `cancel()` e antes da seção `// ---- HITL ----`:

`send()` já estabelece o padrão de por que isso precisa ser `async function` e não uma função comum: dentro de uma `async function`, um `throw` antes de qualquer `await` ainda vira uma Promise rejeitada (não uma exceção síncrona) — é isso que faz `await expect(store.send(...)).rejects.toThrow(...)` funcionar hoje. Uma função comum que faz `throw` estouraria na hora da chamada, antes mesmo do `expect` receber uma promise.

```ts
async function mergeSessionState(
  patch: Record<string, unknown> | ((current: Record<string, unknown>) => Record<string, unknown>),
): Promise<void> {
  if (destroyed) throw new Error('Store destroyed')
  if (snapshot.isBusy) throw new Error('A run is already active')
  if (!sessionId) throw new Error('mergeSessionState requires an active session — send a message first')
  const sid = sessionId
  const resolved = typeof patch === 'function' ? patch(sessionState ?? {}) : patch
  const next = deepMerge(sessionState ?? {}, resolved)
  sessionState = next
  commit()
  const run = stateWriteQueue.then(async () => {
    try {
      await options.api.sessions.update(sid, { session_state: next })
    } catch (err) {
      try {
        const session = await options.api.sessions.get(sid)
        const state = (session as { session_state?: unknown }).session_state
        sessionState = isPlainObject(state) ? state : null
      } catch { /* melhor esforço: mantém o que já tinha localmente */ }
      commit()
      throw err
    }
  })
  stateWriteQueue = run.catch(() => {})
  return run
}
```

4. Import de `deepMerge` (o import de `isPlainObject` já foi adicionado na Task 2 — juntar os dois numa linha só):

```ts
import { deepMerge, isPlainObject } from '../utils/deep-merge'
```

5. No objeto de retorno de `createAgnoStore` (final do arquivo), adicionar `mergeSessionState`:

```ts
return {
  kind,
  getSnapshot: () => snapshot,
  subscribe: (l) => { listeners.add(l); return () => { listeners.delete(l) } },
  send, continue: continueRun, resolveTool, runTools, resume, cancel, mergeSessionState,
  setFrontendTools: (t) => { frontendTools = t ?? {} },
  destroy,
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd packages/agno-hooks && bun test test/store/store.test.ts`
Expected: PASS (todos os testes, incluindo os dois novos `describe`)

Run também a suíte inteira:
Run: `cd packages/agno-hooks && bun test test/hitl test/run test/store test/types.test.ts test/exports.test.ts`
Expected: PASS

Run também o typecheck (a interface `AgnoStore<K>` mudou):
Run: `cd packages/agno-hooks && bun run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/agno-hooks/src/store/store.ts packages/agno-hooks/test/store/store.test.ts
git commit -m "$(cat <<'EOF'
feat(agno-hooks): mergeSessionState — deep merge, lock, write queue

New AgnoStore action to edit session_state manually (e.g. a +/- button
on a shopping list) without the agent. Unlike agno-client v2, the lock
against editing during an active run is enforced by the store itself
(throws on isBusy), not left as UI-side documentation. Writes are
serialized per store instance (each PATCH carries the full merged
state, never a delta) and a failed PATCH resyncs from the server
instead of trusting the stale optimistic value.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: superfície do hook React

**Files:**
- Modify: `packages/agno-hooks/src/react/hooks.ts`
- Test: `packages/agno-hooks/test/react/hooks.test.tsx`

**Interfaces:**
- Consumes: `Snapshot<K>.sessionState` (Task 2), `AgnoStore<K>.mergeSessionState` (Task 3).
- Produces: `useAgnoAgent`/`useAgnoTeam`/`useAgnoWorkflow` retornando `sessionState` e `mergeSessionState`.

- [ ] **Step 1: Escrever o teste que falha**

Em `packages/agno-hooks/test/react/hooks.test.tsx`, adicionar um componente e um teste (mesmo nível dos existentes):

```tsx
function StateChat({ sessionId }: { sessionId?: string }) {
  const chat = useAgnoAgent({ agentId: 'a', sessionId })
  return <div>
    <span data-testid="state">{JSON.stringify(chat.sessionState)}</span>
    <button onClick={() => void chat.mergeSessionState({ count: 1 })}>bump</button>
  </div>
}

describe('sessionState via useAgnoAgent', () => {
  test('expõe sessionState e mergeSessionState pelo hook', async () => {
    const m = mockFetch((call) => {
      if (call.url.includes('/sessions/s1/runs')) return json([])
      if (call.url.endsWith('/sessions/s1') && call.init.method === 'GET') return json({ session_id: 's1', session_state: { count: 0 } })
      if (call.url.endsWith('/sessions/s1') && call.init.method === 'PATCH')
        return json({ session_id: 's1', session_state: JSON.parse(String(call.init.body)).session_state })
      return json({}, 404)
    })
    const { getByTestId, getByText } = render(
      <AgnoProvider api={apiWith(m.fetch)}><StateChat sessionId="s1" /></AgnoProvider>,
    )
    await waitFor(() => expect(getByTestId('state').textContent).toBe('{"count":0}'))
    await act(async () => { getByText('bump').click() })
    await waitFor(() => expect(getByTestId('state').textContent).toBe('{"count":1}'))
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd packages/agno-hooks && bun test --preload ./test/dom.ts test/react`
Expected: FAIL — `chat.mergeSessionState is not a function` (ou `sessionState` undefined)

- [ ] **Step 3: Implementar**

Em `packages/agno-hooks/src/react/hooks.ts`:

1. Interface `AgnoHook<K>` (linhas 15-23):

```ts
export interface AgnoHook<K extends Kind> extends Snapshot<K> {
  send: AgnoStore<K>['send']
  continue: AgnoStore<K>['continue']
  resolveTool: AgnoStore<K>['resolveTool']
  runTools: AgnoStore<K>['runTools']
  resume: AgnoStore<K>['resume']
  cancel: AgnoStore<K>['cancel']
  mergeSessionState: AgnoStore<K>['mergeSessionState']
  store: AgnoStore<K>
}
```

2. `SERVER_SNAPSHOT` (linha 29) ganha o novo campo do `Snapshot`:

```ts
const SERVER_SNAPSHOT = { status: 'loading', sessionId: null, runs: [], pending: null, isBusy: false, error: null, sessionState: null } as const
```

3. No `useMemo` de retorno de `useAgnoStore` (final da função):

```ts
return useMemo(() => ({
  ...snapshot,
  send: store.send, continue: store.continue, resolveTool: store.resolveTool, runTools: store.runTools,
  resume: store.resume, cancel: store.cancel, mergeSessionState: store.mergeSessionState, store,
}), [snapshot, store])
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd packages/agno-hooks && bun test --preload ./test/dom.ts test/react`
Expected: PASS

Run a suíte completa do pacote (script `test` do `package.json`):
Run: `cd packages/agno-hooks && bun run test`
Expected: PASS

Run o typecheck de todo o pacote:
Run: `cd packages/agno-hooks && bun run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/agno-hooks/src/react/hooks.ts packages/agno-hooks/test/react/hooks.test.tsx
git commit -m "$(cat <<'EOF'
feat(agno-hooks): sessionState + mergeSessionState on useAgnoAgent/Team/Workflow

Wires the store-level session_state read/write (added in the two prior
commits) through the generic React hook — all three hooks gain it for
free via the existing snapshot spread.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Cobertura do spec:**
- §3 (superfície pública) → Task 3 Step 3 (assinatura de `mergeSessionState`) + Task 4 (exposição via hook).
- §4 (leitura: hydrate + eventos terminais, limitação de workflow row) → Task 2. A limitação do `WorkflowRunSchema` sem `session_state` é uma lacuna do backend (não há `settleFromRow` pra `session_state` em nenhum dos três casos, por design do spec) — nada a implementar além do já coberto; documentada no spec, não requer código.
- §5 (deep merge + invariante do cache completo) → Task 1 (algoritmo) + Task 3 (uso). O invariante ("`sessionState` do snapshot é sempre o objeto completo") já é garantido pela Task 2 (nunca filtramos o que vem do backend).
- §6 (lock via `isBusy`) → Task 3, teste "lança se isBusy".
- §7 (sessão inexistente) → Task 3, teste "lança se não há sessão ainda".
- §8 (optimistic, serialização, resync em falha) → Task 3, testes de merge local síncrono, concorrência e falha de PATCH.
- §9 (fora de escopo) → nenhuma task implementa replace/delete, `statePath`, ou edição pré-sessão — confirmado, nada no plano extrapola isso.
- §10 (testes) → todos os 8 casos da lista do spec têm teste correspondente nas Tasks 2 e 3.

**Placeholder scan:** nenhum "TBD"/"depois"/"similar à Task N" — cada step tem código completo.

**Consistência de tipos:** `mergeSessionState(patch: Record<string, unknown> | ((current: Record<string, unknown>) => Record<string, unknown>)): Promise<void>` é idêntico em `AgnoStore<K>` (Task 3), na implementação (Task 3) e em `AgnoHook<K>` (Task 4). `sessionState: Record<string, unknown> | null` idêntico em `Snapshot<K>` (Task 2), na variável de closure (Task 2/3) e no `SERVER_SNAPSHOT` (Task 4, como `null`).

---

Plano salvo em `docs/superpowers/plans/2026-09-09-manual-session-state.md`.
