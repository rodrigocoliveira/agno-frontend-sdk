# E2E

Roda só com `AGNO_URL` definido. Sem ela os arquivos aparecem como *skipped* no `bun test` normal.

    AGNO_URL=http://localhost:7777 AGNO_AGENT_ID=test-agent bun run test:e2e

Servidor esperado: AgentOS `agno>=3.0.6` com `SqliteDb`, um agent com uma tool `requires_confirmation=True`,
um team com esse agent como membro, e um workflow de um passo. Variáveis: `AGNO_URL`, `AGNO_TOKEN` (opcional),
`AGNO_AGENT_ID`, `AGNO_TEAM_ID`, `AGNO_WORKFLOW_ID`.

## Servidor zero-key: `examples/agentos`

O repo já traz esse servidor pronto em `examples/agentos` (um `AgentOS` com um `ScriptedModel`
determinístico, sem chave de API nenhuma). Para rodar a suite localmente:

    AGNO_PORT=7778 bun run agentos
    AGNO_URL=http://localhost:7778 bun run test:e2e
