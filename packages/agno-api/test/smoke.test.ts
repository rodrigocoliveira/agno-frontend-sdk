import { describe, expect, test } from 'bun:test'
import { VERSION } from '../src/index'

describe('smoke', () => {
  test('package loads', () => {
    expect(VERSION).toBe('0.0.0')
  })
})
