# Edição manual de `session_state` — design

Data: 2026-09-09. Status: aprovado em brainstorm, aguardando plano de implementação.
Depende de: `docs/superpowers/specs/2026-09-06-agno-hooks-design.md` (a `AgnoStore<K>` genérica já existe).
Fonte da verdade do servidor: `docs/agentos-v3-openapi.json`.

## 1. Objetivo

Deixar o app consumidor do `@rodrigocoliveira/agno-hooks` ler e editar `session_state` manualmente — sem depender do agente pra mudar o estado. Caso motivador: uma lista de compras renderizada a partir de `session_state`, com botões +/- de quantidade que o usuário aciona direto, sem chamar o agente.

No v2 (`agno-client`) essa feature existia (`setSessionState`/`mergeSessionState`), mas tinha uma lacuna conhecida e documentada: nenhum lock real contra edição durante uma run ativa — a proteção era só uma recomendação de doc (`disabled={isStreaming}` no app consumidor). Este design corrige isso: o lock é imposto pelo store, não pela documentação.

## 2. Onde vive

Tudo entra na `AgnoStore<K>` genérica (`packages/agno-hooks/src/store/store.ts`). `session_state` é propriedade da **sessão**, não da run — o backend já trata isso de forma unificada pra agent/team/workflow (uma única tabela de sessões, com `session_type` + `agent_id`/`team_id`/`workflow_id`; `PATCH /sessions/{id}` é a mesma rota pros três). Não há necessidade de lógica por `kind`: `useAgnoAgent`, `useAgnoTeam` e `useAgnoWorkflow` ganham a feature automaticamente, do mesmo jeito que já ganham `isBusy` hoje.

Nenhuma mudança em `@rodrigocoliveira/agno-api`: `sessions.get` e `sessions.update` (`PATCH /sessions/{session_id}`) já existem e já são genéricos (`packages/agno-api/src/routes/sessions.ts:7,9`).

## 3. Superfície pública

`Snapshot<K>` ganha um campo:

```ts
interface Snapshot<K extends Kind> {
  // ...campos existentes (status, sessionId, runs, pending, isBusy, error)
  sessionState: Record<string, unknown> | null
}
```

`AgnoStore<K>` (e por extensão `AgnoHook<K>`, via o spread já existente em `react/hooks.ts`) ganha uma ação:

```ts
mergeSessionState(
  patch: Record<string, unknown> | ((current: Record<string, unknown>) => Record<string, unknown>)
): Promise<void>
```

Uso típico (botão +1 na lista de compras):

```tsx
const { sessionState, mergeSessionState, isBusy } = useAgnoAgent({ agentId })

<button
  disabled={isBusy}
  onClick={() => mergeSessionState(current => ({
    items: current.items.map(i => i.id === id ? { ...i, qty: i.qty + 1 } : i),
  }))}
>+</button>
```

## 4. Leitura — de onde `sessionState` vem

Duas fontes, ambas já mapeadas na exploração do código:

1. **`hydrate()`** (`store.ts:209`): em paralelo ao `GET /sessions/{id}/runs` que já existe, buscar `api.sessions.get(sessionId)` e popular `sessionState` a partir de `session.session_state`. Só roda se `sessionId` já existir — sessão nova (`sessionId == null`) começa com `sessionState: null` (ver seção 7).
2. **Eventos terminais de run** — `RunCompleted`, `TeamRunCompleted`, `WorkflowCompleted` já carregam `session_state` no payload (`packages/agno-api/src/types/events.ts:43`, campo de `CompletedFields`), mas hoje é ignorado por `applyBaseEvent`/`fromBaseRow` (`packages/agno-hooks/src/run/base.ts`). Quando um desses eventos chega com `session_state` não nulo, o store atualiza `sessionState` — é assim que uma mudança feita pelo **próprio agente** durante uma run aparece no snapshot sem round-trip extra.

**Limitação conhecida, aceita para v1:** `WorkflowRunSchema` (a "row" devolvida por `GET .../runs/{id}`, usada no fallback `settleFromRow` quando um stream em background fecha antes do evento terminal chegar — `store.ts:122`) **não tem** campo `session_state` no schema do backend, diferente de `RunSchema`/`TeamRunSchema` que têm. Ou seja: pra workflow, se o `WorkflowCompleted` nunca chegar via stream (o mesmo cenário de fechamento antecipado já documentado em `settleFromRow`), o `sessionState` local fica desatualizado até o próximo `hydrate()` (reload da página/remontagem do hook) ou a próxima run que complete com sucesso. Não é regressão em relação ao v2 (que simplesmente não suportava `session_state` em workflow nenhum); é uma lacuna estreita, documentada, não bloqueante pro v1.

## 5. Escrita — merge

**Deep merge**, replicando o algoritmo já validado no v2 (`agno-client/packages/core/src/utils/deep-merge.ts`): objetos planos recursam em qualquer profundidade; arrays e primitivos substituem; `null` seta a chave (não apaga). Chaves-irmãs não mencionadas no patch sobrevivem sempre.

```ts
// current: { cart: { items: [...], delivery: {...}, _audit: {...} } }
await mergeSessionState({ cart: { items: novosItems } })
// resultado: só cart.items muda; cart.delivery e cart._audit sobrevivem intactos
```

A função aceita um patch direto ou uma **updater function** (`current => patch`), útil quando o novo valor depende do atual — típico em arrays (que deep merge não mescla elemento a elemento; a lista de compras inteira precisa ser recomputada e passada como novo array).

