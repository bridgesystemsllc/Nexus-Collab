import { describe, it, expect } from 'vitest'
import { deriveLineStatus, deriveRiskLevel, type DeriveInput, type DeriveNode } from './deriveStatus'

const node = (over: Partial<DeriveNode> = {}): DeriveNode => ({
  level: 1,
  materialClass: 'COMPONENT',
  componentType: null,
  qtyNeeded: 100,
  qtyOnHand: 100,
  customerProvided: false,
  nodeStatus: 'OPEN',
  etaDate: null,
  ...over,
})

const input = (over: Partial<DeriveInput> = {}): DeriveInput => ({
  qtyRemaining: 1000,
  manualStatus: null,
  nodes: [],
  requiredDeliveryDate: null,
  ...over,
})

const TODAY = new Date('2026-08-30T00:00:00Z')
const inDays = (n: number) => new Date(Date.UTC(2026, 7, 30 + n))

describe('deriveLineStatus', () => {
  it('is OPEN when there are no materials to judge by', () => {
    expect(deriveLineStatus(input())).toBe('OPEN')
  })

  it('is IN_PRODUCTION when materials exist and none are short', () => {
    expect(deriveLineStatus(input({ nodes: [node(), node({ level: 2, materialClass: 'RAW_MATERIAL' })] }))).toBe('IN_PRODUCTION')
  })

  it('is SHORT_MATERIAL when a raw material is short', () => {
    const nodes = [node({ level: 2, materialClass: 'RAW_MATERIAL', qtyNeeded: 100, qtyOnHand: 40 })]
    expect(deriveLineStatus(input({ nodes }))).toBe('SHORT_MATERIAL')
  })

  it('is AWAITING_COMPONENT when a component is short', () => {
    const nodes = [node({ materialClass: 'COMPONENT', componentType: 'TUBE', qtyNeeded: 100, qtyOnHand: 0 })]
    expect(deriveLineStatus(input({ nodes }))).toBe('AWAITING_COMPONENT')
  })

  it('is AWAITING_ARTWORK when the short component is a label or carton', () => {
    for (const componentType of ['FRONT LABEL', 'BACK LABEL', 'WRAP LABEL', 'UNIT CARTON']) {
      const nodes = [node({ materialClass: 'COMPONENT', componentType, qtyNeeded: 100, qtyOnHand: 0 })]
      expect(deriveLineStatus(input({ nodes }))).toBe('AWAITING_ARTWORK')
    }
  })

  it('treats a null on-hand as nothing on hand, not as unknown', () => {
    const nodes = [node({ level: 2, materialClass: 'RAW_MATERIAL', qtyNeeded: 100, qtyOnHand: null })]
    expect(deriveLineStatus(input({ nodes }))).toBe('SHORT_MATERIAL')
  })

  it('outranks every material shortage with a customer-provided blocker', () => {
    const nodes = [
      node({ level: 2, materialClass: 'RAW_MATERIAL', qtyNeeded: 100, qtyOnHand: 0 }),
      node({ materialClass: 'COMPONENT', componentType: 'TUBE', qtyNeeded: 100, qtyOnHand: 0 }),
      node({ customerProvided: true, qtyNeeded: 100, qtyOnHand: 0 }),
    ]
    expect(deriveLineStatus(input({ nodes }))).toBe('AWAITING_CUSTOMER_APPROVAL')
  })

  it('ignores a customer-provided node once it is resolved', () => {
    const nodes = [node({ customerProvided: true, nodeStatus: 'RESOLVED', qtyNeeded: 100, qtyOnHand: 0 })]
    expect(deriveLineStatus(input({ nodes }))).toBe('IN_PRODUCTION')
  })

  it('ranks a short raw material below a short component', () => {
    const nodes = [
      node({ level: 2, materialClass: 'RAW_MATERIAL', qtyNeeded: 100, qtyOnHand: 0 }),
      node({ materialClass: 'COMPONENT', componentType: 'TUBE', qtyNeeded: 100, qtyOnHand: 0 }),
    ]
    expect(deriveLineStatus(input({ nodes }))).toBe('AWAITING_COMPONENT')
  })

  it('lets a manual override win over everything', () => {
    const nodes = [node({ customerProvided: true, qtyNeeded: 100, qtyOnHand: 0 })]
    expect(deriveLineStatus(input({ nodes, manualStatus: 'FILLED_AWAITING_PICKUP' }))).toBe('FILLED_AWAITING_PICKUP')
  })

  it('closes a line whose remaining quantity has reached zero', () => {
    expect(deriveLineStatus(input({ qtyRemaining: 0 }))).toBe('CLOSED')
  })
})

describe('deriveRiskLevel', () => {
  it('is on_track with no required date', () => {
    expect(deriveRiskLevel(input(), TODAY)).toBe('on_track')
  })

  it('is on_track when the required date is comfortably ahead', () => {
    expect(deriveRiskLevel(input({ requiredDeliveryDate: inDays(60) }), TODAY)).toBe('on_track')
  })

  it('is at_risk inside fourteen days', () => {
    expect(deriveRiskLevel(input({ requiredDeliveryDate: inDays(10) }), TODAY)).toBe('at_risk')
  })

  it('is critical when a blocker has no ETA at all', () => {
    const nodes = [node({ qtyNeeded: 100, qtyOnHand: 0, etaDate: null })]
    expect(deriveRiskLevel(input({ nodes, requiredDeliveryDate: inDays(60) }), TODAY)).toBe('critical')
  })

  it('is critical when a blocker ETA lands after the required date', () => {
    const nodes = [node({ qtyNeeded: 100, qtyOnHand: 0, etaDate: inDays(40) })]
    expect(deriveRiskLevel(input({ nodes, requiredDeliveryDate: inDays(30) }), TODAY)).toBe('critical')
  })

  it('is on_track when every blocker lands before the required date', () => {
    const nodes = [node({ qtyNeeded: 100, qtyOnHand: 0, etaDate: inDays(20) })]
    expect(deriveRiskLevel(input({ nodes, requiredDeliveryDate: inDays(60) }), TODAY)).toBe('on_track')
  })

  it('is critical when the required date has already passed', () => {
    expect(deriveRiskLevel(input({ requiredDeliveryDate: inDays(-1) }), TODAY)).toBe('critical')
  })

  it('never reads the clock itself', () => {
    const args = input({ requiredDeliveryDate: inDays(10) })
    expect(deriveRiskLevel(args, new Date('2027-01-01T00:00:00Z'))).toBe('critical')
    expect(deriveRiskLevel(args, TODAY)).toBe('at_risk')
  })
})
