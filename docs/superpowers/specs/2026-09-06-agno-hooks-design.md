# `@rodrigocoliveira/agno-hooks` — design

Data: 2026-09-06. Status: aprovado em brainstorm, aguardando plano de implementação.
Spec 1 (pré-requisito, pronta): `docs/superpowers/specs/2026-09-06-agno-api-design.md`.
Fonte da verdade do servidor: `docs/agentos-v3-openapi.json` e o fonte de `agno==3.0.6` instalado em `examples/agentos/.venv` (citado ao longo do texto). Comportamentos marcados **(capturado)** foram observados ao vivo contra `examples/agentos`.

## 1. Objetivo

Estado de sessão para React em cima do `@rodrigocoliveira/agno-api`: abrir uma sessão de agent, team ou workflow, carregar o histórico, mandar mensagens com stream, sobreviver a reload no meio de um run, tratar HITL (confirmação, input do usuário, `ask_user`, aprovação de admin) e executar tools no navegador. Um store sem React por baixo, três hooks finos por cima.

Princípio que governa tudo: **a unidade de estado é o run, não a mensagem**. O servidor guarda runs (`GET /sessions/{id}/runs` devolve `RunSchema | TeamRunSchema | WorkflowRunSchema`), o stream é "eventos de um run", HITL pausa um run. Histórico e stream produzem o mesmo tipo `Run` por duas funções puras: `fromRunSchema` e `applyEvent`.

Segundo princípio: **vocabulário do Agno, não nosso**. Tools são `ToolExecution`; pendências de team são `RunRequirement`; pendências de workflow são `StepRequirement`. O pacote não inventa tipos por cima; só embrulha e desembrulha onde o wire exige.

### Nome

`agno-react` **não** pode ser usado: já existe no npm (2.3.0, pacote React do `agno-client` antigo). O pacote se chama `@rodrigocoliveira/agno-hooks`. Começa em 0.1.0; 1.0.0 junto com o `agno-api`.

### Fora de escopo do 1.0 (issues abertas)

