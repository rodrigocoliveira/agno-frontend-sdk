import { describe, expect, test } from 'bun:test'
import { fromServerStatus, isTerminal } from '../src/types'

describe('fromServerStatus', () => {
  test('maps every RunStatus', () => {
    expect(fromServerStatus('PENDING')).toBe('running')
    expect(fromServerStatus('RUNNING')).toBe('running')
    expect(fromServerStatus('PAUSED')).toBe('paused')
    expect(fromServerStatus('COMPLETED')).toBe('completed')
    expect(fromServerStatus('REGENERATED')).toBe('completed')
    expect(fromServerStatus('CANCELLED')).toBe('cancelled')
    expect(fromServerStatus('ERROR')).toBe('error')
    expect(fromServerStatus(null)).toBe('running')
  })
  test('isTerminal', () => {
    expect(isTerminal('completed')).toBe(true)
    expect(isTerminal('error')).toBe(true)
    expect(isTerminal('cancelled')).toBe(true)
    expect(isTerminal('running')).toBe(false)
    expect(isTerminal('paused')).toBe(false)
  })
})