**Invariante que sustenta a segurança do merge:** o `sessionState` do snapshot é sempre o objeto **completo e cru** que veio do backend (seção 4), nunca uma view filtrada pela UI. "Esconder" uma chave (ex.: não renderizar um campo interno) é decisão de UI, não do cache do SDK — o merge sempre parte do estado completo, então nunca há perda de chave por causa do que a tela decide mostrar. (Se o backend expõe algo genuinamente sensível em `session_state`, a correção é não escrever isso lá — ex. via um middleware de scrubbing na resposta HTTP, camada ortogonal a este SDK, fora de escopo aqui.)

## 6. Lock durante run ativa

`isBusy` (`store.ts:78-82`, já calculado a partir de `runs.some(...)`) é o gate: **se `isBusy === true`, `mergeSessionState` lança `Error('A run is already active')`** — mesma mensagem/padrão que `send()` já usa hoje (`store.ts:256`). O app consumidor deve desabilitar o controle de edição usando `isBusy`, como no exemplo da seção 3.

Diferente do v2 (onde isso era só recomendação de doc, nunca imposto — `agno-client/docs/guides/12_state_and_events.md:136-156` admite isso como limitação conhecida), aqui o bloqueio é uma garantia do store: mesmo um app que esquece de checar `isBusy` na UI não consegue corromper o estado por uma escrita concorrente com o fim de uma run.

## 7. Sessão inexistente

Se `sessionId === null` (nenhuma run foi enviada ainda), `mergeSessionState` lança erro explicando que a sessão ainda não existe. Sem suporte a edição pré-sessão / buffer local no v1 — decisão explícita pra não complexificar; se aparecer necessidade real (montar o carrinho antes da primeira mensagem), é uma extensão futura e não bloqueia o design atual.

## 8. Optimistic update, serialização de escrita e falha

- **Optimistic:** o merge é computado e aplicado no `sessionState` local **sincronamente**, antes de qualquer chamada de rede — resposta instantânea do botão +/-.
- **Serialização:** chamadas de `mergeSessionState` disparadas em sequência (mesmo sem `await` entre elas) mesclam localmente em ordem (JS é single-threaded, então isso já é seguro por construção) e enfileiram o PATCH correspondente numa fila interna por instância de store — nunca dois `PATCH /sessions/{id}` em voo ao mesmo tempo pro mesmo store. Cada PATCH manda o `session_state` **completo já mesclado** no momento em que foi enfileirado, nunca um delta. Isso evita a race de "lost update" que o v2 tem documentada e nunca corrigida (`agno-client/packages/core/src/client.ts:256-274`: chamadas concorrentes não-`await`adas perdem dado).
- **Falha:** se um PATCH da fila falhar, o store rebusca `api.sessions.get(sessionId)` pra resincronizar `sessionState` com a verdade do servidor (em vez de tentar desfazer um patch específico no meio de uma fila — mais simples e mais correto quando já pode haver edições depois dele), e a `Promise` daquela chamada específica rejeita, pro caller tratar (mostrar toast de erro, etc.). Chamadas seguintes na fila continuam normalmente.

## 9. Fora de escopo do v1

- Um primitivo de **replace** (substituir/apagar um branch inteiro, o `setSessionState` do v2) — deep merge não consegue expressar "apagar uma chave", só sobrescrever valores. Nenhum caso de uso discutido precisa disso (adicionar/remover item da lista de compras já funciona via array substituído inteiro, que o deep merge já cobre). Fica pra depois se aparecer necessidade real.
- Edição antes da primeira run (`sessionId` null) — seção 7.
- Escopo/namespace de chaves (`statePath` ou equivalente) — avaliado e descartado: o problema real (não confundir dado interno com dado editável) já é resolvido por deep merge (não corrompe) + filtro de renderização no app consumidor (não expõe); um escopo estrutural no SDK resolveria pouco a mais por um custo de API maior.
- Filtragem de campos sensíveis na resposta HTTP — é problema de infraestrutura de backend (ex.: um middleware de scrubbing), não deste SDK; nada aqui depende disso nem é afetado por isso.
- Mudanças em `@rodrigocoliveira/agno-api` — nenhuma necessária.

## 10. Testes

Na suíte de store já existente (`packages/agno-hooks`, mock de transport), cobrir:

- `hydrate()` popula `sessionState` a partir de `sessions.get` quando `sessionId` é passado; fica `null` quando não é.
- Evento terminal (`RunCompleted`/`TeamRunCompleted`/`WorkflowCompleted`) com `session_state` atualiza o snapshot.
- `mergeSessionState` com objeto: merge profundo correto (chave aninhada muda, irmãs sobrevivem, array é substituído por inteiro).
- `mergeSessionState` com updater function: recebe o `current` certo.
- `mergeSessionState` enquanto `isBusy === true`: lança, não muda `sessionState`, não chama a API.
- `mergeSessionState` sem `sessionId`: lança, não chama a API.
- Duas chamadas de `mergeSessionState` disparadas sem `await` entre elas: ambos os merges locais aplicam em ordem; os dois PATCH saem serializados (não paralelos), cada um com o estado completo daquele momento.
- PATCH falha: `sessionState` resincroniza via `sessions.get`; a promise da chamada que falhou rejeita; chamada seguinte na fila não é afetada.