- Lista de sessões / sidebar (`useAgnoSessions`): [#4](https://github.com/rodrigocoliveira/agno-frontend-sdk/issues/4). No 1.0 o app usa `useAgnoApi()` + `api.sessions.list`.
- Hook de approvals: [#5](https://github.com/rodrigocoliveira/agno-frontend-sdk/issues/5). No 1.0 o store só expõe `approval_id`, trata o 403 e aceita `continue([])`.
- Fila de `send`: [#6](https://github.com/rodrigocoliveira/agno-frontend-sdk/issues/6). No 1.0, um run ativo por store.
- Açúcar pra fork / regenerate: [#7](https://github.com/rodrigocoliveira/agno-frontend-sdk/issues/7). No 1.0 passam pelo `extra` do `continue`.
- Componentes de UI. Compatibilidade com Agno v2. Vue/Svelte (o store não importa React; extrair um `agno-core` é trabalho futuro se alguém pedir).

## 2. Superfície pública

```tsx
import { AgnoProvider, useAgnoApi, useAgnoAgent, useAgnoTeam, useAgnoWorkflow,
         createAgnoStore, isToolPending, pendingTools,
         confirm, reject, provideUserInput, provideUserFeedback, setExternalResult } from '@rodrigocoliveira/agno-hooks'
```

### 2.1 Provider

```tsx
<AgnoProvider
  baseUrl="https://agentos.exemplo.com"
  token={() => page.props.agnoToken}
  onTokenExpired={() => router.reload({ only: ['agnoToken'] })}
  params={{ db_id: 'main' }}                 // opcional; user_id normalmente vem do JWT
>
  <App />
</AgnoProvider>
```

- As props são exatamente `AgnoApiConfig` do `agno-api`. O Provider chama `createAgnoApi` **uma vez** e guarda a instância; `token` é função lida a cada request, então rotação de token não recria nada. Recria só se `baseUrl`, `params`, `headers` ou `fetch` mudarem (comparação rasa).
- Alternativa: `<AgnoProvider api={api}>` recebe uma instância pronta (app que já tem uma fora do React, ou teste com `fetch` mockado). Se as duas formas forem passadas, `api` ganha.
- `useAgnoApi()` devolve a instância pra chamadas diretas (sidebar, approvals, knowledge...).
- Um Provider = uma conexão. Vários hooks, com alvos diferentes, convivem no mesmo Provider. Vários Providers convivem no mesmo app.

### 2.2 Hooks

```ts
useAgnoAgent({ agentId, sessionId?, background?, frontendTools? })
useAgnoTeam({ teamId, sessionId?, background?, frontendTools? })
useAgnoWorkflow({ workflowId, sessionId?, background? })
```

Retorno, mesmo formato nos três, tipado pelo alvo:

```ts
interface AgnoHook<R extends Run, P> {
  status: 'loading' | 'ready' | 'error'
  sessionId: string | null
  runs: R[]                     // do mais antigo pro mais novo
  pending: P | null             // agent/team: { runId, tools: ToolExecution[] }; workflow: { runId, stepRequirements: StepRequirement[] }
  isBusy: boolean               // existe run local em 'running', ou qualquer run em 'paused' (send bloqueado)
  error: Error | null           // erro do hydrate; erros de run ficam em run.error
  send(input: string | SendInput<K>): Promise<void>
  continue(decisions: ToolExecution[] | StepRequirement[], extra?: ContinueExtra<K>): Promise<void>
  resolveTool(toolCallId: string, result: unknown): void
  runTools(runId?: string): Promise<void>
  resume(runId: string): Promise<void>
  cancel(runId?: string): Promise<void>
  store: AgnoStore<K>           // escape hatch
}
```

- `send` aceita string (açúcar pra `{ message }`) ou o input inteiro da rota de create, menos o que é do store: `SendInput<'agent'> = Omit<AgentRunInput, 'stream' | 'background' | 'session_id'>` (idem team com `TeamRunInput`, workflow com `WorkflowRunInput`). `files`, `files_metadata`, `factory_input`, `user_id`, `monitor` passam direto.
- `continue` recebe as decisões no vocabulário do Agno (seção 6) e `extra` = `Omit<AgentContinueInput, 'tools' | 'stream' | 'background' | 'session_id'>` (`input`, `continue_from`, `fork`, `regenerate`, `replace_original`, `additional_instructions`); team e workflow análogos.
- As funções são estáveis (mesma referência enquanto o store é o mesmo).

### 2.3 Store (sem React)

```ts
const store = createAgnoStore({
  api,                                          // AgnoApi
  target: { kind: 'agent', id } | { kind: 'team', id } | { kind: 'workflow', id },
  sessionId?: string,
  background?: boolean,                         // default true
  frontendTools?: Record<string, FrontendTool>, // agent e team
})

store.getSnapshot(): Snapshot<K>   // { status, sessionId, runs, pending, isBusy, error }; nova referência só quando algo muda
store.subscribe(listener): () => void
store.send / continue / resolveTool / runTools / resume / cancel   // iguais aos do hook
store.setFrontendTools(map)        // usado pelo hook pra manter a versão mais recente
store.destroy()                    // aborta streams abertos, solta listeners; NÃO cancela runs no servidor
```

`type FrontendTool = (args: Record<string, unknown>, ctx: { run: Run; tool: ToolExecution; signal: AbortSignal }) => unknown | Promise<unknown>`.

## 3. Modelo de `Run`

```ts
type RunState = 'running' | 'paused' | 'completed' | 'error' | 'cancelled'

interface RunBase {
  id: string                    // run_id; antes do RunStarted, id local 'local-<n>'
  sessionId: string | null
  status: RunState
  local: boolean                // criado por este store nesta sessão de página (runs reanexados do hydrate não bloqueiam send)
  input: { message: string; files: File[]; media: unknown | null }   // files só no run local; media = input_media do servidor
  content: string               // resposta; cresce com eventos de conteúdo, substituída pelo evento final
  reasoning: string
  tools: ToolExecution[]        // tools normais e HITL, na ordem em que apareceram
  requirements: RunRequirement[] | null   // team: pausas propagadas de membros (só existe em run pausado)
  media: { images: unknown[]; videos: unknown[]; audio: unknown[]; files: unknown[] }
  citations: unknown | null
  metrics: unknown | null
  error: string | null
  createdAt: number | null      // epoch segundos, do servidor; Date.now()/1000 no local
  eventIndex: number | null     // último event_index visto (só background/resume)
  raw: unknown | null           // RunSchema do hydrate, ou o evento final do stream, inteiro
}

interface AgentRun extends RunBase { kind: 'agent'; agentId: string }
interface TeamRun extends RunBase { kind: 'team'; teamId: string; members: AgentRun[] }
interface WorkflowRun extends RunBase {
  kind: 'workflow'; workflowId: string
  steps: StepRun[]
  stepRequirements: StepRequirement[] | null
  pauseKind: 'step' | 'executor' | null
}
interface StepRun {
  id: string; name: string; index: number
  status: 'running' | 'completed' | 'paused' | 'error'
  content: string               // conteúdo do executor do passo, cresce no stream; StepCompleted substitui
  tools: ToolExecution[]        // tools do executor do passo
  executorRunId: string | null
  raw: unknown | null           // step_result do servidor
}
type Run = AgentRun | TeamRun | WorkflowRun
```

Regras:

- **Status do servidor → `RunState`**: `PENDING` e `RUNNING` → `running`; `PAUSED` → `paused`; `COMPLETED` e `REGENERATED` → `completed`; `CANCELLED` → `cancelled`; `ERROR` → `error`.
- **Mídia, citações, métricas ficam `unknown`** de propósito: passam como o servidor manda. Estão em campo próprio porque a tela usa; não ganham forma nossa.
- **`messages` não entra no `Run`.** `run.messages` do servidor pode conter cópias de mensagens de runs anteriores marcadas `from_history: true` (quantas `num_history_runs` mandar), a não ser que o agent tenha `store_history_messages=False`. A conversa é a lista de runs; cada run mostra `input.message`, `content` e `tools`. Quem precisar de `messages` lê em `raw`.
- **`chat_history` do `GET /sessions/{id}` nunca é usado**: é `get_messages(skip_roles=["system","tool"])`, esconde tools e respostas de HITL. Serve só pra prévia de sidebar, fora do store.
- **Imutabilidade por run**: cada evento produz um `Run` novo e um `runs` novo; os outros runs mantêm referência. `tools`, `members`, `steps` são substituídos por cópia quando mudam.

## 4. Ciclo de vida de uma sessão

1. **Hydrate.** Com `sessionId`: `status: 'loading'`, chama `api.sessions.runs(sessionId)`. Sem `sessionId`: direto `{ status: 'ready', runs: [] }`, nenhum request.
   - Cada linha passa por `fromRunSchema(kind, row)`.
   - **Team**: a lista traz os runs dos membros como linhas separadas com `parent_run_id` **(capturado)**. Linhas com `parent_run_id` viram `AgentRun` dentro de `members` do run pai (na ordem de `created_at`); não aparecem no topo. Linha sem pai encontrado é descartada com `console.warn`.
   - **Workflow**: a lista traz só o run do workflow; `steps` vem de `step_results` e `step_executor_runs`.
   - Ordena por `created_at` crescente. `status: 'ready'`.
2. **Reattach.** Pra cada run hidratado:
   - `PENDING` ou `RUNNING` no servidor: abre `resume` sem `last_event_index` (o servidor replaya do zero). Um stream por run, em paralelo. Esses runs não são `local`, então não bloqueiam `send`.
   - `PAUSED`: chama `api.<kind>.runs.get(targetId, runId, { session_id })` e refaz o run a partir da resposta, porque `RunSchema` e `TeamRunSchema` **não** serializam `requirements` (`agno/os/schema.py`), e a pausa de um membro de team só existe lá. Nenhuma `frontendTool` roda no hydrate (ver seção 6).
   - Só pra runs vindos do hydrate. Só uma vez.
3. **Live.** `send(input)`:
   - Rejeita com `Error('A run is already active')` se `isBusy` (run local em `running`, ou qualquer run em `paused`).
   - Cria run local `{ id: 'local-n', status: 'running', local: true, input }` e publica (otimista).
   - Chama `api.<kind>.runs.create(targetId, { ...input, session_id, background, stream: true })` e consome (seção 5).
   - No primeiro evento com `run_id` do próprio run (`RunStarted` / `TeamRunStarted` / `WorkflowStarted`) troca o id local pelo `run_id` e, se `sessionId` era `null`, aprende `session_id`.
4. **Queda no meio do live**: seção 5.3.
5. **Troca de sessão** (hook): `sessionId` muda pra id diferente do atual → `destroy()` no store atual (aborta streams, runs continuam no servidor por serem background) e volta ao passo 1 com o novo id. Exceção: seção 7.3.

## 5. Stream e reducers

### 5.1 Loop de consumo

Um loop só, pra `create`, `continue` e `resume`:

```ts
for await (const event of gen) {
  if (isResumeMeta(event)) { handleMeta(event); continue }          // catch_up / replay / subscribed / error
  if (typeof event.event_index === 'number') {
    if (run.eventIndex !== null && event.event_index <= run.eventIndex) continue   // replay duplicado
    run = { ...run, eventIndex: event.event_index }
  }
  run = applyEvent(run, event)      // reducer puro do kind
  commit(run)
}
```

- `ResumeMetaEvent.error` (sem `run_id`) encerra o loop com erro de stream (5.3). Os outros meta são ignorados.
- Cada stream ativo tem um `AbortController`, guardado por `run.id`. `destroy()` aborta todos. `cancel(runId)` chama `api.<kind>.runs.cancel` e espera o `RunCancelled` chegar pelo stream; se em 5 s não chegar, aborta o stream e marca `cancelled` localmente. `cancel()` sem id age no run local ativo.
- Tabela `kind → rotas`: `{ create, continue, resume, cancel, get }` do `agno-api`; é o único lugar do store que sabe que existem três alvos.

### 5.2 Reducers (`applyEvent`)

Puros: `(run, event) => run`. Evento desconhecido devolve o mesmo run. Campos ausentes nunca apagam valor existente (`??`).

**Agent** (`run/agent.ts`):

| evento | efeito |
|---|---|
| `RunStarted` | `id ← run_id`, `sessionId ← session_id`, `status: 'running'` |
| `RunContent` | `content += content` se `content_type` for `str` (ou ausente); `reasoning += reasoning_content` se vier não vazio |
| `ReasoningContentDelta` | `reasoning += reasoning_content` |
| `ReasoningCompleted` / `ReasoningStep` | `reasoning ← reasoning_content` se vier string não vazia |
| `ToolCallStarted` / `ToolCallCompleted` / `ToolCallError` | upsert de `event.tool` em `tools` por `tool_call_id` (substitui o objeto) |
| `RunPaused` | `status: 'paused'`; upsert de cada `event.tools[]`; `requirements ← event.requirements ?? null` |
| `RunContinued` | `status: 'running'` |
| `RunCompleted` | `status: 'completed'`; `content ← content` se string; `tools ← tools` se vier array; `media`, `citations`, `metrics`, `reasoning` se vierem; `requirements: null`; `raw ← evento` |
| `RunError` | `status: 'error'`, `error ← error ?? content ?? 'Run failed'` |
| `RunCancelled` | `status: 'cancelled'`, `error ← reason` |
| demais (`ModelRequest*`, `PreHook*`, `Memory*`, `SessionSummary*`, `Parser*`, `Output*`, `Compression*`, `Followups*`, `RunIntermediateContent`, `RunContentCompleted`, `CustomEvent`) | ignorado |

**Team** (`run/team.ts`): os eventos `Team*` seguem a tabela acima com o prefixo (`TeamRunStarted`, `TeamRunContent`, `TeamToolCallStarted`, `TeamRunPaused`, `TeamRunCompleted`...). `TeamRunCompleted.member_responses` vai pra `raw`. **Roteamento de membro**: evento cujo `run_id !== run.id` e `parent_run_id === run.id` **(capturado)** é de um membro: upsert em `members` por `run_id` (criando `AgentRun` com `agentId: event.agent_id`, `local: false`) e aplica o reducer de agent nele. Evento com `run_id` desconhecido e sem `parent_run_id` é ignorado.

**Workflow** (`run/workflow.ts`):

| evento | efeito |
|---|---|
| `WorkflowStarted` | `id`, `sessionId`, `status: 'running'` |
| `StepStarted` | upsert de `StepRun` por `step_id` (`name: step_name`, `index: step_index`, `status: 'running'`) |
| `StepCompleted` | `step.status: 'completed'`, `step.content ← content` se string, `step.raw ← step_response` |
| `StepError` | `step.status: 'error'` |
| `StepPaused` / `StepExecutorPaused` / `ConditionPaused` / `RouterPaused` | `step.status: 'paused'` |
| `StepContinued` / `StepExecutorContinued` | `step.status: 'running'`, `status: 'running'` |
| `WorkflowPaused` | `status: 'paused'`; `stepRequirements ← step_requirements`; `pauseKind ← pause_kind`; `steps` também de `step_results` se vier |
| `WorkflowCompleted` | `status: 'completed'`; `content ← content`; `steps` reconciliados com `step_results` e `step_executor_runs`; `stepRequirements: null`, `pauseKind: null`; `metrics`, `media`; `raw` |
| `WorkflowError` / `WorkflowCancelled` | como no agent |
| eventos de executor (`RunStarted`, `RunContent`, `ToolCall*`, `RunCompleted`, `TeamRunContent`... com `workflow_run_id === run.id` e `step_id`) **(capturado)** | roteados pro `StepRun` com aquele `step_id`: `content` acumula de `RunContent`/`TeamRunContent`, `tools` upsert de `ToolCall*`/`TeamToolCall*`, `executorRunId ← run_id` |
| `Loop*`, `Parallel*`, `Condition*Started/Completed`, `Router*Started/Completed`, `Steps*`, `StepOutput`, `StepOutputReview`, `WorkflowAgent*`, `CustomEvent` | ignorado no 1.0 |

### 5.3 Reconexão

Quando o loop termina por exceção que não é `AbortError` e o run não está em estado final:

1. Se `background` é `false`: `status: 'error'`, `error: 'Connection lost'`. Fim.
2. Se o run ainda não tem `run_id` de verdade (falhou no `create` antes do `RunStarted`): `status: 'error'`, `error ← AgnoApiError.message`. Fim, sem retry.
3. Senão, até 3 tentativas com espera de 500 ms, 1 s, 2 s: `api.<kind>.runs.resume(targetId, runId, { session_id, last_event_index: run.eventIndex })`, mesmo loop. Sucesso zera o contador.
4. Esgotou: `status: 'error'`, `error: 'Connection lost'`. `resume(runId)` público recomeça do passo 3 com contador zerado.

O `agno-api` já faz refresh de token e retry no início de cada request; um stream aberto não é reautenticado. Token expirado no meio cai aqui, e o `resume` abre request nova com token novo.

### 5.4 `fromRunSchema`

`(kind, row) => Run`. Mapeia `run_id`, `status` (tabela da seção 3), `run_input → input.message`, `input_media → input.media`, `content` (string; objeto vira `JSON.stringify`), `reasoning_content`, `tools`, `images/videos/audio/files → media`, `citations`, `metrics`, `created_at`, `raw ← row`. Team: `members` preenchido pelo hydrate (seção 4, passo 1). Workflow: `steps ← step_results` (com `executorRunId` de `step_executor_runs` por `step_run_id`), `stepRequirements`, `pauseKind`.

Invariante testada: pra um mesmo run, `fromRunSchema(row)` e o resultado de `applyEvent` sobre o stream que gerou aquele row são iguais nos campos `id`, `status`, `content`, `tools`, `steps`, `input.message`.

## 6. HITL e tools no navegador

### 6.1 O que o Agno faz (fonte, `agno==3.0.6`)

- Tudo é `ToolExecution`, na lista `run.tools`. Pausa quando `requires_confirmation || requires_user_input || external_execution_required` (`models/response.py:65`). `approval_type`/`approval_id` são metadados, não gatilho. `stop_after_tool_call` não pausa.
- O servidor **só lê `tool_execution.*`** ao aplicar decisões (`agent/_tools.py:987-1026`). Campos de `RunRequirement` (`confirmation`, `external_execution_result`...) são espelhados pra dentro de `tool_execution` no `from_dict`.

| flag | o que a tela devolve no `ToolExecution` | servidor |
|---|---|---|
| `requires_confirmation` | `confirmed: true/false`, `confirmation_note?` | roda a tool, ou grava rejeição com a nota |
| `requires_user_input` + `user_input_schema[]` | `user_input_schema[].value` | copia pros args e roda (`get_user_input` nativa: só grava) |
| `requires_user_input` + `user_feedback_schema[]` (`ask_user`, `UserFeedbackTools`) | `user_feedback_schema[].selected_options: string[]` (labels) | grava `"User feedback received"`, não roda tool |
| `external_execution_required` | `result` (string vai como está; outro vira `JSON.stringify`) | usa `result` como saída da tool; `result == null` dá erro |
| `approval_type: 'required'` (em cima de um dos acima) | nada; admin resolve em `POST /approvals/{id}/resolve`; depois `continue([])` | `/continue` devolve **403** enquanto pendente |

- Depois do `continue`, a tool continua em `run.tools` com os campos preenchidos e `answered: true` / flags zerados. `messages` ganha uma mensagem de role `tool` (`"User feedback received: [...]"`). Por isso a resposta do usuário fica no histórico dentro do run onde aconteceu.
- Pendente (mesma regra do servidor): `requires_confirmation && confirmed == null`, ou `requires_user_input && answered !== true`, ou `external_execution_required && result == null`.
- **Team**: pausa de membro é copiada pra `requirements[]` do run do team com `member_agent_id`, `member_agent_name`, `member_run_id`, e **não** entra em `tools` do team (`team/_tools.py:645-672`). `continue` de team recebe `requirements`, casa por `id` depois por `tool_call_id`, e re-pausa se sobrou membro sem decisão.
- **Workflow**: pausa é `StepRequirement` (`workflow/types.py:815+`), com `pause_kind: 'step'` (o workflow gateou o passo: `requires_confirmation`, `requires_user_input` + `user_input`, `requires_route_selection` + `selected_choices`, `requires_output_review` + `edited_output`/`rejection_feedback`) ou `'executor'` (o agent/team do passo pausou: `requires_executor_input` + `executor_requirements[]` com `RunRequirement` aninhados). `continue` recebe `step_requirements`; só o **último** é o ativo.

### 6.2 API

```ts
isToolPending(t: ToolExecution): boolean
pendingTools(run: AgentRun | TeamRun): ToolExecution[]   // tools ∪ requirements[].tool_execution (requirements ganha), filtradas por isToolPending

// açúcar puro: devolve ToolExecution novo, nomes iguais aos métodos do RunRequirement no Python
confirm(t, note?)  reject(t, note?)  provideUserInput(t, values: Record<string, unknown>)
provideUserFeedback(t, selections: Record<string /*question*/, string[]>)  setExternalResult(t, result)

snapshot.pending   // agent/team: { runId, tools: pendingTools(run) }  do run 'paused' mais recente, venha do stream ou do hydrate; null se não há
                   // workflow:   { runId, stepRequirements }             idem
```

`pending` fica no snapshot (não só no run) pra ser renderizado fora do fluxo do chat (painel acima do composer). O mesmo `ToolExecution` aparece no painel enquanto `isToolPending` é verdadeiro e no histórico, dentro do run, depois de respondido.

### 6.3 `continue`

`continue(decisions, extra?)`:

1. Valida: cada item pendente do `pending` atual precisa de uma decisão (por `tool_call_id`; workflow por `step_id`) ou de uma `resolution` já gravada por `resolveTool` / `frontendTools`. Falta → rejeita `Error('Tool <id> still pending')` sem chamar o servidor. Exceção: tools com `approval_type: 'required'` não exigem decisão local; `continue([])` manda a lista vazia e o servidor aplica a resolução do admin (ou devolve 403 se ainda não houver).
2. Monta o wire, a única tradução do pacote:
   - agent: `tools: ToolExecution[]` (as decisões mescladas com as resoluções gravadas).
   - team: pra cada decisão, acha o `RunRequirement` original por `tool_call_id` em `run.requirements`, troca `tool_execution`, e manda `requirements: RunRequirement[]`. Tool que só está em `tools` (nível do team) vira `{ id: tool_call_id, tool_execution }`.
   - workflow: `step_requirements: StepRequirement[]` como veio.
3. Chama `api.<kind>.runs.continue(targetId, runId, { ...wire, ...extra, session_id, background, stream: true })` e consome no loop da seção 5. O run sai de `paused`; `pending` some. Erro HTTP (inclusive o 403 de aprovação): `run.error ← message`, run continua `paused`, `pending` continua.

### 6.4 `frontendTools`

Ao entrar em `paused` por evento de stream (não por hydrate):

1. Pra cada tool pendente com `external_execution_required` cujo `tool_name` está no mapa: roda a função (todas em paralelo) com `signal` amarrado ao `AbortController` do run. Sucesso → `resolution = setExternalResult(t, result)`. Exceção → `resolution = { ...t, tool_call_error: true, result: String(err?.message ?? err) }`.
2. Se **todas** as tools pendentes ficaram resolvidas: chama `continue([])` sozinho (as resoluções gravadas entram no wire).
3. Se sobrou alguma (confirmação, input, external sem função no mapa): `pending` fica exposto com as resolvidas marcadas; o app completa com `resolveTool` ou direto no `continue(decisions)`.

No hydrate de run `PAUSED` as funções **não** rodam (pode ter passado uma hora; side effect escondido num F5 é ruim). O app chama `runTools(runId?)` se quiser rodar o mapa nele (sem id: o run do `pending`). `resolveTool(id, result)` só grava a resolução no store.

## 7. Camada React

### 7.1 Registro de stores

O Provider mantém `Map<string, { store, refs: number }>` com chave `${kind}:${targetId}:${sessionId ?? '@new'}`. Dois componentes que pedem a mesma chave recebem o mesmo store (um stream, um hydrate). `refs` sobe no mount e desce no unmount; ao chegar em zero, `destroy()` é agendado com `setTimeout(0)` e cancelado se alguém montar antes (cobre o monta-desmonta-monta do StrictMode sem hidratar duas vezes).

### 7.2 Hooks

Os três chamam um `useAgnoStore({ kind, targetId, sessionId, background, frontendTools })` interno:

- pega/cria o store no registro;
- assina com `useSyncExternalStore(store.subscribe, store.getSnapshot, getServerSnapshot)`; `getServerSnapshot` devolve `{ status: 'loading', runs: [], pending: null, isBusy: false, sessionId, error: null }`;
- a cada render chama `store.setFrontendTools(frontendTools)` se a referência mudou, então o mapa pode ser inline com closures do componente, sem `useMemo`;
- devolve `{ ...snapshot, send, continue, ..., store }` com as funções amarradas ao store (estáveis).

### 7.3 Troca de sessão

- `sessionId` muda pra um id **diferente** do que o store tem: solta o store antigo (refs--), pega outro pela nova chave, hidrata.
- `sessionId` sai de `undefined` pro id que **o próprio store aprendeu** (`store.getSnapshot().sessionId === novo id`): mantém o store e só troca a chave no registro (`@new` → id). É o fluxo "novo chat, primeira mensagem, id na URL" sem perder o run otimista nem hidratar de novo.
- Peer dependency: `react >= 18` (por `useSyncExternalStore`).

## 8. Erros

Erro nunca derruba o store e fica onde aconteceu:

| onde | efeito | onde a tela vê |
|---|---|---|
| hydrate falhou | `status: 'error'`, `runs: []` | `chat.error` (o `AgnoApiError`) |
| `send` falhou antes de abrir o stream | run otimista `status: 'error'` | `run.error` |
| stream caiu, background | 3 tentativas de `resume`; depois `status: 'error'`, `error: 'Connection lost'` | `run.error` + `chat.resume(run.id)` |
| stream caiu, sem background | `status: 'error'` direto | `run.error` |
| `RunError` / `WorkflowError` | `status: 'error'`, texto do Agno | `run.error` |
| `continue` com decisão faltando | rejeita antes do request | `await` lança; store não muda |
| `continue` 403 (aprovação pendente) | `run.error`, run continua `paused` | `run.error`; limpa no próximo `continue` que der certo |
| `send` durante run ativo | rejeita `Error('A run is already active')` | `await` lança |
| `cancel` | `status: 'cancelled'` no `RunCancelled` (ou ao abortar, se o servidor não responder em 5 s) | `run.status` |
| `frontendTools` lançou | resultado de erro pro agent; run continua | tool com `tool_call_error: true` |

Regras: funções chamadas pelo app rejeitam só por erro de uso (validação local); erro de servidor ou rede vai pro `run.error` / `chat.error`. Nenhum retry silencioso além do `resume`.

## 9. Testes

1. **Reducers, sem rede nem React** (`test/run/*.test.ts`): fixtures de eventos gravados do `examples/agentos` em `test/fixtures/*.json` (agent com tool, agent com `add_one` pausando, `ask_user`, tool de frontend, team com membro, team com membro pausando, workflow com passo, workflow pausando, stream de `resume` com `catch_up`/`replay`). Cada teste aplica os eventos e compara o `Run`. Teste de invariante por kind: `fromRunSchema(row)` vs. resultado do stream.
2. **Store com `fetch` mockado** (`test/store/*.test.ts`, reusa `mockFetch`/`sse` do `agno-api`): hydrate (inclusive agrupamento de membros e `runs.get` pra pausado), `send` otimista e troca de id, wire do `continue` nos três kinds, validação de pendência, reconexão com 3 tentativas e `last_event_index`, dedupe por `event_index`, `frontendTools` automático e parcial, `runTools` no hydrate, `cancel`, `destroy`, cada linha da tabela de erros.
3. **Hooks** (`test/react/*.test.tsx`, `@testing-library/react` + `happy-dom`): dois componentes compartilham store, troca de `sessionId` nos dois casos da 7.3, `frontendTools` inline atualizado, StrictMode não hidrata duas vezes.
4. **E2E** (`test/e2e/*.e2e.test.ts`, `describe.skip` sem `AGNO_URL`, mesmo job `e2e` do CI): `ScriptedModel` ganha roteiros pra `ask_user` e pra uma tool `external_execution=True`; store de ponta a ponta nos três kinds, com F5 simulado (`destroy` + store novo com o mesmo `sessionId` no meio do stream) e HITL completo.

## 10. Estrutura e mudanças no `agno-api`

```
packages/agno-hooks/
  src/run/{agent,team,workflow}.ts     fromRunSchema + applyEvent por kind
  src/run/hitl.ts                      isToolPending, pendingTools, confirm, reject, provideUserInput, provideUserFeedback, setExternalResult
  src/store/store.ts                   createAgnoStore
  src/store/stream.ts                  loop de consumo + reconexão
  src/store/routes.ts                  tabela kind → rotas do agno-api
  src/react/provider.tsx               AgnoProvider, useAgnoApi, registro
  src/react/hooks.ts                   useAgnoAgent, useAgnoTeam, useAgnoWorkflow
  src/types.ts, src/index.ts
  test/...
examples/react/                        Vite + React contra examples/agentos: sidebar (api.sessions.list), chat de agent com chips e painel de pendência, aba de team com membros, aba de workflow com passos. Sem lib de UI.
```

Build igual ao `agno-api` (tsup ESM+CJS+d.ts, `react` e `@rodrigocoliveira/agno-api` como peer/dependency). Changeset `minor` → 0.1.0.

Mudanças no `agno-api` que este trabalho exige (no mesmo PR ou num antes):

- `UserFeedbackQuestion` corrigido: `question`, `header?`, `options?: { label: string; description?: string | null; selected?: boolean }[]`, `multi_select?`, `selected_options?: string[] | null`. O atual (`answer`, `options: string[]`) está errado (`agno/tools/function.py:1045-1083`).
- Tipo `StepRequirement` novo, à mão, espelhando `agno/workflow/types.py`.
- `WorkflowPaused` com os campos reais: `step_requirements`, `pause_kind`, `paused_step_index`, `paused_step_name`, `step_results`, `step_executor_runs`, `status`, `metadata` (`agno/run/workflow.py:269-297`), no lugar de `PausedFields`.
- `RunEventBase` ganha `workflow_run_id?`, `step_id?`, `step_name?`, `step_index?`, `nested_depth?` **(capturado)**; `TeamRunCompleted` ganha `member_responses?`.
- Comentário em `RunSchema`/`TeamRunSchema` avisando que `requirements` não é serializado.
- `.github/CODEOWNERS`: corrigir o comentário que diz que a revisão de CODEOWNER é exigida.

## 11. Critérios de pronto do 1.0 do `agno-hooks`

- Os três hooks funcionam contra o `examples/agentos`: histórico, stream, reload no meio (`resume`), HITL nos três kinds, `ask_user`, tool de frontend automática e manual, cancel.
- `pending` renderizável fora do fluxo do chat; a mesma tool aparece no histórico depois de respondida.
- Nenhum tipo de HITL inventado: a tela usa `ToolExecution` / `RunRequirement` / `StepRequirement` do `agno-api`.
- Testes das quatro camadas verdes no CI; `examples/react` roda com `bun run dev` e é a documentação viva.
- README com os exemplos das seções 2, 4 e 6.
