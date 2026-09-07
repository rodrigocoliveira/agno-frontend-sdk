import { afterEach, describe, expect, test } from 'bun:test'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { StrictMode, useEffect } from 'react'
import { AgnoProvider, createRegistry } from '../../src/react/provider'
import { useAgnoAgent } from '../../src/react/hooks'
import type { AgnoStore } from '../../src/store/store'
import type { AnyEvent } from '../../src/types'
import { apiWith, bodyParam, frames, json, mockFetch } from '../store/helpers'

afterEach(cleanup)

const rows = (sessionId: string) => json([{ run_id: `${sessionId}-r1`, agent_id: 'a', status: 'COMPLETED', run_input: 'hi', content: `history of ${sessionId}` }])

function Chat({ sessionId, onStore, tools }: { sessionId?: string; onStore?: (s: AgnoStore<'agent'>) => void; tools?: Record<string, () => Promise<string>> }) {
  const chat = useAgnoAgent({ agentId: 'a', sessionId, frontendTools: tools })
  useEffect(() => { onStore?.(chat.store) }, [chat.store, onStore])
  return <div>
    <span data-testid="status">{chat.status}</span>
    <span data-testid="session">{chat.sessionId ?? '-'}</span>
    <span data-testid="content">{chat.runs.map((r) => r.content).join('|')}</span>
    <button onClick={() => void chat.send('hi')}>send</button>
  </div>
}

describe('AgnoProvider + useAgnoAgent', () => {
  test('hydrates through the provider api; two components share one store; StrictMode does not double-fetch', async () => {
    const m = mockFetch((call) => (call.url.includes('/sessions/s1/runs') ? rows('s1') : json({}, 404)))
    const stores: AgnoStore<'agent'>[] = []
    const { getAllByTestId } = render(
      <StrictMode>
        <AgnoProvider api={apiWith(m.fetch)}>
          <Chat sessionId="s1" onStore={(s) => stores.push(s)} />
          <Chat sessionId="s1" onStore={(s) => stores.push(s)} />
        </AgnoProvider>
      </StrictMode>,
    )
    await waitFor(() => expect(getAllByTestId('status').map((e) => e.textContent)).toEqual(['ready', 'ready']))
    expect(getAllByTestId('content')[0]!.textContent).toBe('history of s1')
    expect(new Set(stores).size).toBe(1)
    expect(m.calls.filter((c) => c.url.includes('/sessions/s1/runs'))).toHaveLength(1)
  })

  test('config props create the api once; useAgnoApi exposes it', async () => {
    const m = mockFetch((call) => (call.url.includes('/sessions/s1/runs') ? rows('s1') : json({}, 404)))
    const { getByTestId } = render(
      <AgnoProvider baseUrl="http://x" token={() => 'tok'} fetch={m.fetch}>
        <Chat sessionId="s1" />
      </AgnoProvider>,
    )
    await waitFor(() => expect(getByTestId('status').textContent).toBe('ready'))
    expect(new Headers(m.calls[0]!.init.headers).get('authorization')).toBe('Bearer tok')
  })

  test('changing sessionId swaps the store; learning the id from a send keeps it', async () => {
    const m = mockFetch((call) => {
      if (call.url.includes('/sessions/s1/runs')) return rows('s1')
      if (call.url.includes('/sessions/s2/runs')) return rows('s2')
      if (call.url.endsWith('/agents/a/runs')) return frames([{ event: 'RunStarted', run_id: 'r9', session_id: 'new-9', event_index: 0 } as AnyEvent, { event: 'RunCompleted', run_id: 'r9', content: 'fresh', event_index: 1 } as AnyEvent])
      return json({}, 404)
    })
    const stores: AgnoStore<'agent'>[] = []
    const api = apiWith(m.fetch)
    const ui = (sessionId?: string) => <AgnoProvider api={api}><Chat sessionId={sessionId} onStore={(s) => stores.push(s)} /></AgnoProvider>
    const { getByTestId, getByText, rerender } = render(ui('s1'))
    await waitFor(() => expect(getByTestId('content').textContent).toBe('history of s1'))
    rerender(ui('s2'))
    await waitFor(() => expect(getByTestId('content').textContent).toBe('history of s2'))
    expect(new Set(stores).size).toBe(2)

    rerender(ui(undefined))
    await waitFor(() => expect(getByTestId('content').textContent).toBe(''))
    await act(async () => { getByText('send').click() })
    await waitFor(() => expect(getByTestId('session').textContent).toBe('new-9'))
    const learned = stores.at(-1)!
    rerender(ui('new-9'))
    await waitFor(() => expect(getByTestId('content').textContent).toBe('fresh'))
    expect(stores.at(-1)).toBe(learned)
    expect(m.calls.some((c) => c.url.includes('/sessions/new-9/runs'))).toBe(false)
  })

  test('inline frontendTools always use the latest closure', async () => {
    const ext = { tool_call_id: 'c3', tool_name: 'get_location', tool_args: {}, external_execution_required: true }
    const m = mockFetch((call) => call.url.endsWith('/continue')
      ? frames([{ event: 'RunContinued', run_id: 'r1' } as AnyEvent, { event: 'RunCompleted', run_id: 'r1', content: 'ok' } as AnyEvent])
      : frames([{ event: 'RunStarted', run_id: 'r1', session_id: 's' } as AnyEvent, { event: 'RunPaused', run_id: 'r1', tools: [ext] } as AnyEvent]))
    const api = apiWith(m.fetch)
    const ui = (v: string) => <AgnoProvider api={api}><Chat tools={{ get_location: async () => v }} /></AgnoProvider>
    const { getByText, getByTestId, rerender } = render(ui('v1'))
    rerender(ui('v2'))
    await act(async () => { getByText('send').click() })
    await waitFor(() => expect(getByTestId('content').textContent).toBe('ok'))
    expect(JSON.parse(bodyParam(m.calls[1]!, 'tools')!)[0].result).toBe('v2')
  })

  test('registry destroys a store only after the last release', async () => {
    const reg = createRegistry()
    let destroyed = 0
    const fake = { destroy: () => destroyed++ } as unknown as AgnoStore<'agent'>
    expect(reg.get('k', () => fake)).toBe(fake)
    reg.retain('k'); reg.retain('k'); reg.release('k')
    await new Promise((r) => setTimeout(r, 5))
    expect(destroyed).toBe(0)
    reg.release('k')
    await new Promise((r) => setTimeout(r, 5))
    expect(destroyed).toBe(1)
    reg.get('old', () => fake); reg.retain('old'); reg.rekey('old', 'new'); reg.retain('new'); reg.release('old'); reg.release('new')
    await new Promise((r) => setTimeout(r, 5))
    expect(destroyed).toBe(2)
  })
})
