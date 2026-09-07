import { describe, expect, test } from 'bun:test'
import type { ToolExecution } from '@rodrigocoliveira/agno-api'
import { confirm, isToolPending, pendingTools, provideUserFeedback, provideUserInput, reject, setExternalResult } from '../../src/run/hitl'

const base = (over: Partial<ToolExecution>): ToolExecution => ({ tool_call_id: 'c1', tool_name: 't', tool_args: {}, ...over })

describe('isToolPending', () => {
  test('confirmation pending until confirmed is set', () => {
    expect(isToolPending(base({ requires_confirmation: true }))).toBe(true)
    expect(isToolPending(base({ requires_confirmation: true, confirmed: false }))).toBe(false)
  })
  test('user input pending until answered', () => {
    expect(isToolPending(base({ requires_user_input: true }))).toBe(true)
    expect(isToolPending(base({ requires_user_input: true, answered: true }))).toBe(false)
  })
  test('external pending until result', () => {
    expect(isToolPending(base({ external_execution_required: true }))).toBe(true)
    expect(isToolPending(base({ external_execution_required: true, result: 'ok' }))).toBe(false)
  })
  test('plain tool is never pending', () => {
    expect(isToolPending(base({ result: 'x' }))).toBe(false)
  })
})

describe('pendingTools', () => {
  test('requirements win over tools with the same id, filtered by isToolPending', () => {
    const t1 = base({ tool_call_id: 'c1', requires_confirmation: true })
    const t2 = base({ tool_call_id: 'c2', result: 'done' })
    const fromReq = base({ tool_call_id: 'c1', requires_confirmation: true, tool_name: 'member_tool' })
    const out = pendingTools({ tools: [t1, t2], requirements: [{ id: 'r1', tool_execution: fromReq, member_agent_id: 'm' }] })
    expect(out).toEqual([fromReq])
  })
  test('member-only requirement is included', () => {
    const m = base({ tool_call_id: 'c9', external_execution_required: true })
    expect(pendingTools({ tools: [], requirements: [{ id: 'r', tool_execution: m }] })).toEqual([m])
  })
})

describe('decision helpers return new objects in Agno vocabulary', () => {
  const t = base({ requires_confirmation: true })
  test('confirm / reject', () => {
    expect(confirm(t)).toMatchObject({ confirmed: true, confirmation_note: null })
    expect(reject(t, 'no')).toMatchObject({ confirmed: false, confirmation_note: 'no' })
    expect(t.confirmed).toBeUndefined()
  })
  test('provideUserInput fills values by field name and marks answered', () => {
    const u = base({ requires_user_input: true, user_input_schema: [{ name: 'city' }, { name: 'age', field_type: 'int' }] })
    const out = provideUserInput(u, { city: 'SP' })
    expect(out.answered).toBe(true)
    expect(out.user_input_schema).toEqual([{ name: 'city', value: 'SP' }, { name: 'age', field_type: 'int' }])
  })
  test('provideUserFeedback fills selected_options by question', () => {
    const f = base({ requires_user_input: true, user_feedback_schema: [{ question: 'Where?', options: [{ label: 'A' }, { label: 'B' }] }] })
    const out = provideUserFeedback(f, { 'Where?': ['B'] })
    expect(out.answered).toBe(true)
    expect(out.user_feedback_schema![0]!.selected_options).toEqual(['B'])
  })
  test('setExternalResult keeps strings and JSON-encodes everything else', () => {
    const e = base({ external_execution_required: true })
    expect(setExternalResult(e, 'ok').result).toBe('ok')
    expect(setExternalResult(e, { a: 1 }).result).toBe('{"a":1}')
    expect(setExternalResult(e, undefined).result).toBe('null')
  })
})
