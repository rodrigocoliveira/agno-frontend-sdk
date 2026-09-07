# Demo (`examples/demo-agentos` + `examples/demo-react`) e `guide/` — design

Data: 2026-09-07. Status: aprovado em brainstorm, aguardando plano de implementação.
Pré-requisitos prontos: `@rodrigocoliveira/agno-api` (spec `2026-09-06-agno-api-design.md`) e `@rodrigocoliveira/agno-hooks` (spec `2026-09-06-agno-hooks-design.md`, PR #9 mergeado).
Fonte da verdade do servidor: fonte de `agno==3.0.6` instalado em `examples/agentos/.venv` (citado como `agno/...`).

## 1. Objetivo

Antes da release 0.1.0 dos dois pacotes, entregar três coisas que hoje não existem:

1. **Um servidor AgentOS de demonstração** com LLM real (OpenAI ou Ollama), agentes, teams e workflows que exercitam cada caminho da lib: stream, arquivos, tools no chat, tools no navegador, confirmação, `ask_user`, input estruturado, aprovação de admin, membros de team, pausas de workflow (executor e step), passos aninhados, reconexão de run em background, histórico e sessões por usuário.
2. **Uma vitrine React** limpa, que descobre os alvos pela API, troca de endpoint e de token em um clique, e mostra cada feature numa tela pequena e legível. O código dela é o exemplo canônico de uso do `agno-hooks`.
3. **Um `guide/`** em markdown puro que explica como usar a lib, do zero ao HITL, apontando pra tela da vitrine que demonstra cada tema.

Critério que governa tudo: **código limpo e claro**. Cada arquivo tem uma responsabilidade; um leitor que abre `examples/demo-react/src/pages/AgentPage.tsx` entende como usar `useAgnoAgent` sem ler mais nada. Nada de biblioteca de componentes, nada de abstração que só faz sentido dentro da demo.

### Fora de escopo

- Novas features na lib. Se a demo revelar uma lacuna, vira issue (ou fix separado se for bug).
- Site gerado pra documentação (VitePress etc.). O markdown fica pronto pra isso, mas não agora.
- Traces, memória, knowledge, métricas globais, evals, scheduler. São rotas do `agno-api`, não da vitrine do `agno-hooks`.
- Testes E2E contra o servidor real (custa chave e não é determinístico). O E2E continua no servidor scriptado.
- Deploy da demo.

## 2. Mudanças de layout do repositório

```
e2e/agentos/               ← movido de examples/agentos (git mv, código intocado)
examples/demo-agentos/     ← novo: servidor real
examples/demo-react/       ← novo: vitrine (examples/react é removido)
guide/                     ← novo: documentação de uso
docs/                      ← continua só com material interno (specs, plans, api map, openapi)
```

- `e2e/agentos` deixa de ser "example": é fixture determinística do CI. O `package.json` dele passa a se chamar `agentos-e2e`; o README abre dizendo isso e que ele não usa LLM.
- Root `package.json`: `workspaces` = `["packages/*", "examples/*", "e2e/*"]`; scripts `agentos` → `bun run --filter agentos-e2e dev`, `example` some, entram `demo:server`, `demo:web`, `demo:tokens` (seção 3.3 e 4.2).
- `.github/workflows/ci.yml`: caminho `examples/agentos` → `e2e/agentos`; o passo "example build" passa a buildar e tipar `examples/demo-react`; entra um passo que importa o `demo-agentos` sem rodar (seção 6).
- README raiz e READMEs dos pacotes: todo link pra `examples/agentos` ou `examples/react` é atualizado; o README raiz ganha a seção "Try the demo" apontando pra `guide/getting-started.md`.
- `.gitignore`: `examples/demo-agentos/tmp/`, `examples/demo-agentos/.venv/`, `examples/demo-react/dist/`. O `examples/react/dist` hoje commitado some junto com a pasta.

## 3. `examples/demo-agentos`

### 3.1 Estrutura

```
examples/demo-agentos/
  README.md
  package.json          name "demo-agentos"; scripts: dev, tokens
  pyproject.toml        deps: agno==3.0.6, fastapi, uvicorn, python-multipart, sqlalchemy, pyjwt, openai, ollama
  uv.lock
  server.py             AgentOS(...) e uvicorn. Só junta as peças.
  settings.py           lê env: porta, provedor/modelo, segredo JWT, origem do CORS
  models.py             model() → OpenAIChat | Ollama
  auth.py               AuthorizationConfig + SCOPES por perfil (usado por server.py e tokens.py)
  tokens.py             imprime {"admin": jwt, "user-1": jwt, "user-2": jwt}
  db.py                 SqliteDb("tmp/demo.db") compartilhado
  tools/
    catalog.py          lookup_product, slow_task
    browser.py          get_location, get_local_time (external_execution=True)
    billing.py          send_invoice (requires_confirmation), issue_refund (@approval)
    forms.py            collect_shipping_address (requires_user_input)
  agents/
    chat.py  tools.py  browser.py  confirm.py  interview.py  approval.py
  teams/
    support.py  research.py  field.py
  workflows/
    publish.py  report.py  nightly.py
```

Cada módulo de `agents/`, `teams/` e `workflows/` exporta um único objeto (`agent`, `team`, `workflow`) e cabe numa tela. `server.py` importa os doze e monta o `AgentOS`. Nenhum módulo lê env diretamente: tudo passa por `settings.py`.

### 3.2 Modelo

```python
# models.py
def model() -> Model:
    if settings.OPENAI_API_KEY:
        return OpenAIChat(id=settings.OPENAI_MODEL)      # default "gpt-4o-mini"
    return Ollama(id=settings.OLLAMA_MODEL)              # default "llama3.1"
```

Cada agente chama `model()` uma vez na construção. O README avisa que o modelo Ollama precisa suportar tool calling (`llama3.1`, `qwen2.5`) e que `ollama pull` é responsabilidade de quem roda. Nenhum outro lugar sabe qual provedor está ativo.

### 3.3 Autenticação e usuários

Objetivo: trocar de token na vitrine e ver sessões filtradas por usuário, aprovações restritas a admin e 403 quando falta escopo.

- `server.py` passa `authorization=True, authorization_config=auth.CONFIG` com `AuthorizationConfig(verification_keys=[settings.JWT_SECRET], algorithm="HS256", user_isolation=True)` (`agno/os/config.py:AuthorizationConfig`, `agno/os/middleware/jwt.py:JWTMiddleware`). Claims lidos: `sub` → `user_id`, `scopes` → RBAC (`agno/os/scopes.py`).
- `settings.JWT_SECRET` default `"demo-secret-change-me"`. É uma demo local; o README diz que em produção se usa RS256 com JWKS.
- Perfis, em `auth.py`:

  | rótulo | `sub` | `scopes` |
  |---|---|---|
  | `admin` | `admin` | `["agent_os:admin"]` |
  | `user-1` | `user-1` | `USER_SCOPES` |
  | `user-2` | `user-2` | `USER_SCOPES` |

  `USER_SCOPES = ["agents:read", "agents:run", "teams:read", "teams:run", "workflows:read", "workflows:run", "sessions:read", "sessions:write", "approvals:read", "config:read"]`. É o mínimo pra usar a vitrine inteira menos a página de aprovações (`approvals:write`, admin-only em `agno/os/routers/approvals/router.py`).
- `tokens.py` gera os três JWTs HS256 com `exp` de 30 dias e imprime um JSON de rótulo → token. A vitrine importa esse JSON de uma vez (seção 4.3). `bun run demo:tokens` na raiz chama `uv run python tokens.py`.
- Com `user_isolation=True` o AgentOS exige `session_id` em continue/resume (form) e cancel (query) pra não-admin. A lib já manda nos três (`packages/agno-hooks/src/store/store.ts`, `routesFor`). Isso vira um caso do checklist manual (seção 7) e, se falhar, é bug da lib, não da demo.
- CORS: `cors_allowed_origins=[settings.WEB_ORIGIN]`, default `http://localhost:5173`.
- Porta: `AGNO_PORT`, default `7777`. Banco: `tmp/demo.db` (gitignored; apagar reseta tudo).

### 3.4 Catálogo

Cada linha é um arquivo. A coluna "caminho da lib" diz qual código do `agno-hooks` o caso exercita; é o critério pra ele existir.

**Agentes**

| id | tools | demonstra | caminho da lib |
|---|---|---|---|
| `chat` | nenhuma; `markdown=True`; instruções pedem respostas com títulos e listas | stream de texto, markdown, arquivos anexados (imagem/PDF vão em `send({ message, files })`), cancelar, métricas | `applyEvent` de conteúdo, `SendInput.files`, `cancel`, `run.metrics` |
| `tools` | `lookup_product`, `slow_task` | tool call renderizada no chat com args e resultado; `slow_task` dorme 20s pra você recarregar a página no meio e ver o run em background reconectar | `upsertTool`, hidratação de run `RUNNING` + `resume` |
| `browser` | `get_location`, `get_local_time` (`external_execution=True`) | tools executadas no navegador via `frontendTools`, resultado volta pelo `continue` | `autoRunTools`, `setExternalResult` |
| `confirm` | `send_invoice` (`requires_confirmation=True`) | painel confirmar/rejeitar fora do chat | `confirm`, `reject`, `pending.tools` |
| `interview` | `UserFeedbackTools()` (`ask_user`, com `multi_select`) e `collect_shipping_address` (`requires_user_input=True`, campos `street`, `city`, `zip`) | formulário de perguntas com opções e formulário de campos, ambos fora do chat, respostas ficam no histórico | `provideUserFeedback`, `provideUserInput` |
| `approval` | `issue_refund` (`@approval` + `@tool`) | run pausa até um admin resolver em `/approvals`; `continue` dá 403 antes disso | 403 tratado no `continueRun`, `continue([])` depois da resolução |

**Teams** (`Team(members=[...], model=model(), db=db)`)

| id | membros | demonstra | caminho da lib |
|---|---|---|---|
| `support` | `triage` (sem tools), `billing` (com `send_invoice`) | líder delega, runs dos membros aparecem aninhados, confirmação vinda de membro chega como `requirements` do team | `groupTeamRows`, roteamento por `parent_run_id`, `continueRun` de team embrulhando `RunRequirement` |
| `research` | `web` e `numbers` (dois membros sem tools, `delegate_to_all_members=True`), líder com `UserFeedbackTools()` | membros em paralelo, `member_responses` no `TeamRunCompleted`, `ask_user` no líder | membros simultâneos, `TeamRun.members`, `provideUserFeedback` em team |
| `field` | `scout` com `get_location` | tool de navegador originada num membro: o requirement chega com `member_*` e a resposta tem que voltar pelo team | `continueRun` de team devolvendo o `RunRequirement` inteiro (com `member_agent_id`/`member_run_id`) e `setExternalResult` no `tool_execution` |

**Workflows** (`Workflow(steps=[...], db=db)`)

| id | passos | demonstra | caminho da lib |
|---|---|---|---|
| `publish` | `Step("draft", agent=interview-like com ask_user)` → `Step("review", agent=editor, human_review=HumanReview(requires_confirmation=True))` → `Step("publish", agent=publisher)` | pausa de executor (o agente do passo pergunta) e pausa de step (revisão humana), na mesma corrida | `StepRequirement` com `pause_kind` `'executor'` e `'step'`, `executorTools`/`resolveExecutorTools`, "só o último requirement é ativo" |
| `report` | `Parallel(Step("sales"), Step("costs"), name="gather")` → `Condition(evaluator=<CEL: previous_step_content contém "loss">, steps=[Step("alert")], name="check")` → `Step("summary")` | lista de passos com filhos aninhados, passo condicional que pode não rodar | `WorkflowRun.steps` aninhados, `reconcileSteps` |
| `nightly` | três `Step`s com o agente `tools` chamando `slow_task` | run longo em background: fechar a aba, voltar, ver os passos continuarem | `resume` de workflow, `settleFromRow` |

Todos os agentes usados dentro de teams e workflows são instâncias próprias (`id` prefixado, ex. `publish-draft`) pra não aparecerem duplicados em `/agents`. Os agentes standalone da tabela de cima são registrados em `AgentOS(agents=[...])`; os internos não.

### 3.5 README

Roda em quatro comandos: `cd examples/demo-agentos && uv sync`, `OPENAI_API_KEY=... uv run python server.py` (ou `ollama pull llama3.1` e rodar sem chave), `uv run python tokens.py`, e o link pra `guide/getting-started.md`. Tabela de env: `AGNO_PORT`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `OLLAMA_MODEL`, `JWT_SECRET`, `WEB_ORIGIN`. Tabela do catálogo (a da seção 3.4 sem a coluna "caminho da lib").

## 4. `examples/demo-react`

### 4.1 Stack e estrutura

Vite 6, React 19, `react-router` 7, Tailwind 4 (plugin `@tailwindcss/vite`), `lucide-react`, `react-markdown`. Sem biblioteca de componentes.

```
examples/demo-react/
  README.md  package.json ("demo-react")  index.html  vite.config.ts  tsconfig.json
  src/
    main.tsx                 BrowserRouter + ConnectionProvider + AgnoProvider + rotas
    routes.tsx               tabela de rotas
    connection/
      ConnectionContext.tsx  { endpoint, tokens[], activeToken, set*, importTokens } persistido em localStorage
      useTargets.ts          lista /agents, /teams, /workflows do endpoint ativo (agno-api direto)
    layout/
      AppLayout.tsx          sidebar + header (status da conexão, token ativo) + <Outlet/>
      Sidebar.tsx            navegação: Home, Agents (lista), Teams, Workflows, Sessions, Approvals, Settings
    pages/
      HomePage.tsx  AgentPage.tsx  TeamPage.tsx  WorkflowPage.tsx
      SessionsPage.tsx  ApprovalsPage.tsx  SettingsPage.tsx
    run/                      tudo que renderiza um Run
      RunShell.tsx           layout de uma sessão: SessionList | (PendingPanel, RunList, Composer)
      RunList.tsx            mapeia runs → RunCard (agent/team) ou StepList (workflow)
      RunCard.tsx            input do usuário, conteúdo markdown, ToolCallList, status, erro, botão "raw"
      MemberRuns.tsx         runs dos membros aninhados (team)
      StepList.tsx           passos de workflow, recursivo, com status por passo
      ToolCallList.tsx       tool calls com args/resultado
      Composer.tsx           textarea + anexos + enviar/cancelar
      RawDrawer.tsx          JSON do run (metrics, citations, raw)
    pending/                  HITL fora do chat
      PendingPanel.tsx       decide qual formulário mostrar a partir de `pending`
      ConfirmForm.tsx        requires_confirmation
      UserInputForm.tsx      user_input_schema
      FeedbackForm.tsx       user_feedback_schema (multi_select, opções)
      ApprovalNotice.tsx     approval_id pendente → link pra /approvals, botão "tentar continuar"
      StepReviewForm.tsx     StepRequirement de step (HumanReview)
    tools/
      frontendTools.ts       { get_location, get_local_time } usados por browser e field
    sessions/
      SessionList.tsx        sessões do alvo atual (api.sessions.list com type + component_id)
    ui/                       primitivos: Button, Input, Badge, Card, Dialog, Tabs (≈ 6 arquivos, Tailwind puro)
    lib/
      format.ts  cn.ts
```

Regras:

- **Páginas são finas.** `AgentPage` é: ler `:id` e `?session` da URL, chamar `useAgnoAgent({ agentId, sessionId, frontendTools })`, renderizar `<RunShell hook={hook} />`. Team e workflow idem. Toda a UI compartilhada mora em `run/` e `pending/`.
- **Descoberta pela API.** Nada de lista hardcoded de ids. A sidebar e a Home vêm de `useTargets`. Por isso a vitrine também roda contra `e2e/agentos`.
- **Nada da lib é re-embrulhado.** A vitrine consome `hook.runs`, `hook.pending`, `hook.send` etc. diretamente. Se um componente precisar de um helper que a lib já exporta (`isToolPending`, `pendingTools`), importa da lib.
- **`sessionId` na URL.** Nova sessão = sem `?session`; quando o hook aprende o id (`hook.sessionId`), a página faz `navigate` com `replace` pra colocar na URL. Abrir uma sessão da lista é só navegar. Isso demonstra o "learned-session rekey" da lib sem código extra.

### 4.2 Scripts

`package.json` da demo: `dev` (vite), `build` (`tsc && vite build`), `typecheck`. Raiz: `demo:web` → `bun run --filter demo-react dev`, `demo:server` → `bun run --filter demo-agentos dev`, `demo:tokens` → `bun run --filter demo-agentos tokens`. `vite.config.ts` mantém o alias dos pacotes pro `src` (como hoje) pra hot reload da lib. Sem proxy: a vitrine fala com o endpoint configurado e o servidor libera CORS.

### 4.3 Conexão e tokens (`/settings`)

Inspirado no diálogo "Connect your AgentOS", sem os enfeites:

- **Endpoint**: um input de URL, default `http://localhost:7777`. Ao lado, o status: verde se `GET /health` respondeu, com o `id` do OS vindo de `GET /config`.
- **Tokens**: lista de `{ label, token }`. Ações: colar um token com rótulo, importar o JSON do `tokens.py` (cria/atualiza os três de uma vez), remover, e **selecionar o ativo** (radio). Existe sempre a opção "sem token". O token ativo aparece no header em toda página e trocar recarrega os dados (o `AgnoProvider` recebe `token` novo; como a lib lê o token por ref, o `AgnoApi` não é recriado, mas cada `useTargets`/`SessionList` refaz o fetch porque dependem de `activeToken`).
- Persistência em `localStorage` (`demo-react:connection`). O JSON do `tokens.py` também pode vir por `VITE_AGNO_TOKENS` pra quem prefere não colar; é lido só no primeiro carregamento.
- O payload do JWT ativo (decodificado, sem verificar) aparece na página: `sub`, `scopes`, `exp`. Facilita entender o que o servidor está vendo.

`main.tsx` monta `<AgnoProvider baseUrl={endpoint} token={activeToken}>` uma vez; `endpoint` mudar recria o `AgnoApi` (comportamento já documentado do provider).

### 4.4 Páginas

| rota | conteúdo |
|---|---|
| `/` | status da conexão; três cards (agentes, teams, workflows) com contagem e lista de ids linkados; abaixo, "o que cada demo mostra": tabela do catálogo com link pra tela e pro capítulo do `guide/` |
| `/agents/:id` | `RunShell` com `useAgnoAgent`; `browser` recebe `frontendTools` (a página passa sempre; agentes sem tool externa ignoram) |
| `/teams/:id` | `RunShell` com `useAgnoTeam`; `RunCard` mostra `MemberRuns` |
| `/workflows/:id` | `RunShell` com `useAgnoWorkflow`; `RunList` usa `StepList` em vez de `RunCard` |
| `/sessions` | `api.sessions.list` paginada, filtro por tipo (agent/team/workflow), colunas: nome/id do alvo, `session_id`, atualizado em, nº de runs; clicar navega pra `/agents/:id?session=...` (ou team/workflow). Sob isolamento, um `user-1` só vê as dele; `admin` vê todas |
| `/approvals` | `api.approvals.list({ status: 'pending' })` + `resolve` (aprovar/rejeitar com nota). Com token não-admin o `resolve` dá 403: a página mostra o erro e sugere trocar pro `admin`. Aprovada, a instrução é voltar pro run e clicar "continuar" no `ApprovalNotice` |
| `/settings` | seção 4.3 |

### 4.5 `RunShell` e o fluxo de uma sessão

```
┌ SessionList ┐ ┌──────────────── main ────────────────┐
│ nova sessão │ │ PendingPanel   (só se hook.pending)   │
│ sess 1      │ │ RunList        (hook.runs)            │
│ sess 2 ●    │ │ Composer       (send / cancel)        │
└─────────────┘ └───────────────────────────────────────┘
```

- `hook.status === 'loading'` → esqueleto. `'error'` → banner com `hook.error.message` e botão "tentar de novo" (que muda a `key` do `RunShell` pra recriar o hook). Um erro de hidratação por 401/403 vira mensagem "o token ativo não tem acesso a esta sessão", com link pra `/settings`.
- `Composer` desabilita "enviar" enquanto `hook.isBusy`; nesse estado o botão vira "cancelar" (`hook.cancel()`). Anexos: `<input type="file" multiple>`; a lista de arquivos vai em `send({ message, files })` e aparece no `RunCard` como chips (a lib guarda em `run.input.files`).
- `PendingPanel` escolhe o formulário pelo formato do que está pendente: `tool.requires_confirmation` → `ConfirmForm`; `tool.user_input_schema` → `UserInputForm`; `tool.user_feedback_schema` → `FeedbackForm`; `tool.approval_id` → `ApprovalNotice`; `tool.external_execution_required` sem `frontendTools` correspondente → cartão "esta tool precisa ser executada fora" com botão "enviar resultado manual" (`hook.resolveTool`). Em workflow, `pending.stepRequirements` com `pause_kind === 'step'` → `StepReviewForm`; com `'executor'`, usa os mesmos formulários de tool em cima de `pending.tools`. Cada formulário termina chamando `hook.continue(decisions)` e some quando `pending` vira `null`.
- `RunCard`: cabeçalho com status (`Badge`), input do usuário à direita, conteúdo markdown à esquerda, `ToolCallList` entre os dois quando houver tools, rodapé com `createdAt`, tokens/tempo de `run.metrics` e botão "raw" que abre o `RawDrawer`. Erro do run em vermelho no rodapé.
- `StepList`: um item por passo com nome, status e conteúdo; passos com `steps` filhos (Parallel, Condition) indentam. Passo pausado mostra um marcador que aponta pro `PendingPanel`.
- Reconexão não tem UI própria: o comportamento é recarregar a página durante `slow_task` ou `nightly` e ver o `RunCard`/`StepList` voltarem em `RUNNING` e continuarem. A Home explica isso no card do caso.

### 4.6 Erros e vazios

- Endpoint fora do ar: Home e sidebar mostram "AgentOS não respondeu em `<url>`" com link pra Settings; nada quebra.
- Alvo inexistente na URL: página mostra "agente `x` não existe neste OS" e a lista dos que existem.
- Sem tokens salvos e servidor com auth ligada: a primeira chamada devolve 401; o banner diz "este OS exige token" e linka pra Settings. A vitrine não tenta adivinhar.

## 5. `guide/`

Markdown puro, lido no GitHub. Cada arquivo começa com um parágrafo de contexto, mostra código React completo (imports incluídos) e termina com "Veja na demo: `/agents/confirm`" quando houver tela. Códigos são copiados da vitrine, não inventados: se um trecho do guia não compila na demo, um dos dois está errado.

```
guide/
  README.md                  o que é o SDK, os dois pacotes, quando usar cada um, índice com uma linha por capítulo
  getting-started.md         instalar, subir demo-agentos, subir demo-react, importar tokens, primeira conversa
  concepts/
    runs.md                  run como unidade de estado, o que tem num Run, por que não "mensagens"
    lifecycle.md             loading → ready, send, stream, paused, continue, terminal; background e reconexão
    hitl.md                  vocabulário do Agno: ToolExecution, RunRequirement, StepRequirement; os 5 tipos de pausa
    auth.md                  provider e token, user_id no JWT, escopos, isolamento por usuário
  agent.md                   useAgnoAgent do zero: provider, hook, lista de runs, composer
  team.md                    useAgnoTeam: membros, member_responses, requirement vindo de membro
  workflow.md                useAgnoWorkflow: passos, passos aninhados, pausa de step e de executor
  frontend-tools.md          frontendTools: contrato da função, auto-run, fallback manual com resolveTool
  confirmation-and-input.md  requires_confirmation, requires_user_input, ask_user (multi_select)
  approvals.md               @approval no servidor, 403 no continue, página de admin com api.approvals
  sessions-and-history.md    sessionId na URL, hidratação, sessão pausada reaberta, lista de sessões com api.sessions
  files.md                   anexar arquivos no send, o que o servidor aceita, como aparece no run
  reconnection.md            background=true, o que acontece num reload, resume, quando um run vira erro
  errors.md                  AgnoApiError, status 0, status 'error' do hook, erro por run
  reference/
    agno-api.md              createAgnoApi, config, transporte, famílias de rotas, streaming, erros
    agno-hooks.md            AgnoProvider, os três hooks, AgnoHook, Snapshot, Run*, Pending, Decision, FrontendTool
  demo.md                    mapa: cada tela da vitrine → capítulos que ela demonstra → arquivos do servidor
```

`reference/*` é escrito à mão a partir de `src/types.ts` e `src/react/*` (assinaturas exatas, um parágrafo por item). Não é gerado.

Os READMEs dos pacotes encolhem pra "instalação + exemplo mínimo + link pro guide"; o conteúdo longo que hoje está neles migra pro `guide/`.

## 6. CI

- Job `ci`: além do que já faz, `bun run --filter demo-react typecheck` e `build`.
- Job `ci`, novo passo `demo-agentos import check`: `cd examples/demo-agentos && uv sync && uv run python -c "import server"`. Sem chave o `model()` cai em `Ollama`, que não conecta na construção; isso pega erro de wiring (import errado, agente duplicado, tool mal decorada) sem gastar LLM. `tokens.py` também roda no CI e valida que a saída é JSON com as três chaves.
- Job `e2e`: só troca o caminho pra `e2e/agentos`.

## 7. Verificação manual (checklist do plano)

Executado uma vez, contra OpenAI, antes de abrir o PR; o resultado vai no corpo do PR. Cada item nomeia a tela e o comportamento esperado:

1. `chat`: stream renderiza markdown; anexar uma imagem e perguntar sobre ela funciona; cancelar no meio deixa o run `cancelled`.
2. `tools`: tool call aparece com args e resultado; durante `slow_task`, recarregar a página mostra o run `running` e ele termina.
3. `browser`: `get_location` pede permissão do navegador e a resposta chega no agente sem clique.
4. `confirm`: painel aparece acima do chat; rejeitar e confirmar produzem históricos diferentes; reabrir a sessão pausada mostra o painel de novo.
5. `interview`: pergunta com `multi_select` e formulário de endereço; respostas visíveis no histórico.
6. `approval` como `user-1`: run pausa; `continue` dá 403 e o aviso aparece; trocar pra `admin`, aprovar em `/approvals`, voltar pra `user-1`, continuar.
7. `support`: runs dos membros aninhados; confirmação do membro `billing` resolve pelo painel do team.
8. `research`: dois membros rodam; `ask_user` do líder aparece; `member_responses` visível no raw.
9. `field`: tool de navegador do membro executa e o team conclui.
10. `publish`: primeira pausa é do executor (pergunta), segunda é de step (revisão); ambas continuam.
11. `report`: `Parallel` aparece com dois filhos; `Condition` aparece como pulado ou executado conforme o texto.
12. `nightly`: fechar a aba durante o run, reabrir pela lista de sessões, passos continuam até o fim.
13. `/sessions` como `user-1` e `user-2`: cada um vê só as suas; `admin` vê todas.
14. Sem token: 401 vira banner apontando pra Settings.
15. Vitrine contra `e2e/agentos` (sem auth): as telas abrem e o `test-agent` conversa.

## 8. Critérios de pronto

- `bun run typecheck`, `bun run test`, `bun run build` e o CI verdes; E2E verde contra `e2e/agentos`.
- `examples/demo-react/src` sem nenhum componente acima de ~150 linhas e nenhuma página acima de ~40.
- Cada arquivo de `agents/`, `teams/`, `workflows/` do servidor abaixo de ~60 linhas, com docstring de uma frase dizendo o que demonstra.
- Os 15 itens do checklist manual passaram (ou falharam com issue aberta nomeando o item).
- Todo capítulo do `guide/` com pelo menos um bloco de código que existe literalmente na demo.
- README raiz, dos pacotes e do `e2e/agentos` sem referência a `examples/agentos` ou `examples/react`.
