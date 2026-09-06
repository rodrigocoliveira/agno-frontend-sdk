import { expect, test } from 'bun:test'
import * as pkg from '../src/index'

test('public surface', () => {
  expect(Object.keys(pkg).sort()).toEqual(['AgnoApiError', 'createAgnoApi', 'isAgnoApiError'])
})
