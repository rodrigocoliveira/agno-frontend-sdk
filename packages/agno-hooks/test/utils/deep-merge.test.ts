import { describe, expect, test } from 'bun:test'
import { deepMerge, isPlainObject } from '../../src/utils/deep-merge'

describe('isPlainObject', () => {
  test('true só pra objeto literal; false pra array, null, Date, classe', () => {
    expect(isPlainObject({})).toBe(true)
    expect(isPlainObject({ a: 1 })).toBe(true)
    expect(isPlainObject([1, 2])).toBe(false)
    expect(isPlainObject(null)).toBe(false)
    expect(isPlainObject(new Date())).toBe(false)
    expect(isPlainObject('x')).toBe(false)
    expect(isPlainObject(1)).toBe(false)
  })
})

describe('deepMerge', () => {
  test('mescla objetos planos em qualquer profundidade; chaves-irmãs sobrevivem', () => {
    const base = { cart: { items: [{ id: 'a', qty: 1 }], delivery: { notes: 'x' }, _audit: { by: 'agent' } } }
    const out = deepMerge(base, { cart: { items: [{ id: 'a', qty: 2 }] } })
    expect(out).toEqual({ cart: { items: [{ id: 'a', qty: 2 }], delivery: { notes: 'x' }, _audit: { by: 'agent' } } })
  })

  test('array e primitivo substituem, não mesclam por índice', () => {
    expect(deepMerge({ items: [1, 2, 3] }, { items: [9] })).toEqual({ items: [9] })
    expect(deepMerge({ count: 1 }, { count: 2 })).toEqual({ count: 2 })
  })

  test('null seta a chave, não apaga', () => {
    expect(deepMerge({ a: { b: 1 } }, { a: null })).toEqual({ a: null })
  })

  test('chave nova é adicionada; troca de tipo objeto<->primitivo substitui', () => {
    expect(deepMerge({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 })
    expect(deepMerge({ a: { x: 1 } }, { a: 'now a string' })).toEqual({ a: 'now a string' })
  })

  test('não muta os argumentos', () => {
    const base = { a: { b: 1 } }
    const partial = { a: { c: 2 } }
    deepMerge(base, partial)
    expect(base).toEqual({ a: { b: 1 } })
    expect(partial).toEqual({ a: { c: 2 } })
  })
})
