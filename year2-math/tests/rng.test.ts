import { describe, expect, it } from 'vitest'
import { hashString, mulberry32, pick, randInt, shuffle } from '../src/content/rng'

describe('mulberry32', () => {
  it('is deterministic for a given seed', () => {
    const a = mulberry32(1234)
    const b = mulberry32(1234)
    for (let i = 0; i < 100; i++) expect(a()).toBe(b())
  })

  it('produces values in [0, 1)', () => {
    const r = mulberry32(42)
    for (let i = 0; i < 10000; i++) {
      const v = r()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('different seeds give different streams', () => {
    const a = mulberry32(1)
    const b = mulberry32(2)
    const seqA = Array.from({ length: 8 }, () => a())
    const seqB = Array.from({ length: 8 }, () => b())
    expect(seqA).not.toEqual(seqB)
  })
})

describe('randInt', () => {
  it('stays within [min, max] inclusive', () => {
    const r = mulberry32(7)
    for (let i = 0; i < 2000; i++) {
      const v = randInt(r, 3, 9)
      expect(v).toBeGreaterThanOrEqual(3)
      expect(v).toBeLessThanOrEqual(9)
      expect(Number.isInteger(v)).toBe(true)
    }
  })

  it('hits both endpoints eventually', () => {
    const r = mulberry32(99)
    const seen = new Set<number>()
    for (let i = 0; i < 5000; i++) seen.add(randInt(r, 1, 5))
    expect(seen.has(1)).toBe(true)
    expect(seen.has(5)).toBe(true)
  })
})

describe('pick', () => {
  it('always returns a member of the array', () => {
    const r = mulberry32(11)
    const arr = ['x', 'y', 'z'] as const
    for (let i = 0; i < 500; i++) expect(arr).toContain(pick(r, arr))
  })
})

describe('shuffle', () => {
  it('returns a permutation without mutating the input', () => {
    const r = mulberry32(5)
    const input = [1, 2, 3, 4, 5, 6, 7, 8]
    const out = shuffle(r, input)
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect([...out].sort((a, b) => a - b)).toEqual(input)
  })

  it('is deterministic for a given seed', () => {
    const arr = [1, 2, 3, 4, 5]
    expect(shuffle(mulberry32(77), arr)).toEqual(shuffle(mulberry32(77), arr))
  })

  it('does not always return the identity order', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8]
    const orders = new Set(
      Array.from({ length: 20 }, (_, i) => shuffle(mulberry32(i), arr).join(',')),
    )
    expect(orders.size).toBeGreaterThan(1)
  })
})

describe('hashString', () => {
  it('is stable across calls', () => {
    expect(hashString('u1l1')).toBe(hashString('u1l1'))
  })

  it('differs for different inputs', () => {
    expect(hashString('u1l1')).not.toBe(hashString('u1l2'))
  })
})
