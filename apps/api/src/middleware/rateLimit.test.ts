import { describe, it, expect, beforeEach } from 'vitest'
import { hit, __resetRateLimits } from './rateLimit'

describe('rate limit', () => {
  beforeEach(() => __resetRateLimits())

  it('allows up to the limit and refuses past it', () => {
    const t = Date.now()
    for (let i = 0; i < 3; i++) expect(hit('k', 3, 60_000, t).allowed).toBe(true)
    expect(hit('k', 3, 60_000, t).allowed).toBe(false)
  })

  it('counts each key separately', () => {
    const t = Date.now()
    hit('a', 1, 60_000, t)
    expect(hit('a', 1, 60_000, t).allowed).toBe(false)
    expect(hit('b', 1, 60_000, t).allowed).toBe(true)
  })

  it('resets once the window passes', () => {
    const t = Date.now()
    hit('k', 1, 1000, t)
    expect(hit('k', 1, 1000, t + 500).allowed).toBe(false)
    expect(hit('k', 1, 1000, t + 1500).allowed).toBe(true)
  })

  it('reports remaining, floored at zero', () => {
    const t = Date.now()
    expect(hit('k', 2, 60_000, t).remaining).toBe(1)
    expect(hit('k', 2, 60_000, t).remaining).toBe(0)
    expect(hit('k', 2, 60_000, t).remaining).toBe(0)
  })
})
