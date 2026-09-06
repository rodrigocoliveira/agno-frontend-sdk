# `@rodrigocoliveira/agno-api` — design

Data: 2026-09-06. Status: aprovado em brainstorm, aguardando plano de implementação.
Contexto e decisões anteriores: [issue #1](https://github.com/rodrigocoliveira/agno-frontend-sdk/issues/1).
Fonte da verdade da API: `docs/agentos-v3-api-map.md` e `docs/agentos-v3-openapi.json` (branch `chore/api-map`, AgentOS `agno==3.0.6`).

## 1. Objetivo

Cliente TypeScript, sem estado, que cobre **as 125 operações** do AgentOS v3 com todos os parâmetros, tipado a partir do `openapi.json`. Roda em browser e Node (só depende de `fetch`, `FormData`, `ReadableStream`). É o alicerce do `@rodrigocoliveira/agno-chat` (spec 2, separado).

### Fora de escopo (de propósito)

- Estado, cache, store de mensagens, hooks React: são do `agno-chat`.
- Retry além do refresh de token no 401.
- Componentes de UI.
- Compatibilidade com Agno v2.

## 2. Superfície pública

```ts
import { createAgnoApi, AgnoApiError } from '@rodrigocoliveira/agno-api'

const api = createAgnoApi({
  baseUrl: 'http://localhost:7777',
  token?: string | (() => string | undefined | Promise<string | undefined>),
  onTokenExpired?: () => void | string | Promise<void | string>,
  params?: Record<string, string | number | boolean>,   // ex.: { db_id, table, user_id }
  headers?: Record<string, string>,
  fetch?: typeof fetch,
})
```

- `token` é lido **a cada request** (nunca cacheado pela lib), enviado como `Authorization: Bearer <token>`.
- `params` globais entram em toda rota cuja query aceite aquela chave (conferido pelo manifesto, seção 4). Valor passado na chamada vence o global.
- `headers` fixos entram em toda request; `Content-Type` e `Authorization` são controlados pela lib.

### 2.1 Regra única de assinatura

Toda operação tem a mesma forma:

```
api.<grupo>[.<subrecurso>].<op>(...pathParams, input?, options?)
```

1. **Path params posicionais**, na ordem em que aparecem na URL.
2. **`input`**: um único objeto plano com query e body misturados. A lib separa em runtime usando o manifesto. O tipo é `Query & Body` do OpenAPI. Rotas sem query nem body não têm esse argumento.
3. **`options`**: `{ signal?: AbortSignal, headers?: Record<string,string>, idempotencyKey?: string }`.

Rotas sem query e sem body não têm o argumento `input`: `api.agents.get(id, options?)`. Rotas com `input` opcional recebem `options` na terceira posição: `api.sessions.list(undefined, { signal })`.

```ts
api.agents.list()
api.agents.get(agentId)
api.sessions.list({ user_id, type: 'agent', limit: 20 })
api.sessions.rename(sessionId, { name: 'Novo nome', user_id })
api.agents.runs.cancel(agentId, runId)
api.knowledge.content.upload({ file, name, reader_id }, { signal })
```

Garantia de build: o gerador falha se alguma rota tiver a mesma chave em query e em body. No spec atual nenhuma tem.

### 2.2 Serialização do `input`

| Content type da rota | Como o body vai |
|---|---|
| `application/json` (todas as demais que têm body) | `JSON.stringify` |
| `multipart/form-data` (`agents.runs.create`, `teams.runs.create`, `knowledge.content.upload`) | `FormData`. `File`/`Blob` entram direto; array de `File`/`Blob` vira campo repetido; outros arrays e objetos viram JSON string (o servidor espera `tools`, `requirements`, `factory_input`, `files_metadata`, `metadata` como JSON string) |
| `application/x-www-form-urlencoded` (`continue`, `resume` de agents/teams, todas de workflows `runs`, `knowledge.remoteContent`, `knowledge.content.update`) | `URLSearchParams`, objetos e arrays como JSON string |

Query: `undefined` é omitido, arrays viram chave repetida, booleanos viram `true`/`false`.

### 2.3 Respostas

- JSON: devolvido parseado e tipado pela resposta `200`/`201` do OpenAPI.
- `204`/corpo vazio: `undefined`.
- `sessions.media` (`application/octet-stream`): devolve `Blob`. Único caso.
- Onde o OpenAPI marca `any` (as respostas não-stream de `runs.*`), o tipo vem à mão (`RunOutput`, `TeamRunOutput`, `WorkflowRunOutput`).

### 2.4 Escape hatch

```ts
api.request<T>({ method, path, query?, body?, contentType?, signal?, headers? }): Promise<T>
api.stream<E>({ method, path, query?, body?, contentType?, signal?, headers? }): AsyncIterable<E>
```

Mesmo transporte, auth, refresh e erros. Para rotas customizadas do AgentOS do usuário.

## 3. Árvore de operações (125)

Nomes espelham o path. `runs` é sub-recurso com o mesmo conjunto em agents, teams e workflows.

| Grupo | Operações |
|---|---|
| `os` | `health`, `info`, `config` |
| `agents` | `list`, `get`, `forkSession(agentId, sessionId, input)`, `runs.create`, `runs.list`, `runs.get`, `runs.cancel`, `runs.continue`, `runs.resume`, `runs.checkpoints(agentId, runId)`, `runs.checkpoint(agentId, runId, messageIndex)` |
| `teams` | idem `agents` (11) |
| `workflows` | `list`, `get`, `runs.create`, `runs.list`, `runs.get`, `runs.cancel`, `runs.continue`, `runs.resume` |
| `sessions` | `list`, `create`, `deleteMany`, `get`, `delete`, `update`, `rename`, `runs(sessionId, input)`, `run(sessionId, runId, input)`, `media(sessionId, storageKey)` |
| `memories` | `list`, `create`, `deleteMany`, `get`, `update`, `delete`, `topics`, `userStats`, `optimize` |
| `learnings` | `list`, `create`, `get`, `update`, `delete`, `users`, `deleteUser(userId)` |
| `knowledge` | `content.upload`, `content.list`, `content.deleteMany`, `content.get`, `content.update`, `content.delete`, `content.refresh`, `content.status`, `remoteContent.create`, `search`, `config`, `sources(knowledgeId)`, `sourceFiles(knowledgeId, sourceId)` |
| `components` | `list`, `create`, `get`, `update`, `delete`, `restore`, `configs.list`, `configs.create`, `configs.get`, `configs.update`, `configs.delete`, `configs.current`, `configs.setCurrent` |
| `schedules` | `list`, `create`, `get`, `update`, `delete`, `enable`, `disable`, `trigger`, `runs.list`, `runs.get` |
| `approvals` | `list`, `count`, `get`, `status`, `delete`, `resolve` |
| `queue` | `get`, `put`, `post`, `patch`, `delete` (marcadas **Disabled** no spec capturado; tipos `unknown`, não exercitadas) |
| `serviceAccounts` | `list`, `create`, `delete` |
| `registry` | `get` |
| `evals` | `list`, `create`, `get`, `update`, `deleteMany` |
| `metrics` | `get`, `refresh`, `refreshStatus` |
| `traces` | `list`, `get`, `search`, `filterSchema`, `sessionStats` |
| `databases` | `migrateAll`, `migrate(dbId)` |

Um teste de contrato (seção 9) garante que essa tabela e o OpenAPI batem: toda operação do spec tem função, toda função aponta pra uma operação.

## 4. Como as rotas são construídas

Um helper genérico `route()` e a árvore de one-liners. Nenhuma rota JSON tem código próprio.

```ts
// packages/agno-api/src/routes/agents.ts
export const agents = (t: Transport) => ({
  list: route(t, 'get', '/agents'),
  get:  route(t, 'get', '/agents/{agent_id}'),
  forkSession: route(t, 'post', '/agents/{agent_id}/sessions/{session_id}/fork'),
  runs: {
    create:   streamRoute(t, 'post', '/agents/{agent_id}/runs'),
    continue: streamRoute(t, 'post', '/agents/{agent_id}/runs/{run_id}/continue'),
    resume:   streamRoute(t, 'post', '/agents/{agent_id}/runs/{run_id}/resume'),
    cancel:   route(t, 'post', '/agents/{agent_id}/runs/{run_id}/cancel'),
    get:      route(t, 'get',  '/agents/{agent_id}/runs/{run_id}'),
    list:     route(t, 'get',  '/agents/{agent_id}/runs'),
    checkpoints: route(t, 'get', '/agents/{agent_id}/runs/{run_id}/checkpoints'),
    checkpoint:  route(t, 'get', '/agents/{agent_id}/runs/{run_id}/checkpoints/{message_index}'),
  },
})
```

`route(t, method, path)` devolve uma função cujo tipo é derivado de `paths[path][method]` do `generated/openapi.d.ts`:

- path params → argumentos posicionais (na ordem do path, extraídos por tipo template literal)
- `parameters.query & requestBody.content[*]` → `input`
- `responses[200|201].content['application/json']` → retorno

Em runtime, `route()` consulta `generated/routes.gen.ts`, que o gerador extrai do OpenAPI:

```ts
export const routes = {
  'get /agents/{agent_id}': { query: [], contentType: null },
  'post /sessions': { query: ['type', 'db_id'], contentType: 'application/json' },
  'post /agents/{agent_id}/runs': { query: [], contentType: 'multipart/form-data' },
  // ...125
} as const
```

É assim que a lib sabe separar query de body no `input`, qual serialização usar, e onde os `params` globais se aplicam.

### 4.1 Geração

`bun run generate` (script `scripts/generate.ts`):

1. `openapi-typescript openapi/agentos-v3.json` → `src/generated/openapi.d.ts`
2. Percorre `paths` e escreve `src/generated/routes.gen.ts` (manifesto acima)
3. Falha se alguma rota tiver chave repetida entre query e body

O `openapi.json` fica versionado em `packages/agno-api/openapi/`. Atualizar o Agno = trocar o arquivo, rodar `generate`, corrigir o que o `tsc` apontar.

## 5. Streaming

As 9 rotas `runs.create`, `runs.continue`, `runs.resume` (× agents, teams, workflows) usam `streamRoute()`, com código próprio: serializam form/multipart e leem `text/event-stream`.

```ts
// stream default = true (igual ao servidor)
for await (const ev of api.agents.runs.create(agentId, { message: 'oi', session_id })) {
  switch (ev.event) {
    case 'RunContent': append(ev.content); break
    case 'RunPaused':  askUser(ev.tools, ev.requirements); break
    case 'RunError':   showError(ev.error); break
  }
}

// stream: false → Promise<RunOutput>
const run = await api.agents.runs.create(agentId, { message: 'oi', stream: false })
```

Overload por literal: `input.stream === false` → `Promise<RunOutput>`; qualquer outro caso → `AsyncIterable<AgentStreamEvent>` (ou `TeamStreamEvent`, `WorkflowStreamEvent`), união dos eventos de run com os meta-eventos `catch_up`, `replay`, `subscribed`, `error` do `/resume`. O `resume` não tem campo `stream` no body e sempre devolve o iterável.

Regras do iterável:

- **Erro pré-stream** (status não-2xx antes do primeiro byte): lança `AgnoApiError` no primeiro `await`. Passa pelo refresh de token normalmente.
- **Erro mid-stream**: entregue como evento (`RunError`, `TeamRunError`, `WorkflowError`, ou `{ event: 'error', error }` do `/resume`). O iterável termina sem lançar.
- **Conexão cai no meio**: lança `AgnoApiError { status: 0 }` de dentro do iterável.
- **Abort** via `options.signal`: cancela o fetch e encerra o iterável; o `AbortError` nativo se propaga.
- `background: true` não muda o transporte. `options.idempotencyKey` vira header `Idempotency-Key`.

Parser SSE: portado de `agno-client/packages/core/src/parsers/sse-parser.ts`. Parseia só `data:` (pode ser multi-linha, concatenada com `\n`), ignora `event:` (é redundante com o campo `event` do JSON), tolera `: keep-alive` e linhas vazias, e não perde um evento cortado no meio de um chunk.

## 6. Tipos escritos à mão

Em `src/types/`, com base na seção "Contrato de wire" do `api-map.md`:

- `events.ts`: `AgentRunEvent` (35 variantes), `TeamRunEvent` (40), `WorkflowRunEvent` (31), `ResumeMetaEvent` (4), todas discriminadas por `event`. Campos comuns: `run_id`, `session_id`, `created_at`, `event_index`, e o id do dono (`agent_id`/`team_id`/`workflow_id`). Campos específicos por evento (`content`, `tool`, `tools`, `requirements`, `reasoning_content`, `error`, etc.).
- `run.ts`: `RunOutput`, `TeamRunOutput`, `WorkflowRunOutput`, `RunStatus`.
- `hitl.ts`: `ToolExecution`, `RunRequirement`, `UserInputField`, `UserFeedbackQuestion`. Quando o OpenAPI tem o schema, o tipo à mão é um alias do gerado, para não divergir.

Tudo exportado do índice do pacote. O `agno-chat` importa daqui; não existe pacote `agno-types`.

## 7. Auth

1. Toda request lê `token` (string ou função) e envia `Authorization: Bearer`.
2. Resposta `401`:
   - sem `onTokenExpired` → lança `AgnoApiError`.
   - com `onTokenExpired` → chama uma vez; se devolver string, usa como token; se devolver `void`, chama `token()` de novo. Repete a request **uma vez**. Segundo `401` → lança.
3. **Deduplicação**: requests concorrentes que tomam `401` compartilham a mesma promise de refresh. `onTokenExpired` roda uma vez por expiração, não uma por request.
4. Streams: o `401` é pré-stream, então passa pelo mesmo fluxo. Um stream já aberto não é interrompido por expiração.
5. Request repetida após refresh é remontada do zero (body multipart é reconstruído a partir do `input` original, não do `FormData` já consumido).

## 8. Erros

Uma classe:

```ts
export class AgnoApiError extends Error {
  readonly status: number                      // 0 = falha de rede/CORS
  readonly detail: string | ValidationErrorDetail[] | unknown
  readonly errorId?: string                    // `error_id` do AgentOS, quando presente
  readonly errorType?: string                  // `error_type`
  readonly validation?: ValidationErrorDetail[] // atalho: só no 422 em lista
  readonly method: string
  readonly path: string
  readonly headers: Headers                    // ex.: Retry-After no 429
  readonly body: unknown                       // corpo bruto (parseado se JSON)
}
export interface ValidationErrorDetail { loc: (string | number)[]; msg: string; type: string }
export function isAgnoApiError(e: unknown): e is AgnoApiError
```

`message`: `detail` quando string; no 422 em lista, `"<loc>: <msg>"` do primeiro item; senão `"<method> <path> failed with <status>"`.

Códigos com significado de UX, documentados no README: `401` expirado, `403` `user_id` não é dono da sessão, `404`, `409` conflito (guard de componentes, idempotência, run em andamento), `422` validação, `429` fila cheia (`Retry-After`), `503` serviço desligado (rotas condicionais ao DB).

Abort **não** vira `AgnoApiError`: o `AbortError` nativo se propaga para o chamador distinguir cancelamento de falha.

## 9. Testes

Sem servidor real nas duas primeiras camadas.

**Unit do transporte** (`fetch` mockado, `bun test`):
- URL e método certos para uma amostra de cada padrão de path (0, 1, 2 e 3 params).
- `input` separado em query vs body conforme manifesto; `params` globais aplicados só onde a rota aceita; valor da chamada vence o global.
- JSON, multipart e form-urlencoded serializados como na seção 2.2 (inclusive objetos como JSON string e `File` intacto).
- `401` → `onTokenExpired` → retry uma vez; segundo `401` lança; dedupe com N requests concorrentes; string devolvida usada como token; `void` relê `token()`.
- Erros: `AgnoApiError` com `status`, `detail`, `errorId`, `validation`, `headers`; rede → `status: 0`; abort → `AbortError`.
- Streaming: erro pré-stream lança; `RunError` mid-stream vira evento; evento cortado entre chunks é remontado; `data:` multi-linha; abort encerra; `stream: false` devolve JSON.

**Contrato gerado**: percorre `routes.gen.ts` e a árvore `api.*` nos dois sentidos. Falha se sobrar ou faltar operação. É o teste que impede cobertura parcial de voltar.

**E2E** (`bun test:e2e`, exige `AGNO_URL`, roda local, fora do CI): contra AgentOS v3 com `SqliteDb`. Cobre: run stream e não-stream, HITL de agent (`RunPaused` → `continue` com `tools`) e de team (`requirements`), `resume` com `catch_up`/`replay`, `cancel`, `sessions` CRUD + `runs`, `memories` CRUD, `components` CRUD. Rotas condicionais ao DB (`schedules`, `approvals`, `service-accounts`) onde o `SqliteDb` permitir. `queue` fica de fora.

**Portados do `agno-client`** (referência em `reference/agno-client`, gitignored): `sse-parser.ts`, `http-error.ts` (absorvido em `errors.ts`), testes de HITL/continue/token-refresh adaptados à nova assinatura. `pending-tools.ts` e `build-continue-payload.ts` vão pro `agno-chat` (spec 2), mas seus testes ficam registrados como pendentes lá.

## 10. Estrutura do repositório

```
agno-frontend-sdk/
  package.json                Bun workspaces
  packages/
    agno-api/
      package.json            @rodrigocoliveira/agno-api
      openapi/agentos-v3.json
      scripts/generate.ts
      src/
        index.ts
        client.ts             createAgnoApi, árvore de grupos, request()/stream() custom
        transport.ts          fetch, auth + refresh no 401, parse de resposta
        serialize.ts          buildPath, buildQuery, splitInput, encodeBody
        route.ts              route(), streamRoute(), streamOnlyRoute() e os type helpers
        sse.ts
        errors.ts
        routes/               agents.ts, teams.ts, workflows.ts, sessions.ts, ...
        types/                events.ts, run.ts, hitl.ts
        generated/            openapi.d.ts, routes.gen.ts (não editar)
      test/                   unit + contract; e2e/ separado
    agno-chat/                spec 2, criado depois
  examples/
    react/                    Vite + React, bancada contra AgentOS local
  docs/
    agentos-v3-api-map.md     (vem da branch chore/api-map)
    agentos-v3-openapi.json
    superpowers/specs/
```

Ferramentas: Bun (workspaces, runner, `bun test`), `tsup` (ESM + CJS + `.d.ts`), TypeScript strict, Changesets, GitHub Actions com `typecheck`, `test`, `build` obrigatórios no ruleset da `main`. Publicação via npm trusted publishing.

## 11. Critérios de pronto do 1.0 do `agno-api`

- 125 operações na árvore, teste de contrato verde.
- Tipos gerados sem `any` fora das rotas `Disabled`.
- Todos os testes unit e de contrato verdes no CI.
- E2E verde localmente para agents, teams, workflows, sessions, memories, components.
- README com instalação, `createAgnoApi`, um exemplo de stream, um de HITL, e a tabela de erros.
- `examples/react` **não** é critério deste pacote; entra com o `agno-chat`.
