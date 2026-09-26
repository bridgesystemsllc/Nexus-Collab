// packages/shared/src/oor/riskScore.test.ts
import { describe, it, expect } from 'vitest'
import { computeRiskScore, type RiskNodeInput, type RiskScoreInput } from './riskScore'

const TODAY = new Date('2026-08-30T00:00:00Z')
const inDays = (n: number) => new Date(Date.UTC(2026, 7, 30 + n))

function node(overrides: Partial<RiskNodeInput> = {}): RiskNodeInput {
  return {
    level: 1,
    materialClass: 'COMPONENT',
    componentType: null,
    qtyNeeded: 100,
    qtyOnHand: 0,
    customerProvided: false,
    nodeStatus: 'OPEN',
    etaDate: null,
    ...overrides,
  }
}

function input(overrides: Partial<RiskScoreInput> = {}): RiskScoreInput {
  return {
    qtyRemaining: 100,
    manualStatus: null,
    requiredDeliveryDate: inDays(60),
    nodes: [],
    today: TODAY,
    ...overrides,
  }
}

describe('computeRiskScore categorical floors', () => {
  it('is High when the required date has passed, even with nothing else wrong', () => {
    const r = computeRiskScore(input({ requiredDeliveryDate: inDays(-1) }))
    expect(r.level).toBe('High')
    expect(r.score).toBeGreaterThanOrEqual(60)
    expect(r.drivers).toContain('Required date has passed')
  })

  it('is High when a blocker has no ETA', () => {
    const r = computeRiskScore(input({ nodes: [node({ etaDate: null })] }))
    expect(r.level).toBe('High')
  })

  it('is High when a blocker ETA lands after the required date', () => {
    const r = computeRiskScore(input({ nodes: [node({ etaDate: inDays(40) })], requiredDeliveryDate: inDays(30) }))
    expect(r.level).toBe('High')
  })

  it('is Med inside fourteen days', () => {
    const r = computeRiskScore(input({ requiredDeliveryDate: inDays(10) }))
    expect(r.level).toBe('Med')
    expect(r.score).toBeGreaterThanOrEqual(30)
  })

  it('is Med with blockers but no required date', () => {
    const r = computeRiskScore(input({ requiredDeliveryDate: null, nodes: [node({ etaDate: inDays(5) })] }))
    expect(r.level).toBe('Med')
  })

  it('is Low when every blocker lands well before a distant required date', () => {
    const r = computeRiskScore(input({ nodes: [node({ materialClass: 'PACKAGING', etaDate: inDays(20) })] }))
    expect(r.level).toBe('Low')
  })

  it('still ranks by points above the floor', () => {
    const plain = computeRiskScore(input({ requiredDeliveryDate: inDays(-1) }))
    const worse = computeRiskScore(
      input({ requiredDeliveryDate: inDays(-1), nodes: [node({ etaDate: null })], notesText: 'vendor delayed' }),
    )
    expect(worse.score).toBeGreaterThan(plain.score)
  })

  it('keeps closed and fulfilled lines Low', () => {
    expect(computeRiskScore(input({ manualStatus: 'SHIPPED', requiredDeliveryDate: inDays(-5) })).level).toBe('Low')
    expect(computeRiskScore(input({ qtyRemaining: 0, requiredDeliveryDate: inDays(-5) })).level).toBe('Low')
  })
})
