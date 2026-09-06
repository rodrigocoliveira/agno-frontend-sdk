# Mapa da API do AgentOS v3 (agno==3.0.6)

Gerado do `openapi.json` de um AgentOS real (`SqliteDb`, 1 agent, 1 team), complementado com o que o OpenAPI não expressa: o transporte SSE, o union de eventos e os payloads de HITL. É a especificação de entrada do pacote `@rodrigocoliveira/agno-api`.

Legenda: **↑** = o que sobe (query, path, body); **↓** = o que desce (resposta 200). Content types diferentes de `application/json` estão marcados.

Total: **89 paths, 125 operações**, em 20 grupos.

## Índice

- [Health](#health) (1)
- [Core](#core) (2)
- [Agents](#agents) (11)
- [Teams](#teams) (11)
- [Workflows](#workflows) (8)
- [Sessions](#sessions) (9)
- [Media](#media) (1)
- [Memory](#memory) (9)
- [Learnings](#learnings) (7)
- [Knowledge](#knowledge) (13)
- [Components](#components) (13)
- [Schedules](#schedules) (10)
- [Approvals](#approvals) (6)
- [Queue](#queue) (5)
- [Service Accounts](#service-accounts) (3)
- [Registry](#registry) (1)
- [Evals](#evals) (5)
- [Metrics](#metrics) (3)
- [Traces](#traces) (5)
- [Database](#database) (2)


## Health

### `GET /health`

Health Check. Check the health status of the AgentOS API. Returns a simple status indicator.

**↓** `HealthResponse`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `status` | `string` | sim | — |
| `instantiated_at` | `string` | sim | — |


## Core

### `GET /info`

Get OS Info. Return lightweight, unauthenticated metadata about this AgentOS instance.

**↓** `InfoResponse`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `os_id` | `string` | sim | — |
| `name` | `string | null` | não | — |
| `os_version` | `string` | sim | — |
| `agno_version` | `string` | sim | — |
| `agent_count` | `int` | não | `0` |
| `team_count` | `int` | não | `0` |
| `workflow_count` | `int` | não | `0` |
| `mcp` | `McpInfo` | não | — |
| `auth_mode` | `"none" | "security_key" | "jwt"` | não | `"none"` |

### `GET /config`

Get OS Configuration. Retrieve the complete configuration of the AgentOS instance, including:

**↓** `ConfigResponse`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `os_id` | `string` | sim | — |
| `name` | `string | null` | não | — |
| `description` | `string | null` | não | — |
| `available_models` | `Model[]` | não | — |
| `os_database` | `string | null` | não | — |
| `databases` | `string[]` | sim | — |
| `chat` | `ChatConfig | null` | não | — |
| `manifest` | `Record<string, Manifest> | null` | não | — |
| `session` | `SessionConfig | null` | não | — |
| `metrics` | `MetricsConfig | null` | não | — |
| `memory` | `MemoryConfig | null` | não | — |
| `learning` | `LearningConfig | null` | não | — |
| `knowledge` | `KnowledgeConfig | null` | não | — |
| `evals` | `EvalsConfig | null` | não | — |
| `traces` | `TracesConfig | null` | não | — |
| `agents` | `AgentSummaryResponse[]` | sim | — |
| `teams` | `TeamSummaryResponse[]` | sim | — |
| `workflows` | `WorkflowSummaryResponse[]` | sim | — |
| `interfaces` | `InterfaceResponse[]` | sim | — |

Erros documentados: `400`, `401`, `404`, `500`


## Agents

### `POST /agents/{agent_id}/runs`

Create Agent Run. Execute an agent with a message and optional media files. Supports both streaming and non-streaming responses.

**↑ body (`multipart/form-data`)**

| campo | tipo | obrig. | default |
|---|---|---|---|
| `message` | `string` | sim | — |
| `stream` | `bool` | não | `true` |
| `session_id` | `string | null` | não | — |
| `user_id` | `string | null` | não | — |
| `files` | `string[] | null` | não | — |
| `files_metadata` | `string | null` | não | — |
| `version` | `int | null` | não | — |
| `background` | `bool` | não | `false` |
| `factory_input` | `string | null` | não | — |

**↓** `any`

**↓ (`text/event-stream`)** stream de eventos (ver seção SSE)

Erros documentados: `400`, `401`, `404`, `500`

### `GET /agents/{agent_id}/runs`

List Agent Runs. List runs for an agent within a session, optionally filtered by status.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `session_id` | query | `string` | sim | — |
| `status` | query | `string | null` | não | — |

**↓** `any`

Erros documentados: `400`, `401`, `404`, `500`

### `POST /agents/{agent_id}/runs/{run_id}/cancel`

Cancel Agent Run. Cancel a currently executing agent run. This will attempt to stop the agent's execution gracefully.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `session_id` | query | `string | null` | não | — |

**↓** `any`

Erros documentados: `400`, `401`, `404`, `500`

### `POST /agents/{agent_id}/runs/{run_id}/continue`

Continue Agent Run. Advance a persisted agent run from its current state. Dispatches on the body shape and the persisted run state.

**↑ body (`application/x-www-form-urlencoded`)**

| campo | tipo | obrig. | default |
|---|---|---|---|
| `tools` | `string` | não | `""` |
| `input` | `string | null` | não | — |
| `continue_from` | `string` | não | `"end"` |
| `fork` | `bool` | não | `false` |
| `regenerate` | `bool` | não | `false` |
| `replace_original` | `bool | null` | não | — |
| `additional_instructions` | `string | null` | não | — |
| `session_id` | `string | null` | não | — |
| `user_id` | `string | null` | não | — |
| `stream` | `bool` | não | `true` |
| `background` | `bool` | não | `false` |

**↓** `any`

**↓ (`text/event-stream`)** stream de eventos (ver seção SSE)

Erros documentados: `400`, `401`, `404`, `500`, `403`, `409`

### `POST /agents/{agent_id}/sessions/{session_id}/fork`

Fork Agent Session. Deep-copy a session into a new independent session. Every run is copied with a fresh ``run_id``; the new session has a fresh ``session_id``. The original is untouched. Use to explore alternative conversation paths without mutating the source.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `user_id` | query | `string | null` | não | — |

**↓** `any`

Erros documentados: `400`, `401`, `404`, `500`

### `GET /agents`

List All Agents. Retrieve a comprehensive list of all agents configured in this OS instance.

**↓** `AgentResponse[]`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `id` | `string | null` | não | — |
| `name` | `string | null` | não | — |
| `db_id` | `string | null` | não | — |
| `description` | `string | null` | não | — |
| `role` | `string | null` | não | — |
| `is_factory` | `bool` | não | `false` |
| `model` | `ModelResponse | null` | não | — |
| `tools` | `object | null` | não | — |
| `sessions` | `object | null` | não | — |
| `knowledge` | `object | null` | não | — |
| `memory` | `object | null` | não | — |
| `reasoning` | `object | null` | não | — |
| `default_tools` | `object | null` | não | — |
| `system_message` | `object | null` | não | — |
| `extra_messages` | `object | null` | não | — |
| `response_settings` | `object | null` | não | — |
| `introduction` | `string | null` | não | — |
| `streaming` | `object | null` | não | — |
| `metadata` | `object | null` | não | — |
| `input_schema` | `object | null` | não | — |
| `factory_input_schema` | `object | null` | não | — |
| `is_component` | `bool` | não | `false` |
| `current_version` | `int | null` | não | — |
| `stage` | `string | null` | não | — |

Erros documentados: `400`, `401`, `404`, `500`

### `GET /agents/{agent_id}`

Get Agent Details. Retrieve detailed configuration and capabilities of a specific agent.

**↓** `AgentResponse`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `id` | `string | null` | não | — |
| `name` | `string | null` | não | — |
| `db_id` | `string | null` | não | — |
| `description` | `string | null` | não | — |
| `role` | `string | null` | não | — |
| `is_factory` | `bool` | não | `false` |
| `model` | `ModelResponse | null` | não | — |
| `tools` | `object | null` | não | — |
| `sessions` | `object | null` | não | — |
| `knowledge` | `object | null` | não | — |
| `memory` | `object | null` | não | — |
| `reasoning` | `object | null` | não | — |
| `default_tools` | `object | null` | não | — |
| `system_message` | `object | null` | não | — |
| `extra_messages` | `object | null` | não | — |
| `response_settings` | `object | null` | não | — |
| `introduction` | `string | null` | não | — |
| `streaming` | `object | null` | não | — |
| `metadata` | `object | null` | não | — |
| `input_schema` | `object | null` | não | — |
| `factory_input_schema` | `object | null` | não | — |
| `is_component` | `bool` | não | `false` |
| `current_version` | `int | null` | não | — |
| `stage` | `string | null` | não | — |

Erros documentados: `400`, `401`, `404`, `500`

### `GET /agents/{agent_id}/runs/{run_id}`

Get Agent Run. Retrieve the status and output of an agent run. Use this to poll for background run completion.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `session_id` | query | `string` | sim | — |

**↓** `any`

Erros documentados: `400`, `401`, `404`, `500`

### `GET /agents/{agent_id}/runs/{run_id}/checkpoints`

List Agent Run Checkpoints. List FE-friendly continuation boundaries derived from the current stored run. No separate checkpoint table is used; entries are inferred from message-level checkpoint markers and the terminal end of the transcript.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `session_id` | query | `string` | sim | — |

**↓** `any`

Erros documentados: `400`, `401`, `404`, `500`

### `GET /agents/{agent_id}/runs/{run_id}/checkpoints/{message_index}`

Get Agent Run Checkpoint Snapshot. Return a derived run snapshot truncated at a message boundary. Use the returned message_index as `continue_from` when continuing this run.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `session_id` | query | `string` | sim | — |

**↓** `any`

Erros documentados: `400`, `401`, `404`, `500`

### `POST /agents/{agent_id}/runs/{run_id}/resume`

Resume Agent Run Stream. Resume an SSE stream for an agent run after disconnection.

**↑ body (`application/x-www-form-urlencoded`)**

| campo | tipo | obrig. | default |
|---|---|---|---|
| `last_event_index` | `int | null` | não | — |
| `session_id` | `string | null` | não | — |

**↓** `any`

**↓ (`text/event-stream`)** stream de eventos (ver seção SSE)

Erros documentados: `400`, `401`, `404`, `500`


## Teams

### `POST /teams/{team_id}/runs`

Create Team Run. Execute a team collaboration with multiple agents working together on a task.

**↑ body (`multipart/form-data`)**

| campo | tipo | obrig. | default |
|---|---|---|---|
| `message` | `string` | sim | — |
| `stream` | `bool` | não | `true` |
| `monitor` | `bool` | não | `true` |
| `session_id` | `string | null` | não | — |
| `user_id` | `string | null` | não | — |
| `files` | `string[] | null` | não | — |
| `files_metadata` | `string | null` | não | — |
| `version` | `int | null` | não | — |
| `background` | `bool` | não | `false` |
| `factory_input` | `string | null` | não | — |

**↓** `any`

**↓ (`text/event-stream`)** stream de eventos (ver seção SSE)

Erros documentados: `400`, `401`, `404`, `500`

### `GET /teams/{team_id}/runs`

List Team Runs. List runs for a team within a session, optionally filtered by status.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `session_id` | query | `string` | sim | — |
| `status` | query | `string | null` | não | — |

**↓** `any`

Erros documentados: `400`, `401`, `404`, `500`

### `POST /teams/{team_id}/runs/{run_id}/cancel`

Cancel Team Run. Cancel a currently executing team run. This will attempt to stop the team's execution gracefully.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `session_id` | query | `string | null` | não | — |

**↓** `any`

Erros documentados: `400`, `401`, `404`, `500`

### `POST /teams/{team_id}/runs/{run_id}/resume`

Resume Team Run Stream. Resume an SSE stream for a team run after disconnection.

**↑ body (`application/x-www-form-urlencoded`)**

| campo | tipo | obrig. | default |
|---|---|---|---|
| `last_event_index` | `int | null` | não | — |
| `session_id` | `string | null` | não | — |

**↓** `any`

**↓ (`text/event-stream`)** stream de eventos (ver seção SSE)

Erros documentados: `400`, `401`, `404`, `500`

### `POST /teams/{team_id}/runs/{run_id}/continue`

Continue Team Run. Continue a paused or incomplete team run with updated requirements.

**↑ body (`application/x-www-form-urlencoded`)**

| campo | tipo | obrig. | default |
|---|---|---|---|
| `requirements` | `string` | não | `""` |
| `input` | `string | null` | não | — |
| `continue_from` | `string` | não | `"end"` |
| `fork` | `bool` | não | `false` |
| `regenerate` | `bool` | não | `false` |
| `replace_original` | `bool | null` | não | — |
| `additional_instructions` | `string | null` | não | — |
| `session_id` | `string | null` | não | — |
| `user_id` | `string | null` | não | — |
| `stream` | `bool` | não | `true` |
| `background` | `bool` | não | `false` |

**↓** `any`

**↓ (`text/event-stream`)** stream de eventos (ver seção SSE)

Erros documentados: `400`, `401`, `404`, `500`, `403`, `409`

### `POST /teams/{team_id}/sessions/{session_id}/fork`

Fork Team Session. Deep-copy a team session into a new independent session. Every run is copied with a fresh ``run_id``; the new session has a fresh ``session_id``. The original is untouched. Use to explore alternative conversation paths without mutating the source.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `user_id` | query | `string | null` | não | — |

**↓** `any`

Erros documentados: `400`, `401`, `404`, `500`

### `GET /teams`

List All Teams. Retrieve a comprehensive list of all teams configured in this OS instance.

**↓** `TeamResponse[]`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `id` | `string | null` | não | — |
| `name` | `string | null` | não | — |
| `db_id` | `string | null` | não | — |
| `description` | `string | null` | não | — |
| `role` | `string | null` | não | — |
| `mode` | `string | null` | não | — |
| `model` | `ModelResponse | null` | não | — |
| `tools` | `object | null` | não | — |
| `sessions` | `object | null` | não | — |
| `knowledge` | `object | null` | não | — |
| `memory` | `object | null` | não | — |
| `reasoning` | `object | null` | não | — |
| `default_tools` | `object | null` | não | — |
| `system_message` | `object | null` | não | — |
| `response_settings` | `object | null` | não | — |
| `introduction` | `string | null` | não | — |
| `streaming` | `object | null` | não | — |
| `members` | `(AgentResponse | TeamResponse)[] | null` | não | — |
| `metadata` | `object | null` | não | — |
| `input_schema` | `object | null` | não | — |
| `is_factory` | `bool` | não | `false` |
| `factory_input_schema` | `object | null` | não | — |
| `is_component` | `bool` | não | `false` |
| `current_version` | `int | null` | não | — |
| `stage` | `string | null` | não | — |

Erros documentados: `400`, `401`, `404`, `500`

### `GET /teams/{team_id}`

Get Team Details. Retrieve detailed configuration and member information for a specific team.

**↓** `TeamResponse`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `id` | `string | null` | não | — |
| `name` | `string | null` | não | — |
| `db_id` | `string | null` | não | — |
| `description` | `string | null` | não | — |
| `role` | `string | null` | não | — |
| `mode` | `string | null` | não | — |
| `model` | `ModelResponse | null` | não | — |
| `tools` | `object | null` | não | — |
| `sessions` | `object | null` | não | — |
| `knowledge` | `object | null` | não | — |
| `memory` | `object | null` | não | — |
| `reasoning` | `object | null` | não | — |
| `default_tools` | `object | null` | não | — |
| `system_message` | `object | null` | não | — |
| `response_settings` | `object | null` | não | — |
| `introduction` | `string | null` | não | — |
| `streaming` | `object | null` | não | — |
| `members` | `(AgentResponse | TeamResponse)[] | null` | não | — |
| `metadata` | `object | null` | não | — |
| `input_schema` | `object | null` | não | — |
| `is_factory` | `bool` | não | `false` |
| `factory_input_schema` | `object | null` | não | — |
| `is_component` | `bool` | não | `false` |
| `current_version` | `int | null` | não | — |
| `stage` | `string | null` | não | — |

Erros documentados: `400`, `401`, `404`, `500`

### `GET /teams/{team_id}/runs/{run_id}`

Get Team Run. Retrieve the status and output of a team run. Use this to poll for background run completion.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `session_id` | query | `string` | sim | — |

**↓** `any`

Erros documentados: `400`, `401`, `404`, `500`

### `GET /teams/{team_id}/runs/{run_id}/checkpoints`

List Team Run Checkpoints. List FE-friendly continuation boundaries derived from the current stored team run. No separate checkpoint table is used; entries are inferred from message-level checkpoint markers and the terminal end of the transcript.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `session_id` | query | `string` | sim | — |

**↓** `any`

Erros documentados: `400`, `401`, `404`, `500`

### `GET /teams/{team_id}/runs/{run_id}/checkpoints/{message_index}`

Get Team Run Checkpoint Snapshot. Return a derived team run snapshot truncated at a message boundary. Use the returned message_index as `continue_from` when continuing this run.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `session_id` | query | `string` | sim | — |

**↓** `any`

Erros documentados: `400`, `401`, `404`, `500`


## Workflows

### `GET /workflows`

List All Workflows. Retrieve a comprehensive list of all workflows configured in this OS instance.

**↓** `WorkflowSummaryResponse[]`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `id` | `string | null` | não | — |
| `name` | `string | null` | não | — |
| `description` | `string | null` | não | — |
| `db_id` | `string | null` | não | — |
| `is_factory` | `bool` | não | `false` |
| `factory_input_schema` | `object | null` | não | — |
| `is_component` | `bool` | não | `false` |
| `current_version` | `int | null` | não | — |
| `stage` | `string | null` | não | — |

Erros documentados: `400`, `401`, `404`, `500`

### `GET /workflows/{workflow_id}`

Get Workflow Details. Retrieve detailed configuration and step information for a specific workflow.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `version` | query | `int | null` | não | — |

**↓** `WorkflowResponse`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `id` | `string | null` | não | — |
| `name` | `string | null` | não | — |
| `db_id` | `string | null` | não | — |
| `description` | `string | null` | não | — |
| `input_schema` | `object | null` | não | — |
| `steps` | `object[] | null` | não | — |
| `agent` | `AgentResponse | null` | não | — |
| `team` | `TeamResponse | null` | não | — |
| `metadata` | `object | null` | não | — |
| `workflow_agent` | `bool` | não | `false` |
| `is_factory` | `bool` | não | `false` |
| `factory_input_schema` | `object | null` | não | — |
| `is_component` | `bool` | não | `false` |
| `current_version` | `int | null` | não | — |
| `stage` | `string | null` | não | — |

Erros documentados: `400`, `401`, `404`, `500`

### `POST /workflows/{workflow_id}/runs`

Execute Workflow. Execute a workflow with the provided input data. Workflows can run in streaming or batch mode.

**↑ body (`application/x-www-form-urlencoded`)**

| campo | tipo | obrig. | default |
|---|---|---|---|
| `message` | `string` | sim | — |
| `stream` | `bool` | não | `true` |
| `background` | `bool` | não | `false` |
| `session_id` | `string | null` | não | — |
| `user_id` | `string | null` | não | — |
| `version` | `int | null` | não | — |
| `factory_input` | `string | null` | não | — |

**↓** `any`

**↓ (`text/event-stream`)** stream de eventos (ver seção SSE)

Erros documentados: `400`, `401`, `404`, `500`

### `GET /workflows/{workflow_id}/runs`

List Workflow Runs. List runs for a workflow within a session, optionally filtered by status.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `session_id` | query | `string` | sim | — |
| `status` | query | `string | null` | não | — |
| `factory_input` | query | `string | null` | não | — |

**↓** `any`

Erros documentados: `400`, `401`, `404`, `500`

### `POST /workflows/{workflow_id}/runs/{run_id}/continue`

Continue Workflow Run. Continue a paused workflow run with resolved requirements.

**↑ body (`application/x-www-form-urlencoded`)**

| campo | tipo | obrig. | default |
|---|---|---|---|
| `step_requirements` | `string` | não | `""` |
| `session_id` | `string | null` | não | — |
| `user_id` | `string | null` | não | — |
| `stream` | `bool` | não | `true` |
| `background` | `bool` | não | `false` |
| `factory_input` | `string | null` | não | — |

**↓** `any`

**↓ (`text/event-stream`)** stream de eventos (ver seção SSE)

Erros documentados: `400`, `401`, `404`, `500`, `409`

### `POST /workflows/{workflow_id}/runs/{run_id}/cancel`

Cancel Workflow Run. Cancel a currently executing workflow run, stopping all active steps and cleanup.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `session_id` | query | `string | null` | não | — |

**↓** `any`

Erros documentados: `400`, `401`, `404`, `500`

### `POST /workflows/{workflow_id}/runs/{run_id}/resume`

Resume Workflow Run Stream. Resume an SSE stream for a workflow run after disconnection.

**↑ body (`application/x-www-form-urlencoded`)**

| campo | tipo | obrig. | default |
|---|---|---|---|
| `last_event_index` | `int | null` | não | — |
| `session_id` | `string | null` | não | — |

**↓** `any`

**↓ (`text/event-stream`)** stream de eventos (ver seção SSE)

Erros documentados: `400`, `401`, `404`, `500`

### `GET /workflows/{workflow_id}/runs/{run_id}`

Get Workflow Run. Retrieve the status and output of a workflow run. Use this to poll for run completion.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `session_id` | query | `string` | sim | — |
| `factory_input` | query | `string | null` | não | — |

**↓** `any`

Erros documentados: `400`, `401`, `404`, `500`


## Sessions

### `GET /sessions`

List Sessions. Retrieve paginated list of sessions with filtering and sorting options. Supports filtering by session type (agent, team, workflow), component, user, and name. Sessions represent conversation histories and execution contexts.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `type` | query | `SessionType | null` | não | — |
| `component_id` | query | `string | null` | não | — |
| `user_id` | query | `string | null` | não | — |
| `session_name` | query | `string | null` | não | — |
| `limit` | query | `int | null` | não | `20` |
| `page` | query | `int | null` | não | `1` |
| `sort_by` | query | `string | null` | não | `"created_at"` |
| `sort_order` | query | `SortOrder | null` | não | `"desc"` |
| `db_id` | query | `string | null` | não | — |
| `table` | query | `string | null` | não | — |

**↓** `PaginatedResponse_SessionSchema_`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `data` | `SessionSchema[]` | sim | — |
| `meta` | `PaginationInfo` | sim | — |

Erros documentados: `400`, `401`, `404`, `500`

### `POST /sessions`

Create New Session. Create a new empty session with optional configuration. Useful for pre-creating sessions with specific session_state, metadata, or other properties before running any agent/team/workflow interactions. The session can later be used by providing its session_id in run requests.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `type` | query | `SessionType` | não | `"agent"` |
| `db_id` | query | `string | null` | não | — |

**↑ body**

Schema: `CreateSessionRequest`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `session_id` | `string | null` | não | — |
| `session_name` | `string | null` | não | — |
| `session_state` | `object | null` | não | — |
| `metadata` | `object | null` | não | — |
| `user_id` | `string | null` | não | — |
| `agent_id` | `string | null` | não | — |
| `team_id` | `string | null` | não | — |
| `workflow_id` | `string | null` | não | — |

**↓** `AgentSessionDetailSchema | TeamSessionDetailSchema | WorkflowSessionDetailSchema`

Erros documentados: `400`, `401`, `404`, `500`, `409`

### `DELETE /sessions`

Delete Multiple Sessions. Delete multiple sessions by their IDs in a single operation. This action cannot be undone and will permanently remove all specified sessions and their runs.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `user_id` | query | `string | null` | não | — |
| `db_id` | query | `string | null` | não | — |
| `table` | query | `string | null` | não | — |
| `delete_media` | query | `bool` | não | `false` |

**↑ body**

Schema: `DeleteSessionRequest`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `session_ids` | `string[]` | sim | — |
| `session_types` | `SessionType[]` | sim | — |

**↓** `204,400,401,404,422,500` sem body

Erros documentados: `204`, `400`, `401`, `404`, `500`

### `GET /sessions/{session_id}`

Get Session by ID. Retrieve detailed information about a specific session including metadata, configuration, and run history. Response schema varies based on session type (agent, team, or workflow).

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `type` | query | `SessionType | null` | não | — |
| `user_id` | query | `string | null` | não | — |
| `db_id` | query | `string | null` | não | — |
| `table` | query | `string | null` | não | — |

**↓** `AgentSessionDetailSchema | TeamSessionDetailSchema | WorkflowSessionDetailSchema`

Erros documentados: `400`, `401`, `404`, `500`

### `DELETE /sessions/{session_id}`

Delete Session. Permanently delete a specific session and all its associated runs. This action cannot be undone and will remove all conversation history.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `user_id` | query | `string | null` | não | — |
| `db_id` | query | `string | null` | não | — |
| `table` | query | `string | null` | não | — |
| `delete_media` | query | `bool` | não | `false` |

**↓** `204,400,401,404,422,500` sem body

Erros documentados: `204`, `400`, `401`, `404`, `500`

### `PATCH /sessions/{session_id}`

Update Session. Update session properties such as session_name, session_state, metadata, or summary. Use this endpoint to modify the session name, update state, add metadata, or update the session summary.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `type` | query | `SessionType | null` | não | — |
| `user_id` | query | `string | null` | não | — |
| `db_id` | query | `string | null` | não | — |
| `table` | query | `string | null` | não | — |

**↑ body**

Schema: `UpdateSessionRequest`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `session_name` | `string | null` | não | — |
| `session_state` | `object | null` | não | — |
| `metadata` | `object | null` | não | — |
| `summary` | `object | null` | não | — |

**↓** `AgentSessionDetailSchema | TeamSessionDetailSchema | WorkflowSessionDetailSchema`

Erros documentados: `400`, `401`, `404`, `500`

### `GET /sessions/{session_id}/runs`

Get Session Runs. Retrieve all runs (executions) for a specific session with optional timestamp filtering. Runs represent individual interactions or executions within a session. Response schema varies based on session type.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `type` | query | `SessionType | null` | não | — |
| `user_id` | query | `string | null` | não | — |
| `created_after` | query | `int | null` | não | — |
| `created_before` | query | `int | null` | não | — |
| `db_id` | query | `string | null` | não | — |
| `table` | query | `string | null` | não | — |

**↓** `(RunSchema | TeamRunSchema | WorkflowRunSchema)[]`

Erros documentados: `400`, `401`, `404`, `500`

### `GET /sessions/{session_id}/runs/{run_id}`

Get Run by ID. Retrieve a specific run by its ID from a session. Response schema varies based on the run type (agent run, team run, or workflow run).

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `type` | query | `SessionType | null` | não | — |
| `user_id` | query | `string | null` | não | — |
| `db_id` | query | `string | null` | não | — |
| `table` | query | `string | null` | não | — |

**↓** `RunSchema | TeamRunSchema | WorkflowRunSchema`

Erros documentados: `400`, `401`, `404`, `500`

### `POST /sessions/{session_id}/rename`

Rename Session. Update the name of an existing session. Useful for organizing and categorizing sessions with meaningful names for better identification and management.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `type` | query | `SessionType | null` | não | — |
| `user_id` | query | `string | null` | não | — |
| `db_id` | query | `string | null` | não | — |
| `table` | query | `string | null` | não | — |

**↑ body**

| campo | tipo | obrig. | default |
|---|---|---|---|
| `session_name` | `string` | sim | — |

**↓** `AgentSessionDetailSchema | TeamSessionDetailSchema | WorkflowSessionDetailSchema`

Erros documentados: `400`, `401`, `404`, `500`


## Media

### `GET /sessions/{session_id}/media/{storage_key}`

Fetch stored media for a session. Stream (or, with redirect=true, redirect to a freshly-signed URL for) a piece of media stored in external media storage. Scoped to the caller's session ownership; the storage_key must belong to the session.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `type` | query | `SessionType | null` | não | — |
| `user_id` | query | `string | null` | não | — |
| `db_id` | query | `string | null` | não | — |
| `table` | query | `string | null` | não | — |
| `redirect` | query | `bool` | não | `false` |

**↓** `any`

**↓ (`application/octet-stream`)** `binary`

Erros documentados: `401`, `404`, `500`, `501`, `503`


## Memory

### `POST /memories`

Create Memory. Create a new user memory with content and associated topics. Memories are used to store contextual information for users across conversations.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `db_id` | query | `string | null` | não | — |
| `table` | query | `string | null` | não | — |

**↑ body**

Schema: `UserMemoryCreateSchema`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `memory` | `string` | sim | — |
| `user_id` | `string | null` | não | — |
| `topics` | `string[] | null` | não | — |

**↓** `UserMemorySchema`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `memory_id` | `string` | sim | — |
| `memory` | `string` | sim | — |
| `topics` | `string[] | null` | não | — |
| `agent_id` | `string | null` | não | — |
| `team_id` | `string | null` | não | — |
| `user_id` | `string | null` | não | — |
| `updated_at` | `string | null` | não | — |

Erros documentados: `400`, `401`, `404`, `500`

### `DELETE /memories`

Delete Multiple Memories. Delete multiple user memories by their IDs in a single operation. This action cannot be undone and all specified memories will be permanently removed.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `db_id` | query | `string | null` | não | — |
| `table` | query | `string | null` | não | — |

**↑ body**

Schema: `DeleteMemoriesRequest`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `memory_ids` | `string[]` | sim | — |
| `user_id` | `string | null` | não | — |

**↓** `204,400,401,404,422,500` sem body

Erros documentados: `204`, `400`, `401`, `404`, `500`

### `GET /memories`

List Memories. Retrieve paginated list of user memories with filtering and search capabilities. Filter by user, agent, team, topics, or search within memory content.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `user_id` | query | `string | null` | não | — |
| `agent_id` | query | `string | null` | não | — |
| `team_id` | query | `string | null` | não | — |
| `search_content` | query | `string | null` | não | — |
| `limit` | query | `int | null` | não | `20` |
| `page` | query | `int | null` | não | `1` |
| `sort_by` | query | `string | null` | não | `"updated_at"` |
| `sort_order` | query | `SortOrder | null` | não | `"desc"` |
| `db_id` | query | `string | null` | não | — |
| `table` | query | `string | null` | não | — |
| `topics` | query | `string[] | null` | não | — |

**↓** `PaginatedResponse_UserMemorySchema_`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `data` | `UserMemorySchema[]` | sim | — |
| `meta` | `PaginationInfo` | sim | — |

Erros documentados: `400`, `401`, `404`, `500`

### `DELETE /memories/{memory_id}`

Delete Memory. Permanently delete a specific user memory. This action cannot be undone.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `user_id` | query | `string | null` | não | — |
| `db_id` | query | `string | null` | não | — |
| `table` | query | `string | null` | não | — |

**↓** `204,400,401,404,422,500` sem body

Erros documentados: `204`, `400`, `401`, `404`, `500`

### `GET /memories/{memory_id}`

Get Memory by ID. Retrieve detailed information about a specific user memory by its ID.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `user_id` | query | `string | null` | não | — |
| `db_id` | query | `string | null` | não | — |
| `table` | query | `string | null` | não | — |

**↓** `UserMemorySchema`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `memory_id` | `string` | sim | — |
| `memory` | `string` | sim | — |
| `topics` | `string[] | null` | não | — |
| `agent_id` | `string | null` | não | — |
| `team_id` | `string | null` | não | — |
| `user_id` | `string | null` | não | — |
| `updated_at` | `string | null` | não | — |

Erros documentados: `400`, `401`, `404`, `500`

### `PATCH /memories/{memory_id}`

Update Memory. Update an existing user memory's content and topics. Replaces the entire memory content and topic list with the provided values.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `db_id` | query | `string | null` | não | — |
| `table` | query | `string | null` | não | — |

**↑ body**

Schema: `UserMemoryCreateSchema`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `memory` | `string` | sim | — |
| `user_id` | `string | null` | não | — |
| `topics` | `string[] | null` | não | — |

**↓** `UserMemorySchema`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `memory_id` | `string` | sim | — |
| `memory` | `string` | sim | — |
| `topics` | `string[] | null` | não | — |
| `agent_id` | `string | null` | não | — |
| `team_id` | `string | null` | não | — |
| `user_id` | `string | null` | não | — |
| `updated_at` | `string | null` | não | — |

Erros documentados: `400`, `401`, `404`, `500`

### `GET /memory_topics`

Get Memory Topics. Retrieve all unique topics associated with memories in the system. Useful for filtering and categorizing memories by topic.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `user_id` | query | `string | null` | não | — |
| `db_id` | query | `string | null` | não | — |
| `table` | query | `string | null` | não | — |

**↓** `string[]`

Erros documentados: `400`, `401`, `404`, `500`

### `GET /user_memory_stats`

Get User Memory Statistics. Retrieve paginated statistics about memory usage by user. Provides insights into user engagement and memory distribution across users.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `limit` | query | `int | null` | não | `20` |
| `page` | query | `int | null` | não | `1` |
| `user_id` | query | `string | null` | não | — |
| `db_id` | query | `string | null` | não | — |
| `table` | query | `string | null` | não | — |

**↓** `PaginatedResponse_UserStatsSchema_`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `data` | `UserStatsSchema[]` | sim | — |
| `meta` | `PaginationInfo` | sim | — |

Erros documentados: `400`, `401`, `404`, `500`

### `POST /optimize-memories`

Optimize User Memories. Optimize all memories for a given user using the default summarize strategy. This operation combines all memories into a single comprehensive summary, achieving maximum token reduction while preserving all key information. To use a custom model, specify the model parameter in 'provider:model_id' format (e.g., 'openai:gpt-4o-mini', 'anthropic:claude-3-5-sonnet-20241022'). If not specified, uses MemoryManager's default model (gpt-4o). Set apply=false to preview optimization results without saving to database.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `db_id` | query | `string | null` | não | — |
| `table` | query | `string | null` | não | — |

**↑ body**

Schema: `OptimizeMemoriesRequest`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `user_id` | `string` | sim | — |
| `model` | `string | null` | não | — |
| `apply` | `bool` | não | `true` |

**↓** `OptimizeMemoriesResponse`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `memories` | `UserMemorySchema[]` | sim | — |
| `memories_before` | `int` | sim | — |
| `memories_after` | `int` | sim | — |
| `tokens_before` | `int` | sim | — |
| `tokens_after` | `int` | sim | — |
| `tokens_saved` | `int` | sim | — |
| `reduction_percentage` | `number` | sim | — |

Erros documentados: `400`, `401`, `404`, `500`


## Learnings

### `GET /learnings`

List Learnings. List learning records with pagination and optional filters. For a scoped (non-admin) caller with user isolation enabled, results are bound to that user and also include records with no owner (`user_id IS NULL`) — this covers global, agent, team, session, and entity-scoped learnings; passing a `user_id` that differs from the caller is rejected with 403. Admins and unscoped callers see all records (optionally filtered by `user_id`).

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `learning_type` | query | `string | null` | não | — |
| `user_id` | query | `string | null` | não | — |
| `agent_id` | query | `string | null` | não | — |
| `team_id` | query | `string | null` | não | — |
| `session_id` | query | `string | null` | não | — |
| `namespace` | query | `string | null` | não | — |
| `entity_id` | query | `string | null` | não | — |
| `entity_type` | query | `string | null` | não | — |
| `limit` | query | `int` | não | `100` |
| `page` | query | `int` | não | `1` |
| `sort_by` | query | `string | null` | não | — |
| `sort_order` | query | `SortOrder | null` | não | `"desc"` |
| `db_id` | query | `string | null` | não | — |
| `table` | query | `string | null` | não | — |

**↓** `PaginatedResponse_LearningResponse_`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `data` | `LearningResponse[]` | sim | — |
| `meta` | `PaginationInfo` | sim | — |

Erros documentados: `400`, `401`, `404`, `500`

### `POST /learnings`

Create Learning. Create a new learning record. For the identity-keyed learning types (`user_profile`, `user_memory`, `session_context`, `entity_memory`) the record id is derived deterministically from the identity fields so it reconciles with what the agent reads/writes — provide those fields (else 422), and if a record already exists the request is rejected with 409 (use PATCH to update it). Other types get a generated id. For a scoped (non-admin) caller, the body's `user_id` must be omitted/null or match the caller (mismatch → 403); admins and unscoped callers may set any `user_id`. An `entity_memory` record whose body omits `namespace` is stored under the `global` default; the endpoint cannot see how a given store is configured, so a caller writing for a store running with `namespace="user"` or a custom namespace must pass `namespace` explicitly or the record will not be visible to it.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `db_id` | query | `string | null` | não | — |
| `table` | query | `string | null` | não | — |

**↑ body**

Schema: `LearningCreate`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `learning_type` | `string` | sim | — |
| `content` | `object` | sim | — |
| `namespace` | `string | null` | não | — |
| `user_id` | `string | null` | não | — |
| `agent_id` | `string | null` | não | — |
| `team_id` | `string | null` | não | — |
| `session_id` | `string | null` | não | — |
| `entity_id` | `string | null` | não | — |
| `entity_type` | `string | null` | não | — |
| `metadata` | `object | null` | não | — |

**↓** `LearningResponse`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `learning_id` | `string` | sim | — |
| `learning_type` | `string` | sim | — |
| `namespace` | `string | null` | não | — |
| `user_id` | `string | null` | não | — |
| `agent_id` | `string | null` | não | — |
| `team_id` | `string | null` | não | — |
| `session_id` | `string | null` | não | — |
| `entity_id` | `string | null` | não | — |
| `entity_type` | `string | null` | não | — |
| `content` | `object | null` | não | — |
| `metadata` | `object | null` | não | — |
| `created_at` | `int | null` | não | — |
| `updated_at` | `int | null` | não | — |

Erros documentados: `400`, `401`, `404`, `500`

### `GET /learnings/users`

List Learning Users. List the users that own learning records, with a per-user count and last-updated timestamp. Intended as the entry point for a per-user view: list users here, then drill into a single user's learnings via `GET /learnings?user_id=...`. Records with no owner (`user_id IS NULL`) are excluded. Pass `learning_type` to restrict the grouping to a single store (e.g. `user_profile` or `user_memory`). For a scoped (non-admin) caller results are bound to that user; an explicit `user_id` that differs is rejected with 403. Admins and unscoped callers list all users. Sortable by `user_id` or `last_learning_updated_at` (the default).

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `learning_type` | query | `string | null` | não | — |
| `user_id` | query | `string | null` | não | — |
| `limit` | query | `int` | não | `20` |
| `page` | query | `int` | não | `1` |
| `sort_by` | query | `string | null` | não | — |
| `sort_order` | query | `SortOrder | null` | não | `"desc"` |
| `db_id` | query | `string | null` | não | — |
| `table` | query | `string | null` | não | — |

**↓** `PaginatedResponse_LearningUserStats_`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `data` | `LearningUserStats[]` | sim | — |
| `meta` | `PaginationInfo` | sim | — |

Erros documentados: `400`, `401`, `404`, `500`

### `DELETE /learnings/users/{user_id}`

Delete Learning User. Delete the learning records owned by a user. By default removes every learning type backed by the agno_learnings table (user_profile, user_memory, and any user-scoped entity records); pass `learning_type` to restrict deletion to a single store. Records with no owner (`user_id IS NULL`) are not affected. For a scoped (non-admin) caller, only their own learnings may be deleted; a different `user_id` is rejected with 403. Admins and unscoped callers may delete any user's learnings. Returns 204 even if the user had no matching records.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `learning_type` | query | `string | null` | não | — |
| `db_id` | query | `string | null` | não | — |
| `table` | query | `string | null` | não | — |

**↓** `204,400,401,404,422,500` sem body

Erros documentados: `204`, `400`, `401`, `404`, `500`

### `GET /learnings/{learning_id}`

Get Learning. Retrieve a single learning record by its ID.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `db_id` | query | `string | null` | não | — |
| `table` | query | `string | null` | não | — |

**↓** `LearningResponse`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `learning_id` | `string` | sim | — |
| `learning_type` | `string` | sim | — |
| `namespace` | `string | null` | não | — |
| `user_id` | `string | null` | não | — |
| `agent_id` | `string | null` | não | — |
| `team_id` | `string | null` | não | — |
| `session_id` | `string | null` | não | — |
| `entity_id` | `string | null` | não | — |
| `entity_type` | `string | null` | não | — |
| `content` | `object | null` | não | — |
| `metadata` | `object | null` | não | — |
| `created_at` | `int | null` | não | — |
| `updated_at` | `int | null` | não | — |

Erros documentados: `400`, `401`, `404`, `500`

### `PATCH /learnings/{learning_id}`

Update Learning. Update a learning record. Only `content` and `metadata` may be modified; identity fields (user_id, agent_id, team_id, etc.) are immutable. Provided fields fully replace the existing values. Records with no owner (`user_id IS NULL` — shared agent/team/session/entity learnings) are readable by any caller but may only be modified by an admin.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `db_id` | query | `string | null` | não | — |
| `table` | query | `string | null` | não | — |

**↑ body**

Schema: `LearningUpdate`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `content` | `object | null` | não | — |
| `metadata` | `object | null` | não | — |

**↓** `LearningResponse`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `learning_id` | `string` | sim | — |
| `learning_type` | `string` | sim | — |
| `namespace` | `string | null` | não | — |
| `user_id` | `string | null` | não | — |
| `agent_id` | `string | null` | não | — |
| `team_id` | `string | null` | não | — |
| `session_id` | `string | null` | não | — |
| `entity_id` | `string | null` | não | — |
| `entity_type` | `string | null` | não | — |
| `content` | `object | null` | não | — |
| `metadata` | `object | null` | não | — |
| `created_at` | `int | null` | não | — |
| `updated_at` | `int | null` | não | — |

Erros documentados: `400`, `401`, `404`, `500`

### `DELETE /learnings/{learning_id}`

Delete Learning. Permanently delete a learning record by its ID. Records with no owner (`user_id IS NULL` — shared agent/team/session/entity learnings) may only be deleted by an admin.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `db_id` | query | `string | null` | não | — |
| `table` | query | `string | null` | não | — |

**↓** `204,400,401,404,422,500` sem body

Erros documentados: `204`, `400`, `401`, `404`, `500`


## Knowledge

### `POST /knowledge/content`

Upload Content. Upload content to the knowledge base. Supports file uploads, text content, or URLs. Content is processed asynchronously in the background. Supports custom readers and chunking strategies.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `db_id` | query | `string | null` | não | — |
| `knowledge_id` | query | `string | null` | não | — |

**↑ body (`multipart/form-data`)**

| campo | tipo | obrig. | default |
|---|---|---|---|
| `name` | `string | null` | não | — |
| `description` | `string | null` | não | — |
| `url` | `string | null` | não | — |
| `metadata` | `string | null` | não | — |
| `file` | `string | null` | não | — |
| `text_content` | `string | null` | não | — |
| `reader_id` | `string | null` | não | — |
| `chunker` | `string | null` | não | — |
| `chunk_size` | `int | null` | não | — |
| `chunk_overlap` | `int | null` | não | — |

**↓** `202,400,401,404,422,500,503` sem body

Erros documentados: `202`, `400`, `401`, `404`, `500`, `503`

### `GET /knowledge/content`

List Content. Retrieve paginated list of all content in the knowledge base with filtering and sorting options. Filter by status, content type, or metadata properties.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `limit` | query | `int | null` | não | `20` |
| `page` | query | `int | null` | não | `1` |
| `sort_by` | query | `string | null` | não | `"created_at"` |
| `sort_order` | query | `SortOrder | null` | não | `"desc"` |
| `db_id` | query | `string | null` | não | — |
| `knowledge_id` | query | `string | null` | não | — |
| `parent_id` | query | `string | null` | não | — |

**↓** `PaginatedResponse_ContentResponseSchema_`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `data` | `ContentResponseSchema[]` | sim | — |
| `meta` | `PaginationInfo` | sim | — |

Erros documentados: `400`, `401`, `404`, `500`, `503`

### `DELETE /knowledge/content`

Delete All Content. Permanently remove all content from the knowledge base. This is a destructive operation that cannot be undone. Use with extreme caution.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `db_id` | query | `string | null` | não | — |
| `knowledge_id` | query | `string | null` | não | — |

**↓** `any`

Erros documentados: `400`, `401`, `404`, `500`, `503`

### `POST /knowledge/remote-content`

Upload Remote Content. Upload content from a remote source (S3, GCS, SharePoint, GitHub) to the knowledge base. Content is processed asynchronously in the background.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `db_id` | query | `string | null` | não | — |
| `knowledge_id` | query | `string | null` | não | — |

**↑ body (`application/x-www-form-urlencoded`)**

| campo | tipo | obrig. | default |
|---|---|---|---|
| `config_id` | `string` | sim | — |
| `path` | `string` | sim | — |
| `source_params` | `string | null` | não | — |
| `name` | `string | null` | não | — |
| `description` | `string | null` | não | — |
| `metadata` | `string | null` | não | — |
| `reader_id` | `string | null` | não | — |
| `chunker` | `string | null` | não | — |
| `chunk_size` | `int | null` | não | — |
| `chunk_overlap` | `int | null` | não | — |

**↓** `202,400,401,404,422,500,503` sem body

Erros documentados: `202`, `400`, `401`, `404`, `500`, `503`

### `PATCH /knowledge/content/{content_id}`

Update Content. Update content properties such as name, description, metadata, or processing configuration. Allows modification of existing content without re-uploading.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `db_id` | query | `string | null` | não | — |
| `knowledge_id` | query | `string | null` | não | — |

**↑ body (`application/x-www-form-urlencoded`)**

| campo | tipo | obrig. | default |
|---|---|---|---|
| `name` | `string | null` | não | — |
| `description` | `string | null` | não | — |
| `metadata` | `string | null` | não | — |
| `reader_id` | `string | null` | não | — |

**↓** `ContentResponseSchema`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `id` | `string` | sim | — |
| `name` | `string | null` | não | — |
| `description` | `string | null` | não | — |
| `type` | `string | null` | não | — |
| `size` | `string | null` | não | — |
| `linked_to` | `string | null` | não | — |
| `metadata` | `object | null` | não | — |
| `access_count` | `int | null` | não | — |
| `status` | `ContentStatus | null` | não | — |
| `status_message` | `string | null` | não | — |
| `created_at` | `string | null` | não | — |
| `updated_at` | `string | null` | não | — |

Erros documentados: `400`, `401`, `404`, `500`, `503`

### `GET /knowledge/content/{content_id}`

Get Content by ID. Retrieve detailed information about a specific content item including processing status and metadata.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `db_id` | query | `string | null` | não | — |
| `knowledge_id` | query | `string | null` | não | — |

**↓** `ContentResponseSchema`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `id` | `string` | sim | — |
| `name` | `string | null` | não | — |
| `description` | `string | null` | não | — |
| `type` | `string | null` | não | — |
| `size` | `string | null` | não | — |
| `linked_to` | `string | null` | não | — |
| `metadata` | `object | null` | não | — |
| `access_count` | `int | null` | não | — |
| `status` | `ContentStatus | null` | não | — |
| `status_message` | `string | null` | não | — |
| `created_at` | `string | null` | não | — |
| `updated_at` | `string | null` | não | — |

Erros documentados: `400`, `401`, `404`, `500`, `503`

### `DELETE /knowledge/content/{content_id}`

Delete Content by ID. Permanently remove a specific content item from the knowledge base. This action cannot be undone.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `db_id` | query | `string | null` | não | — |
| `knowledge_id` | query | `string | null` | não | — |

**↓** `ContentResponseSchema`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `id` | `string` | sim | — |
| `name` | `string | null` | não | — |
| `description` | `string | null` | não | — |
| `type` | `string | null` | não | — |
| `size` | `string | null` | não | — |
| `linked_to` | `string | null` | não | — |
| `metadata` | `object | null` | não | — |
| `access_count` | `int | null` | não | — |
| `status` | `ContentStatus | null` | não | — |
| `status_message` | `string | null` | não | — |
| `created_at` | `string | null` | não | — |
| `updated_at` | `string | null` | não | — |

Erros documentados: `400`, `401`, `404`, `500`, `503`

### `POST /knowledge/content/{content_id}/refresh`

Refresh Content. Re-ingest a URL-sourced content row from its source. For a site row this refreshes changed pages, retries failed ones, and removes pages that left the site.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `db_id` | query | `string | null` | não | — |
| `knowledge_id` | query | `string | null` | não | — |

**↓** `202,400,401,404,422,500,503` sem body

Erros documentados: `202`, `400`, `401`, `404`, `500`, `503`

### `GET /knowledge/content/{content_id}/status`

Get Content Status. Retrieve the current processing status of a content item. Useful for monitoring asynchronous content processing progress and identifying any processing errors.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `db_id` | query | `string | null` | não | — |
| `knowledge_id` | query | `string | null` | não | — |

**↓** `ContentStatusResponse`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `id` | `string | null` | não | — |
| `status` | `ContentStatus` | sim | — |
| `status_message` | `string` | não | `""` |

Erros documentados: `400`, `401`, `404`, `500`, `503`

### `POST /knowledge/search`

Search Knowledge. Search the knowledge base for relevant documents using query, filters and search type.

**↑ body**

Schema: `VectorSearchRequestSchema`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `query` | `string` | sim | — |
| `db_id` | `string | null` | não | — |
| `knowledge_id` | `string | null` | não | — |
| `vector_db_ids` | `string[] | null` | não | — |
| `search_type` | `string | null` | não | — |
| `max_results` | `int | null` | não | — |
| `filters` | `object | null` | não | — |
| `meta` | `Meta | null` | não | — |

**↓** `PaginatedResponse_VectorSearchResult_`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `data` | `VectorSearchResult[]` | sim | — |
| `meta` | `PaginationInfo` | sim | — |

Erros documentados: `400`, `401`, `404`, `500`, `503`

### `GET /knowledge/config`

Get Config. Retrieve available readers, chunkers, and configuration options for content processing. This endpoint provides metadata about supported file types, processing strategies, and filters.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `db_id` | query | `string | null` | não | — |
| `knowledge_id` | query | `string | null` | não | — |

**↓** `ConfigResponseSchema`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `readers` | `Record<string, ReaderSchema> | null` | não | — |
| `readersForType` | `Record<string, string[]> | null` | não | — |
| `chunkers` | `Record<string, ChunkerSchema> | null` | não | — |
| `filters` | `string[] | null` | não | — |
| `vector_dbs` | `VectorDbSchema[] | null` | não | — |
| `remote_content_sources` | `RemoteContentSourceSchema[] | null` | não | — |
| `unavailable_readers` | `Record<string, UnavailableReaderSchema> | null` | não | — |
| `unavailable_chunkers` | `Record<string, UnavailableChunkerSchema> | null` | não | — |

Erros documentados: `400`, `401`, `404`, `500`, `503`

### `GET /knowledge/{knowledge_id}/sources`

List Content Sources. List all registered content sources (S3, GCS, SharePoint, GitHub) for the knowledge base.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `db_id` | query | `string | null` | não | — |

**↓** `RemoteContentSourceSchema[]`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `id` | `string` | sim | — |
| `name` | `string` | sim | — |
| `type` | `string` | sim | — |
| `metadata` | `object | null` | não | — |
| `prefix` | `string | null` | não | — |

Erros documentados: `400`, `401`, `404`, `500`, `503`

### `GET /knowledge/{knowledge_id}/sources/{source_id}/files`

List Files in Source. List available files and folders in a specific content source. Supports pagination and folder navigation.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `prefix` | query | `string | null` | não | — |
| `limit` | query | `int` | não | `100` |
| `page` | query | `int` | não | `1` |
| `delimiter` | query | `string` | não | `"/"` |
| `db_id` | query | `string | null` | não | — |

**↓** `SourceFilesResponseSchema`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `source_id` | `string` | sim | — |
| `source_name` | `string` | sim | — |
| `prefix` | `string | null` | não | — |
| `folders` | `SourceFolderSchema[]` | não | — |
| `files` | `SourceFileSchema[]` | não | — |
| `meta` | `PaginationInfo` | sim | — |

Erros documentados: `400`, `401`, `404`, `500`, `503`


## Components

### `GET /components`

List Components. Retrieve a paginated list of components with optional filtering by type.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `component_type` | query | `ComponentType | null` | não | — |
| `page` | query | `int` | não | `1` |
| `limit` | query | `int` | não | `20` |
| `include_deleted` | query | `bool` | não | `false` |

**↓** `PaginatedResponse_ComponentResponse_`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `data` | `ComponentResponse[]` | sim | — |
| `meta` | `PaginationInfo` | sim | — |

Erros documentados: `400`, `401`, `404`, `500`

### `POST /components`

Create Component. Create a new component (agent, team, or workflow) with initial config.

**↑ body**

Schema: `ComponentCreate`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `name` | `string` | sim | — |
| `component_id` | `string | null` | não | — |
| `component_type` | `ComponentType` | sim | — |
| `description` | `string | null` | não | — |
| `metadata` | `object | null` | não | — |
| `config` | `object | null` | não | — |
| `label` | `string | null` | não | — |
| `stage` | `string` | não | `"draft"` |
| `notes` | `string | null` | não | — |
| `set_current` | `bool` | não | `true` |

**↓** `ComponentResponse`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `component_id` | `string` | sim | — |
| `component_type` | `ComponentType` | sim | — |
| `name` | `string | null` | não | — |
| `user_id` | `string | null` | não | — |
| `description` | `string | null` | não | — |
| `current_version` | `int | null` | não | — |
| `metadata` | `object | null` | não | — |
| `created_at` | `int` | sim | — |
| `updated_at` | `int | null` | não | — |
| `deleted_at` | `int | null` | não | — |

Erros documentados: `400`, `401`, `404`, `500`

### `GET /components/{component_id}`

Get Component. Retrieve a component by ID.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `include_deleted` | query | `bool` | não | `false` |

**↓** `ComponentResponse`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `component_id` | `string` | sim | — |
| `component_type` | `ComponentType` | sim | — |
| `name` | `string | null` | não | — |
| `user_id` | `string | null` | não | — |
| `description` | `string | null` | não | — |
| `current_version` | `int | null` | não | — |
| `metadata` | `object | null` | não | — |
| `created_at` | `int` | sim | — |
| `updated_at` | `int | null` | não | — |
| `deleted_at` | `int | null` | não | — |

Erros documentados: `400`, `401`, `404`, `500`

### `PATCH /components/{component_id}`

Update Component. Partially update a component by ID.

**↑ body**

Schema: `ComponentUpdate`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `name` | `string | null` | não | — |
| `description` | `string | null` | não | — |
| `component_type` | `string | null` | não | — |
| `metadata` | `object | null` | não | — |
| `current_version` | `int | null` | não | — |
| `guard` | `ComponentGuard | null` | não | — |

**↓** `ComponentResponse`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `component_id` | `string` | sim | — |
| `component_type` | `ComponentType` | sim | — |
| `name` | `string | null` | não | — |
| `user_id` | `string | null` | não | — |
| `description` | `string | null` | não | — |
| `current_version` | `int | null` | não | — |
| `metadata` | `object | null` | não | — |
| `created_at` | `int` | sim | — |
| `updated_at` | `int | null` | não | — |
| `deleted_at` | `int | null` | não | — |

Erros documentados: `400`, `401`, `404`, `500`

### `DELETE /components/{component_id}`

Delete Component. Delete a component by ID.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `expected_current_version` | query | `int | null` | não | — |

**↑ body**

_(vazio)_

**↓** `204,400,401,404,422,500` sem body

Erros documentados: `204`, `400`, `401`, `404`, `500`

### `POST /components/{component_id}/restore`

Restore Component. Restore an archived (soft-deleted) component by ID.

**↓** `ComponentResponse`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `component_id` | `string` | sim | — |
| `component_type` | `ComponentType` | sim | — |
| `name` | `string | null` | não | — |
| `user_id` | `string | null` | não | — |
| `description` | `string | null` | não | — |
| `current_version` | `int | null` | não | — |
| `metadata` | `object | null` | não | — |
| `created_at` | `int` | sim | — |
| `updated_at` | `int | null` | não | — |
| `deleted_at` | `int | null` | não | — |

Erros documentados: `400`, `401`, `404`, `500`

### `GET /components/{component_id}/configs`

List Configs. List all configs for a component.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `include_config` | query | `bool` | não | `true` |

**↓** `ComponentConfigResponse[]`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `component_id` | `string` | sim | — |
| `version` | `int` | sim | — |
| `label` | `string | null` | não | — |
| `stage` | `string` | sim | — |
| `config` | `object` | sim | — |
| `notes` | `string | null` | não | — |
| `created_at` | `int` | sim | — |
| `updated_at` | `int | null` | não | — |

Erros documentados: `400`, `401`, `404`, `500`

### `POST /components/{component_id}/configs`

Create Config Version. Create a new config version for a component.

**↑ body**

Schema: `ConfigCreate`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `config` | `object` | sim | — |
| `version` | `int | null` | não | — |
| `label` | `string | null` | não | — |
| `stage` | `string` | não | `"draft"` |
| `notes` | `string | null` | não | — |
| `links` | `object[] | null` | não | — |
| `set_current` | `bool` | não | `true` |
| `guard` | `ComponentGuard | null` | não | — |

**↓** `ComponentConfigResponse`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `component_id` | `string` | sim | — |
| `version` | `int` | sim | — |
| `label` | `string | null` | não | — |
| `stage` | `string` | sim | — |
| `config` | `object` | sim | — |
| `notes` | `string | null` | não | — |
| `created_at` | `int` | sim | — |
| `updated_at` | `int | null` | não | — |

Erros documentados: `400`, `401`, `404`, `500`

### `PATCH /components/{component_id}/configs/{version}`

Update Draft Config. Update an existing draft config. Cannot update published configs.

**↑ body**

Schema: `ConfigUpdate`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `config` | `object | null` | não | — |
| `label` | `string | null` | não | — |
| `stage` | `string | null` | não | — |
| `notes` | `string | null` | não | — |
| `links` | `object[] | null` | não | — |
| `guard` | `ComponentGuard | null` | não | — |

**↓** `ComponentConfigResponse`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `component_id` | `string` | sim | — |
| `version` | `int` | sim | — |
| `label` | `string | null` | não | — |
| `stage` | `string` | sim | — |
| `config` | `object` | sim | — |
| `notes` | `string | null` | não | — |
| `created_at` | `int` | sim | — |
| `updated_at` | `int | null` | não | — |

Erros documentados: `400`, `401`, `404`, `500`

### `GET /components/{component_id}/configs/{version}`

Get Config Version. Get a specific config version by number.

**↓** `ComponentConfigResponse`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `component_id` | `string` | sim | — |
| `version` | `int` | sim | — |
| `label` | `string | null` | não | — |
| `stage` | `string` | sim | — |
| `config` | `object` | sim | — |
| `notes` | `string | null` | não | — |
| `created_at` | `int` | sim | — |
| `updated_at` | `int | null` | não | — |

Erros documentados: `400`, `401`, `404`, `500`

### `DELETE /components/{component_id}/configs/{version}`

Delete Config Version. Delete a specific draft config version. Cannot delete published or current configs.

**↓** `204,400,401,404,422,500` sem body

Erros documentados: `204`, `400`, `401`, `404`, `500`

### `GET /components/{component_id}/configs/current`

Get Current Config. Get the current config version for a component.

**↓** `ComponentConfigResponse`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `component_id` | `string` | sim | — |
| `version` | `int` | sim | — |
| `label` | `string | null` | não | — |
| `stage` | `string` | sim | — |
| `config` | `object` | sim | — |
| `notes` | `string | null` | não | — |
| `created_at` | `int` | sim | — |
| `updated_at` | `int | null` | não | — |

Erros documentados: `400`, `401`, `404`, `500`

### `POST /components/{component_id}/configs/{version}/set-current`

Set Current Config Version. Set a published config version as current (for rollback).

**↑ body**

_(vazio)_

**↓** `ComponentResponse`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `component_id` | `string` | sim | — |
| `component_type` | `ComponentType` | sim | — |
| `name` | `string | null` | não | — |
| `user_id` | `string | null` | não | — |
| `description` | `string | null` | não | — |
| `current_version` | `int | null` | não | — |
| `metadata` | `object | null` | não | — |
| `created_at` | `int` | sim | — |
| `updated_at` | `int | null` | não | — |
| `deleted_at` | `int | null` | não | — |

Erros documentados: `400`, `401`, `404`, `500`


## Schedules

### `GET /schedules`

List Schedules. 

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `enabled` | query | `bool | null` | não | — |
| `limit` | query | `int` | não | `100` |
| `page` | query | `int` | não | `1` |

**↓** `PaginatedResponse_ScheduleResponse_`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `data` | `ScheduleResponse[]` | sim | — |
| `meta` | `PaginationInfo` | sim | — |

### `POST /schedules`

Create Schedule. 

**↑ body**

Schema: `ScheduleCreate`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `name` | `string` | sim | — |
| `cron_expr` | `string` | sim | — |
| `endpoint` | `string` | sim | — |
| `method` | `string` | não | `"POST"` |
| `description` | `string | null` | não | — |
| `payload` | `object | null` | não | — |
| `timezone` | `string` | não | `"UTC"` |
| `timeout_seconds` | `int` | não | `3600` |
| `max_retries` | `int` | não | `0` |
| `retry_delay_seconds` | `int` | não | `60` |

**↓** `ScheduleResponse`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `id` | `string` | sim | — |
| `user_id` | `string | null` | não | — |
| `name` | `string` | sim | — |
| `description` | `string | null` | não | — |
| `method` | `string` | sim | — |
| `endpoint` | `string` | sim | — |
| `payload` | `object | null` | não | — |
| `cron_expr` | `string` | sim | — |
| `timezone` | `string` | sim | — |
| `timeout_seconds` | `int` | sim | — |
| `max_retries` | `int` | sim | — |
| `retry_delay_seconds` | `int` | sim | — |
| `enabled` | `bool` | sim | — |
| `next_run_at` | `int | null` | não | — |
| `managed_by` | `string | null` | não | — |
| `target_type` | `string | null` | não | — |
| `target_id` | `string | null` | não | — |
| `disabled_reason` | `string | null` | não | — |
| `created_at` | `int | null` | não | — |
| `updated_at` | `int | null` | não | — |

### `GET /schedules/{schedule_id}`

Get Schedule. 

**↓** `ScheduleResponse`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `id` | `string` | sim | — |
| `user_id` | `string | null` | não | — |
| `name` | `string` | sim | — |
| `description` | `string | null` | não | — |
| `method` | `string` | sim | — |
| `endpoint` | `string` | sim | — |
| `payload` | `object | null` | não | — |
| `cron_expr` | `string` | sim | — |
| `timezone` | `string` | sim | — |
| `timeout_seconds` | `int` | sim | — |
| `max_retries` | `int` | sim | — |
| `retry_delay_seconds` | `int` | sim | — |
| `enabled` | `bool` | sim | — |
| `next_run_at` | `int | null` | não | — |
| `managed_by` | `string | null` | não | — |
| `target_type` | `string | null` | não | — |
| `target_id` | `string | null` | não | — |
| `disabled_reason` | `string | null` | não | — |
| `created_at` | `int | null` | não | — |
| `updated_at` | `int | null` | não | — |

### `PATCH /schedules/{schedule_id}`

Update Schedule. 

**↑ body**

Schema: `ScheduleUpdate`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `name` | `string | null` | não | — |
| `cron_expr` | `string | null` | não | — |
| `endpoint` | `string | null` | não | — |
| `method` | `string | null` | não | — |
| `description` | `string | null` | não | — |
| `payload` | `object | null` | não | — |
| `timezone` | `string | null` | não | — |
| `timeout_seconds` | `int | null` | não | — |
| `max_retries` | `int | null` | não | — |
| `retry_delay_seconds` | `int | null` | não | — |

**↓** `ScheduleResponse`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `id` | `string` | sim | — |
| `user_id` | `string | null` | não | — |
| `name` | `string` | sim | — |
| `description` | `string | null` | não | — |
| `method` | `string` | sim | — |
| `endpoint` | `string` | sim | — |
| `payload` | `object | null` | não | — |
| `cron_expr` | `string` | sim | — |
| `timezone` | `string` | sim | — |
| `timeout_seconds` | `int` | sim | — |
| `max_retries` | `int` | sim | — |
| `retry_delay_seconds` | `int` | sim | — |
| `enabled` | `bool` | sim | — |
| `next_run_at` | `int | null` | não | — |
| `managed_by` | `string | null` | não | — |
| `target_type` | `string | null` | não | — |
| `target_id` | `string | null` | não | — |
| `disabled_reason` | `string | null` | não | — |
| `created_at` | `int | null` | não | — |
| `updated_at` | `int | null` | não | — |

### `DELETE /schedules/{schedule_id}`

Delete Schedule. 

**↓** `204,422` sem body

Erros documentados: `204`

### `POST /schedules/{schedule_id}/enable`

Enable Schedule. 

**↓** `ScheduleStateResponse`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `id` | `string` | sim | — |
| `name` | `string` | sim | — |
| `enabled` | `bool` | sim | — |
| `next_run_at` | `int | null` | não | — |
| `updated_at` | `int | null` | não | — |

### `POST /schedules/{schedule_id}/disable`

Disable Schedule. 

**↓** `ScheduleStateResponse`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `id` | `string` | sim | — |
| `name` | `string` | sim | — |
| `enabled` | `bool` | sim | — |
| `next_run_at` | `int | null` | não | — |
| `updated_at` | `int | null` | não | — |

### `POST /schedules/{schedule_id}/trigger`

Trigger Schedule. 

**↓** `ScheduleRunResponse`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `id` | `string` | sim | — |
| `schedule_id` | `string` | sim | — |
| `user_id` | `string | null` | não | — |
| `attempt` | `int` | sim | — |
| `triggered_at` | `int | null` | não | — |
| `completed_at` | `int | null` | não | — |
| `status` | `string` | sim | — |
| `status_code` | `int | null` | não | — |
| `run_id` | `string | null` | não | — |
| `session_id` | `string | null` | não | — |
| `error` | `string | null` | não | — |
| `input` | `object | null` | não | — |
| `output` | `object | null` | não | — |
| `requirements` | `object[] | null` | não | — |
| `created_at` | `int | null` | não | — |

### `GET /schedules/{schedule_id}/runs`

List Schedule Runs. 

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `limit` | query | `int` | não | `100` |
| `page` | query | `int` | não | `1` |

**↓** `PaginatedResponse_ScheduleRunResponse_`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `data` | `ScheduleRunResponse[]` | sim | — |
| `meta` | `PaginationInfo` | sim | — |

### `GET /schedules/{schedule_id}/runs/{run_id}`

Get Schedule Run. 

**↓** `ScheduleRunResponse`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `id` | `string` | sim | — |
| `schedule_id` | `string` | sim | — |
| `user_id` | `string | null` | não | — |
| `attempt` | `int` | sim | — |
| `triggered_at` | `int | null` | não | — |
| `completed_at` | `int | null` | não | — |
| `status` | `string` | sim | — |
| `status_code` | `int | null` | não | — |
| `run_id` | `string | null` | não | — |
| `session_id` | `string | null` | não | — |
| `error` | `string | null` | não | — |
| `input` | `object | null` | não | — |
| `output` | `object | null` | não | — |
| `requirements` | `object[] | null` | não | — |
| `created_at` | `int | null` | não | — |


## Approvals

### `GET /approvals`

List Approvals. 

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `status` | query | `"pending" | "approved" | "rejected" | "expired" | "cancelled" | null` | não | — |
| `source_type` | query | `string | null` | não | — |
| `approval_type` | query | `"required" | "audit" | null` | não | — |
| `pause_type` | query | `string | null` | não | — |
| `agent_id` | query | `string | null` | não | — |
| `team_id` | query | `string | null` | não | — |
| `workflow_id` | query | `string | null` | não | — |
| `user_id` | query | `string | null` | não | — |
| `schedule_id` | query | `string | null` | não | — |
| `run_id` | query | `string | null` | não | — |
| `limit` | query | `int` | não | `100` |
| `page` | query | `int` | não | `1` |

**↓** `PaginatedResponse_ApprovalResponse_`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `data` | `ApprovalResponse[]` | sim | — |
| `meta` | `PaginationInfo` | sim | — |

### `GET /approvals/count`

Get Approval Count. 

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `user_id` | query | `string | null` | não | — |

**↓** `ApprovalCountResponse`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `count` | `int` | sim | — |

### `GET /approvals/{approval_id}/status`

Get Approval Status. 

**↓** `ApprovalStatusResponse`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `approval_id` | `string` | sim | — |
| `status` | `string` | sim | — |
| `run_id` | `string` | sim | — |
| `resolved_at` | `int | null` | não | — |
| `resolved_by` | `string | null` | não | — |

### `GET /approvals/{approval_id}`

Get Approval. 

**↓** `ApprovalResponse`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `id` | `string` | sim | — |
| `run_id` | `string` | sim | — |
| `session_id` | `string` | sim | — |
| `status` | `string` | sim | — |
| `source_type` | `string` | sim | — |
| `approval_type` | `string | null` | não | — |
| `pause_type` | `string | null` | não | — |
| `tool_name` | `string | null` | não | — |
| `tool_args` | `object | null` | não | — |
| `expires_at` | `int | null` | não | — |
| `agent_id` | `string | null` | não | — |
| `team_id` | `string | null` | não | — |
| `workflow_id` | `string | null` | não | — |
| `user_id` | `string | null` | não | — |
| `schedule_id` | `string | null` | não | — |
| `schedule_run_id` | `string | null` | não | — |
| `source_name` | `string | null` | não | — |
| `requirements` | `object[] | null` | não | — |
| `context` | `object | null` | não | — |
| `resolution_data` | `object | null` | não | — |
| `resolved_by` | `string | null` | não | — |
| `resolved_at` | `int | null` | não | — |
| `created_at` | `int | null` | não | — |
| `updated_at` | `int | null` | não | — |
| `run_status` | `RunStatus | null` | não | — |

### `DELETE /approvals/{approval_id}`

Delete Approval. 

**↓** `204,422` sem body

Erros documentados: `204`

### `POST /approvals/{approval_id}/resolve`

Resolve Approval. 

**↑ body**

Schema: `ApprovalResolve`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `status` | `string` | sim | — |
| `resolved_by` | `string | null` | não | — |
| `resolution_data` | `object | null` | não | — |

**↓** `ApprovalResponse`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `id` | `string` | sim | — |
| `run_id` | `string` | sim | — |
| `session_id` | `string` | sim | — |
| `status` | `string` | sim | — |
| `source_type` | `string` | sim | — |
| `approval_type` | `string | null` | não | — |
| `pause_type` | `string | null` | não | — |
| `tool_name` | `string | null` | não | — |
| `tool_args` | `object | null` | não | — |
| `expires_at` | `int | null` | não | — |
| `agent_id` | `string | null` | não | — |
| `team_id` | `string | null` | não | — |
| `workflow_id` | `string | null` | não | — |
| `user_id` | `string | null` | não | — |
| `schedule_id` | `string | null` | não | — |
| `schedule_run_id` | `string | null` | não | — |
| `source_name` | `string | null` | não | — |
| `requirements` | `object[] | null` | não | — |
| `context` | `object | null` | não | — |
| `resolution_data` | `object | null` | não | — |
| `resolved_by` | `string | null` | não | — |
| `resolved_at` | `int | null` | não | — |
| `created_at` | `int | null` | não | — |
| `updated_at` | `int | null` | não | — |
| `run_status` | `RunStatus | null` | não | — |


## Queue

### `GET /queue`

 Disabled. 

**↓** `any`

### `PUT /queue`

 Disabled. 

**↓** `any`

### `POST /queue`

 Disabled. 

**↓** `any`

### `DELETE /queue`

 Disabled. 

**↓** `any`

### `PATCH /queue`

 Disabled. 

**↓** `any`


## Service Accounts

### `POST /service-accounts`

Create Service Account. Mint a service account token. The plaintext token is returned exactly once.

**↑ body**

Schema: `ServiceAccountCreate`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `name` | `string` | sim | — |
| `scopes` | `ScopeItem[] | null` | não | — |
| `expires_in_days` | `int | null` | não | `90` |
| `never_expires` | `bool` | não | `false` |
| `allow_privileged_scopes` | `bool` | não | `false` |

**↓** `ServiceAccountCreateResponse`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `id` | `string` | sim | — |
| `name` | `string` | sim | — |
| `principal` | `string` | sim | — |
| `user_id` | `string | null` | não | — |
| `token_prefix` | `string` | sim | — |
| `scopes` | `ScopeSchema[]` | não | — |
| `created_at` | `int` | sim | — |
| `expires_at` | `int | null` | não | — |
| `last_used_at` | `int | null` | não | — |
| `revoked_at` | `int | null` | não | — |
| `created_by` | `string | null` | não | — |
| `token` | `string` | sim | — |

### `GET /service-accounts`

List Service Accounts. List service accounts. Returns metadata and display prefixes only - never hashes or plaintext.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `include_revoked` | query | `bool` | não | `true` |
| `limit` | query | `int` | não | `20` |
| `page` | query | `int` | não | `1` |
| `sort_by` | query | `string` | não | `"created_at"` |
| `sort_order` | query | `string` | não | `"desc"` |

**↓** `PaginatedResponse_ServiceAccountResponse_`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `data` | `ServiceAccountResponse[]` | sim | — |
| `meta` | `PaginationInfo` | sim | — |

### `DELETE /service-accounts/{service_account_id}`

Revoke Service Account. Revoke a service account. Idempotent.

**↓** `204,422` sem body

Erros documentados: `204`


## Registry

### `GET /registry`

List Registry. List all resources in the registry with optional filtering.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `resource_type` | query | `RegistryResourceType | null` | não | — |
| `name` | query | `string | null` | não | — |
| `page` | query | `int` | não | `1` |
| `limit` | query | `int` | não | `20` |

**↓** `PaginatedResponse_RegistryContentResponse_`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `data` | `RegistryContentResponse[]` | sim | — |
| `meta` | `PaginationInfo` | sim | — |

Erros documentados: `400`, `401`, `404`, `500`


## Evals

### `GET /eval-runs`

List Evaluation Runs. Retrieve paginated evaluation runs with filtering and sorting options. Filter by agent, team, workflow, model, or evaluation type.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `agent_id` | query | `string | null` | não | — |
| `team_id` | query | `string | null` | não | — |
| `workflow_id` | query | `string | null` | não | — |
| `model_id` | query | `string | null` | não | — |
| `type` | query | `EvalFilterType | null` | não | — |
| `limit` | query | `int | null` | não | `20` |
| `page` | query | `int | null` | não | `1` |
| `sort_by` | query | `string | null` | não | `"created_at"` |
| `sort_order` | query | `SortOrder | null` | não | `"desc"` |
| `db_id` | query | `string | null` | não | — |
| `table` | query | `string | null` | não | — |
| `eval_types` | query | `string | null` | não | — |

**↓** `PaginatedResponse_EvalSchema_`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `data` | `EvalSchema[]` | sim | — |
| `meta` | `PaginationInfo` | sim | — |

Erros documentados: `400`, `401`, `404`, `500`

### `DELETE /eval-runs`

Delete Evaluation Runs. Delete multiple evaluation runs by their IDs. This action cannot be undone.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `db_id` | query | `string | null` | não | — |
| `table` | query | `string | null` | não | — |

**↑ body**

Schema: `DeleteEvalRunsRequest`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `eval_run_ids` | `string[]` | sim | — |

**↓** `204,400,401,404,422,500` sem body

Erros documentados: `204`, `400`, `401`, `404`, `500`

### `POST /eval-runs`

Execute Evaluation. Run evaluation tests on agents or teams. Supports accuracy, agent-as-judge, performance, and reliability evaluations. Requires either agent_id or team_id, but not both.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `db_id` | query | `string | null` | não | — |
| `table` | query | `string | null` | não | — |

**↑ body**

Schema: `EvalRunInput`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `agent_id` | `string | null` | não | — |
| `team_id` | `string | null` | não | — |
| `model_id` | `string | null` | não | — |
| `model_provider` | `string | null` | não | — |
| `eval_type` | `EvalType` | sim | — |
| `input` | `string` | sim | — |
| `additional_guidelines` | `string | null` | não | — |
| `additional_context` | `string | null` | não | — |
| `num_iterations` | `int` | não | `1` |
| `name` | `string | null` | não | — |
| `expected_output` | `string | null` | não | — |
| `criteria` | `string | null` | não | — |
| `scoring_strategy` | `"numeric" | "binary" | null` | não | `"binary"` |
| `threshold` | `int | null` | não | `7` |
| `warmup_runs` | `int` | não | `0` |
| `expected_tool_calls` | `string[] | null` | não | — |
| `allow_additional_tool_calls` | `bool` | não | `false` |
| `expected_tool_call_arguments` | `Record<string, object | object[]> | null` | não | — |

**↓** `EvalSchema`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `id` | `string` | sim | — |
| `agent_id` | `string | null` | não | — |
| `model_id` | `string | null` | não | — |
| `model_provider` | `string | null` | não | — |
| `team_id` | `string | null` | não | — |
| `workflow_id` | `string | null` | não | — |
| `name` | `string | null` | não | — |
| `evaluated_component_name` | `string | null` | não | — |
| `user_id` | `string | null` | não | — |
| `eval_type` | `EvalType` | sim | — |
| `eval_data` | `object` | sim | — |
| `eval_input` | `object | null` | não | — |
| `created_at` | `string | null` | não | — |
| `updated_at` | `string | null` | não | — |

Erros documentados: `400`, `401`, `404`, `500`

### `GET /eval-runs/{eval_run_id}`

Get Evaluation Run. Retrieve detailed results and metrics for a specific evaluation run.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `db_id` | query | `string | null` | não | — |
| `table` | query | `string | null` | não | — |

**↓** `EvalSchema`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `id` | `string` | sim | — |
| `agent_id` | `string | null` | não | — |
| `model_id` | `string | null` | não | — |
| `model_provider` | `string | null` | não | — |
| `team_id` | `string | null` | não | — |
| `workflow_id` | `string | null` | não | — |
| `name` | `string | null` | não | — |
| `evaluated_component_name` | `string | null` | não | — |
| `user_id` | `string | null` | não | — |
| `eval_type` | `EvalType` | sim | — |
| `eval_data` | `object` | sim | — |
| `eval_input` | `object | null` | não | — |
| `created_at` | `string | null` | não | — |
| `updated_at` | `string | null` | não | — |

Erros documentados: `400`, `401`, `404`, `500`

### `PATCH /eval-runs/{eval_run_id}`

Update Evaluation Run. Update the name or other properties of an existing evaluation run.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `db_id` | query | `string | null` | não | — |
| `table` | query | `string | null` | não | — |

**↑ body**

Schema: `UpdateEvalRunRequest`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `name` | `string` | sim | — |

**↓** `EvalSchema`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `id` | `string` | sim | — |
| `agent_id` | `string | null` | não | — |
| `model_id` | `string | null` | não | — |
| `model_provider` | `string | null` | não | — |
| `team_id` | `string | null` | não | — |
| `workflow_id` | `string | null` | não | — |
| `name` | `string | null` | não | — |
| `evaluated_component_name` | `string | null` | não | — |
| `user_id` | `string | null` | não | — |
| `eval_type` | `EvalType` | sim | — |
| `eval_data` | `object` | sim | — |
| `eval_input` | `object | null` | não | — |
| `created_at` | `string | null` | não | — |
| `updated_at` | `string | null` | não | — |

Erros documentados: `400`, `401`, `404`, `500`


## Metrics

### `GET /metrics`

Get AgentOS Metrics. Retrieve AgentOS metrics and analytics data for a specified date range. If no date range is specified, returns all available metrics.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `starting_date` | query | `string | null` | não | — |
| `ending_date` | query | `string | null` | não | — |
| `user_id` | query | `string | null` | não | — |
| `db_id` | query | `string | null` | não | — |
| `table` | query | `string | null` | não | — |

**↓** `MetricsResponse`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `metrics` | `DayAggregatedMetrics[]` | sim | — |
| `updated_at` | `string | null` | não | — |

Erros documentados: `400`, `401`, `404`, `500`

### `POST /metrics/refresh`

Refresh Metrics. Manually trigger recalculation of system metrics from raw data. This operation analyzes system activity logs and regenerates aggregated metrics. Useful for ensuring metrics are up-to-date or after system maintenance. By default the refresh runs synchronously and returns the refreshed metrics. Pass background=true to run the refresh in the background instead: the endpoint returns 202 Accepted immediately and GET /metrics can be polled for results. If a background refresh is already in progress for the target database, returns status 'already_running' without starting a new one.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `db_id` | query | `string | null` | não | — |
| `table` | query | `string | null` | não | — |
| `user_id` | query | `string | null` | não | — |
| `background` | query | `bool` | não | `false` |

**↓** `DayAggregatedMetrics[] | MetricsRefreshResponse`

Erros documentados: `400`, `401`, `404`, `500`, `202`

### `GET /metrics/refresh/status`

Get Metrics Refresh Status. Get the status of the most recent metrics refresh for the target database. Returns 'running' while a refresh is in progress, then 'completed' or 'failed' with the finish timestamp — the state updates even when a refresh completes without writing new data. Returns 'idle' if no refresh has been triggered since this server process started. For remote databases the status is fetched from the remote AgentOS. Intended for polling after starting a background refresh via POST /metrics/refresh?background=true.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `db_id` | query | `string | null` | não | — |
| `table` | query | `string | null` | não | — |

**↓** `MetricsRefreshStatusResponse`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `status` | `string` | sim | — |
| `started_at` | `string | null` | não | — |
| `finished_at` | `string | null` | não | — |
| `error` | `string | null` | não | — |

Erros documentados: `400`, `401`, `404`, `500`


## Traces

### `GET /traces`

List Traces. Retrieve a paginated list of execution traces with optional filtering.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `run_id` | query | `string | null` | não | — |
| `session_id` | query | `string | null` | não | — |
| `user_id` | query | `string | null` | não | — |
| `agent_id` | query | `string | null` | não | — |
| `team_id` | query | `string | null` | não | — |
| `workflow_id` | query | `string | null` | não | — |
| `status` | query | `string | null` | não | — |
| `start_time` | query | `string | null` | não | — |
| `end_time` | query | `string | null` | não | — |
| `page` | query | `int` | não | `1` |
| `limit` | query | `int` | não | `20` |
| `db_id` | query | `string | null` | não | — |

**↓** `PaginatedResponse_TraceSummary_`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `data` | `TraceSummary[]` | sim | — |
| `meta` | `PaginationInfo` | sim | — |

Erros documentados: `400`, `401`, `404`, `500`

### `GET /traces/filter-schema`

Get Trace Filter Schema. Returns the available filterable fields, their types, valid operators, and enum values.

**↓** `FilterSchemaResponse`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `fields` | `FilterFieldSchema[]` | sim | — |
| `logical_operators` | `string[]` | não | `["AND", "OR"]` |

Erros documentados: `400`, `401`, `404`, `500`

### `GET /traces/{trace_id}`

Get Trace or Span Detail. Retrieve detailed trace information with hierarchical span tree, or a specific span within the trace.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `span_id` | query | `string | null` | não | — |
| `run_id` | query | `string | null` | não | — |
| `db_id` | query | `string | null` | não | — |

**↓** `TraceDetail | TraceNode`

Erros documentados: `400`, `401`, `404`, `500`

### `GET /trace_session_stats`

Get Trace Statistics by Session. Retrieve aggregated trace statistics grouped by session ID with pagination.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `user_id` | query | `string | null` | não | — |
| `agent_id` | query | `string | null` | não | — |
| `team_id` | query | `string | null` | não | — |
| `workflow_id` | query | `string | null` | não | — |
| `start_time` | query | `string | null` | não | — |
| `end_time` | query | `string | null` | não | — |
| `page` | query | `int` | não | `1` |
| `limit` | query | `int` | não | `20` |
| `db_id` | query | `string | null` | não | — |

**↓** `PaginatedResponse_TraceSessionStats_`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `data` | `TraceSessionStats[]` | sim | — |
| `meta` | `PaginationInfo` | sim | — |

Erros documentados: `400`, `401`, `404`, `500`

### `POST /traces/search`

Search Traces with Advanced Filters. Search traces using the FilterExpr DSL for complex, composable queries.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `db_id` | query | `string | null` | não | — |

**↑ body**

Schema: `TraceSearchRequest`

| campo | tipo | obrig. | default |
|---|---|---|---|
| `filter` | `object | null` | não | — |
| `group_by` | `TraceSearchGroupBy` | não | `"run"` |
| `page` | `int` | não | `1` |
| `limit` | `int` | não | `20` |

**↓** `PaginatedResponse_TraceDetail_ | PaginatedResponse_TraceSessionStats_`

Erros documentados: `400`, `401`, `404`, `500`


## Database

### `POST /databases/all/migrate`

Migrate All Databases. Migrate all database schemas to the given target version. If a target version is not provided, all databases will be migrated to the latest version.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `target_version` | query | `string | null` | não | — |

**↓** `any`

Erros documentados: `400`, `401`, `404`, `500`

### `POST /databases/{db_id}/migrate`

Migrate Database. Migrate the given database schema to the given target version. If a target version is not provided, the database will be migrated to the latest version.

**↑ query/header**

| param | in | tipo | obrig. | default |
|---|---|---|---|---|
| `target_version` | query | `string | null` | não | — |

**↓** `any`

Erros documentados: `400`, `401`, `404`, `500`


---

# Contrato de wire que o OpenAPI não expressa

Tudo abaixo foi lido do código instalado (`agno==3.0.6`) e confirmado com captura ao vivo no AgentOS local. É o que o gerador de tipos não consegue produzir sozinho e precisa ser escrito à mão no `agno-api`.

## 1. Transporte de streaming: SSE sempre

`POST .../runs`, `.../continue` e `.../resume` de agents, teams e workflows respondem `text/event-stream` quando `stream=true` (default), tanto em foreground quanto em `background=true`. Com `stream=false` a resposta é um JSON único (`RunOutput`/`TeamRunOutput`/`WorkflowRunOutput`, ver seção 3), que o OpenAPI marca como `any`.

Frame SSE:

```
event: RunContent
data: {"event":"RunContent","run_id":"...","content":"olá","event_index":12}

```

A linha `event:` repete o campo `event` do JSON. O cliente deve parsear só o `data:` (pode vir em múltiplas linhas `data:` que se concatenam com `\n`).

`background=true` não muda o transporte, muda a semântica: a run vai para a fila durável e o stream pode ser reaberto via `/resume`.

Header extra, ausente do OpenAPI: `Idempotency-Key` em `POST .../runs` (só com `background=true`). Máx. 512 chars (`422`), fila cheia `429`, chave reutilizada com payload diferente `409`.

## 2. Eventos que descem no stream

`RunStatus` (sempre maiúsculo no wire): `PENDING`, `RUNNING`, `COMPLETED`, `PAUSED`, `CANCELLED`, `ERROR`, `REGENERATED`

`RunEvent` (agents, 35): `RunStarted`, `RunContent`, `RunContentCompleted`, `RunIntermediateContent`, `RunCompleted`, `RunError`, `RunCancelled`, `RunPaused`, `RunContinued`, `PreHookStarted`, `PreHookCompleted`, `PostHookStarted`, `PostHookCompleted`, `ToolCallStarted`, `ToolCallCompleted`, `ToolCallError`, `ReasoningStarted`, `ReasoningStep`, `ReasoningContentDelta`, `ReasoningCompleted`, `MemoryUpdateStarted`, `MemoryUpdateCompleted`, `SessionSummaryStarted`, `SessionSummaryCompleted`, `ParserModelResponseStarted`, `ParserModelResponseCompleted`, `OutputModelResponseStarted`, `OutputModelResponseCompleted`, `ModelRequestStarted`, `ModelRequestCompleted`, `CompressionStarted`, `CompressionCompleted`, `FollowupsStarted`, `FollowupsCompleted`, `CustomEvent`

`TeamRunEvent` (teams, 40): `TeamRunStarted`, `TeamRunContent`, `TeamRunIntermediateContent`, `TeamRunContentCompleted`, `TeamRunCompleted`, `TeamRunError`, `TeamRunCancelled`, `TeamPreHookStarted`, `TeamPreHookCompleted`, `TeamPostHookStarted`, `TeamPostHookCompleted`, `TeamToolCallStarted`, `TeamToolCallCompleted`, `TeamToolCallError`, `TeamReasoningStarted`, `TeamReasoningStep`, `TeamReasoningContentDelta`, `TeamReasoningCompleted`, `TeamMemoryUpdateStarted`, `TeamMemoryUpdateCompleted`, `TeamSessionSummaryStarted`, `TeamSessionSummaryCompleted`, `TeamParserModelResponseStarted`, `TeamParserModelResponseCompleted`, `TeamOutputModelResponseStarted`, `TeamOutputModelResponseCompleted`, `TeamModelRequestStarted`, `TeamModelRequestCompleted`, `TeamCompressionStarted`, `TeamCompressionCompleted`, `TeamFollowupsStarted`, `TeamFollowupsCompleted`, `TeamRunPaused`, `TeamRunContinued`, `TeamTaskIterationStarted`, `TeamTaskIterationCompleted`, `TeamTaskStateUpdated`, `TeamTaskCreated`, `TeamTaskUpdated`, `CustomEvent`

`WorkflowRunEvent` (workflows, 31): `WorkflowStarted`, `WorkflowCompleted`, `WorkflowPaused`, `WorkflowCancelled`, `WorkflowError`, `WorkflowAgentStarted`, `WorkflowAgentCompleted`, `StepStarted`, `StepCompleted`, `StepPaused`, `StepContinued`, `StepExecutorPaused`, `StepExecutorContinued`, `StepOutputReview`, `StepError`, `LoopExecutionStarted`, `LoopIterationStarted`, `LoopIterationCompleted`, `LoopExecutionCompleted`, `ParallelExecutionStarted`, `ParallelExecutionCompleted`, `ConditionExecutionStarted`, `ConditionExecutionCompleted`, `ConditionPaused`, `RouterExecutionStarted`, `RouterExecutionCompleted`, `RouterPaused`, `StepsExecutionStarted`, `StepsExecutionCompleted`, `StepOutput`, `CustomEvent`

Todo evento carrega `event`, `run_id`, `agent_id`/`team_id`/`workflow_id`, `session_id`, `created_at` e um `event_index` sequencial (usado como `last_event_index` no `/resume`). Os demais campos dependem do evento: `content` nos `RunContent`/`TeamRunContent` (delta) e `*Completed` (texto final), `tool` (um `ToolExecution`) nos `ToolCall*`, `tools` + `requirements` nos `RunPaused`/`TeamRunPaused`, `reasoning_content` nos `Reasoning*`, `error` nos `*Error`.

Eventos meta do `/resume`, emitidos antes dos eventos reais e sem `run_id`:

| `event` | payload | significado |
|---|---|---|
| `catch_up` | `{ run_id, status: "running", missed_events, current_event_count }` | vai reenviar os eventos perdidos desde `last_event_index` |
| `replay` | `{ run_id, status, total_events, total_buffered?, message }` | run já terminou (`COMPLETED`/`ERROR`/`CANCELLED`/`PAUSED`), reenviando tudo |
| `subscribed` | `{ run_id, status: "running", current_event_count, message }` | conectado ao vivo a partir de agora |
| `error` | `{ error: string }` | falha (a mensagem está em `error`, não em `detail`/`message`) |

## 3. Shape da run (resposta não-stream, `GET .../runs/{run_id}`, itens de `GET /sessions/{id}/runs`)

`RunOutput` (agent), serializado por `to_dict()` com `status` como string, `events[]`, `messages[]`, `metrics`:

| campo | tipo (Python) |
|---|---|
| `run_id` | `Optional[str]` |
| `agent_id` | `Optional[str]` |
| `agent_name` | `Optional[str]` |
| `session_id` | `Optional[str]` |
| `parent_run_id` | `Optional[str]` |
| `workflow_id` | `Optional[str]` |
| `user_id` | `Optional[str]` |
| `input` | `Optional[agno.run.agent.RunInput]` |
| `content` | `Optional[Any]` |
| `content_type` | `<class 'str'>` |
| `reasoning_content` | `Optional[str]` |
| `reasoning_steps` | `Optional[List[agno.reasoning.step.ReasoningStep]]` |
| `reasoning_messages` | `Optional[List[agno.models.message.Message]]` |
| `model_provider_data` | `Optional[Dict[str, Any]]` |
| `model` | `Optional[str]` |
| `model_provider` | `Optional[str]` |
| `messages` | `Optional[List[agno.models.message.Message]]` |
| `metrics` | `Optional[agno.metrics.RunMetrics]` |
| `additional_input` | `Optional[List[agno.models.message.Message]]` |
| `tools` | `Optional[List[agno.models.response.ToolExecution]]` |
| `images` | `Optional[List[agno.media.media.Image]]` |
| `videos` | `Optional[List[agno.media.media.Video]]` |
| `audio` | `Optional[List[agno.media.media.Audio]]` |
| `files` | `Optional[List[agno.media.media.File]]` |
| `response_audio` | `Optional[agno.media.media.Audio]` |
| `citations` | `Optional[agno.models.message.Citations]` |
| `references` | `Optional[List[agno.models.message.MessageReferences]]` |
| `followups` | `Optional[List[str]]` |
| `metadata` | `Optional[Dict[str, Any]]` |
| `session_state` | `Optional[Dict[str, Any]]` |
| `created_at` | `<class 'int'>` |
| `events` | `Optional[List[Union[agno.run.agent.RunStartedEvent, agno.run.agent.RunContentEvent, agno.run.agent.IntermediateRunContentEvent, agno.run.agent.RunContentCompletedEvent, agno.run.agent.RunCompletedEvent, agno.run.agent.RunErrorEvent, agno.run.agent.RunCancelledEvent, agno.run.agent.RunPausedEvent, agno.run.agent.RunContinuedEvent, agno.run.agent.PreHookStartedEvent, agno.run.agent.PreHookCompletedEvent, agno.run.agent.PostHookStartedEvent, agno.run.agent.PostHookCompletedEvent, agno.run.agent.ReasoningStartedEvent, agno.run.agent.ReasoningStepEvent, agno.run.agent.ReasoningContentDeltaEvent, agno.run.agent.ReasoningCompletedEvent, agno.run.agent.MemoryUpdateStartedEvent, agno.run.agent.MemoryUpdateCompletedEvent, agno.run.agent.SessionSummaryStartedEvent, agno.run.agent.SessionSummaryCompletedEvent, agno.run.agent.ToolCallStartedEvent, agno.run.agent.ToolCallCompletedEvent, agno.run.agent.ToolCallErrorEvent, agno.run.agent.ParserModelResponseStartedEvent, agno.run.agent.ParserModelResponseCompletedEvent, agno.run.agent.OutputModelResponseStartedEvent, agno.run.agent.OutputModelResponseCompletedEvent, agno.run.agent.ModelRequestStartedEvent, agno.run.agent.ModelRequestCompletedEvent, agno.run.agent.CompressionStartedEvent, agno.run.agent.CompressionCompletedEvent, agno.run.agent.FollowupsStartedEvent, agno.run.agent.FollowupsCompletedEvent, agno.run.agent.CustomEvent]]]` |
| `status` | `<enum 'RunStatus'>` |
| `queue_attempt` | `Optional[int]` |
| `requirements` | `Optional[list[agno.run.requirement.RunRequirement]]` |
| `last_checkpoint_at_message_index` | `Optional[int]` |
| `forked_from_run_id` | `Optional[str]` |
| `forked_from_message_index` | `Optional[int]` |
| `forked_from_session_id` | `Optional[str]` |
| `regenerated_from` | `Optional[str]` |
| `workflow_step_id` | `Optional[str]` |

`TeamRunOutput` tem os mesmos campos mais `team_id`, `team_name`, `member_responses[]` e `requirements[]` de membros; `WorkflowRunOutput` tem `workflow_id`, `step_results[]`, `step_executor_runs[]`.

**Nunca aparecem no wire** (são `@property` no Python): `tools_requiring_confirmation`, `tools_requiring_user_input`, `tools_awaiting_external_execution`, `is_paused`, `is_cancelled`. O cliente deriva "o que está pendente" filtrando `tools[]` e `requirements[]`.

## 4. HITL: `ToolExecution` e `RunRequirement`

`ToolExecution` (o que desce em `tool`/`tools[]` e o que sobe em `tools` no `/continue` de agent):

| campo | tipo (Python) |
|---|---|
| `tool_call_id` | `Optional[str]` |
| `tool_name` | `Optional[str]` |
| `tool_args` | `Optional[Dict[str, Any]]` |
| `tool_call_error` | `Optional[bool]` |
| `result` | `Optional[str]` |
| `metrics` | `Optional[agno.metrics.ToolCallMetrics]` |
| `child_run_id` | `Optional[str]` |
| `stop_after_tool_call` | `<class 'bool'>` |
| `created_at` | `<class 'int'>` |
| `requires_confirmation` | `Optional[bool]` |
| `confirmed` | `Optional[bool]` |
| `confirmation_note` | `Optional[str]` |
| `requires_user_input` | `Optional[bool]` |
| `user_input_schema` | `Optional[List[agno.tools.function.UserInputField]]` |
| `user_feedback_schema` | `Optional[List[agno.tools.function.UserFeedbackQuestion]]` |
| `answered` | `Optional[bool]` |
| `external_execution_required` | `Optional[bool]` |
| `external_execution_silent` | `Optional[bool]` |
| `approval_type` | `Optional[str]` |
| `approval_id` | `Optional[str]` |

Pendente = `requires_confirmation && confirmed == null` ou `requires_user_input && !answered` ou `external_execution_required && result == null`.

`RunRequirement` (desce em `requirements[]` de `RunPaused`/`TeamRunPaused` e sobe em `requirements` no `/continue` de team):

| campo | tipo (Python) |
|---|---|
| `tool_execution` | `Optional[agno.models.response.ToolExecution]` |
| `created_at` | `<class 'datetime.datetime'>` |
| `confirmation` | `Optional[bool]` |
| `confirmation_note` | `Optional[str]` |
| `user_input_schema` | `Optional[List[agno.tools.function.UserInputField]]` |
| `user_feedback_schema` | `Optional[List[agno.tools.function.UserFeedbackQuestion]]` |
| `external_execution_result` | `Optional[str]` |
| `member_agent_id` | `Optional[str]` |
| `member_agent_name` | `Optional[str]` |
| `member_run_id` | `Optional[str]` |

Uma pausa causada por uma tool de um **membro** do time aparece só em `requirements[]` (com `member_*` preenchidos), nunca em `tools[]` do time.

## 5. Mapeamento ↑ do `/continue`

| modo | campo FormData | conteúdo (JSON string) | casado pelo servidor por |
|---|---|---|---|
| agent | `tools` | `ToolExecution[]` com `confirmed`/`result`/`answered` preenchidos | `tool_call_id` |
| team | `requirements` | `RunRequirement[]`, decisão dentro de `tool_execution` | `id`, depois `tool_execution.tool_call_id` |
| workflow | `requirements` | `RunRequirement[]` | idem |

`/continue` com `tools`/`requirements` vazio aplica uma aprovação já resolvida via `POST /approvals/{approval_id}/resolve` (tools com `@approval(type="required")`).

## 6. Erros

FastAPI padrão: `{ "detail": string | object }`. O cliente expõe um único `AgnoApiError { status, detail }`. Códigos que importam para UX: `401` token expirado (renovar e repetir uma vez), `403` `user_id` diferente do dono da sessão, `404`, `409` conflito (guard de components, idempotência, run já em andamento), `422` validação, `429` fila cheia.
