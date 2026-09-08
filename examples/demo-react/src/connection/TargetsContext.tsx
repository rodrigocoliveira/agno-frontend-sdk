import type { components } from '@rodrigocoliveira/agno-api'
import { useAgnoApi } from '@rodrigocoliveira/agno-hooks'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type AgentInfo = components['schemas']['AgentResponse']
export type TeamInfo = components['schemas']['TeamResponse']
export type WorkflowInfo = components['schemas']['WorkflowSummaryResponse']

export interface Targets {
  status: 'loading' | 'ready' | 'error'
  agents: AgentInfo[]
  teams: TeamInfo[]
  workflows: WorkflowInfo[]
  error: Error | null
}

const EMPTY: Targets = { status: 'loading', agents: [], teams: [], workflows: [], error: null }
const Ctx = createContext<Targets>(EMPTY)

/** Lists agents, teams and workflows once per connection (the provider is remounted on endpoint/token change). */
export function TargetsProvider({ children }: { children: ReactNode }) {
  const api = useAgnoApi()
  const [targets, setTargets] = useState<Targets>(EMPTY)
  useEffect(() => {
    let alive = true
    Promise.all([api.agents.list(), api.teams.list(), api.workflows.list()])
      .then(([agents, teams, workflows]) => { if (alive) setTargets({ status: 'ready', agents, teams, workflows, error: null }) })
      .catch((e: unknown) => { if (alive) setTargets({ ...EMPTY, status: 'error', error: e instanceof Error ? e : new Error(String(e)) }) })
    return () => { alive = false }
  }, [api])
  return <Ctx.Provider value={targets}>{children}</Ctx.Provider>
}

export const useTargets = () => useContext(Ctx)
