import { describe, it, expect } from 'vitest'
import { diffFields } from './activity'

// The activity feed's field diff. Its whole job is to be quiet about things
// that did not change — the failure mode is not a crash, it is an audit trail
// so noisy that a real edit is invisible among the false ones.
//
// The two shapes it has to reconcile: Prisma hands back Date objects and
// Decimals, a request body hands over ISO strings and numbers. Naive equality
// reports every untouched date and price as an edit.

describe('diffFields', () => {
  it('reports only the fields present in the patch', () => {
    // A partial PATCH must not report every untouched column.
    const changes = diffFields(
      { title: 'A', status: 'ACTIVE', priority: 'HIGH' },
      { title: 'B' },
    )
    expect(Object.keys(changes)).toEqual(['title'])
    expect(changes.title).toEqual({ from: 'A', to: 'B' })
  })

  it('says nothing when a field is set to the value it already had', () => {
    expect(diffFields({ title: 'A' }, { title: 'A' })).toEqual({})
  })

  it('ignores updatedAt by default', () => {
    const changes = diffFields(
      { updatedAt: new Date('2026-01-01'), title: 'A' },
      { updatedAt: new Date('2026-02-01'), title: 'A' },
    )
    expect(changes).toEqual({})
  })

  it('honours a custom ignore list', () => {
    const changes = diffFields({ a: 1, b: 2 }, { a: 9, b: 9 }, ['a'])
    expect(Object.keys(changes)).toEqual(['b'])
  })

  it('treats a Date and its ISO string as the same value', () => {
    // Prisma returns a Date; the request body carries a string. Without this,
    // every PATCH would report an unchanged due date as an edit.
    const d = new Date('2026-03-01T00:00:00.000Z')
    expect(diffFields({ dueDate: d }, { dueDate: '2026-03-01T00:00:00.000Z' })).toEqual({})
  })

  it('still reports a genuinely different date', () => {
    const changes = diffFields(
      { dueDate: new Date('2026-03-01T00:00:00.000Z') },
      { dueDate: '2026-04-01T00:00:00.000Z' },
    )
    expect(changes.dueDate).toEqual({
      from: '2026-03-01T00:00:00.000Z',
      to: '2026-04-01T00:00:00.000Z',
    })
  })

  it('normalises Dates to ISO strings so the stored diff survives JSON', () => {
    const changes = diffFields({ d: null }, { d: new Date('2026-05-05T12:00:00.000Z') })
    expect(changes.d!.to).toBe('2026-05-05T12:00:00.000Z')
  })

  it('compares arrays by content, not identity', () => {
    expect(diffFields({ tags: ['a', 'b'] }, { tags: ['a', 'b'] })).toEqual({})
  })

  it('reports an array whose contents or order changed', () => {
    expect(Object.keys(diffFields({ tags: ['a', 'b'] }, { tags: ['b', 'a'] }))).toEqual(['tags'])
    expect(Object.keys(diffFields({ tags: ['a'] }, { tags: ['a', 'b'] }))).toEqual(['tags'])
  })

  it('treats a Decimal and its numeric equivalent as unchanged', () => {
    // Prisma Decimal stringifies; a request body sends a number.
    const decimal = { toString: () => '1500', toNumber: () => 1500 }
    expect(diffFields({ budgetAmount: decimal }, { budgetAmount: 1500 })).toEqual({})
  })

  it('unwraps a Decimal to a number in the recorded diff', () => {
    const decimal = { toString: () => '1500', toNumber: () => 1500 }
    const changes = diffFields({ budgetAmount: decimal }, { budgetAmount: 2000 })
    expect(changes.budgetAmount).toEqual({ from: 1500, to: 2000 })
  })

  it('skips undefined, which means "not supplied", not "cleared"', () => {
    // Conflating the two would log a spurious clear on every partial PATCH.
    expect(diffFields({ ownerId: 'm1' }, { ownerId: undefined })).toEqual({})
  })

  it('reports an explicit null, which does mean cleared', () => {
    expect(diffFields({ ownerId: 'm1' }, { ownerId: null })).toEqual({
      ownerId: { from: 'm1', to: null },
    })
  })

  it('treats null and undefined on both sides as unchanged', () => {
    expect(diffFields({ a: null }, { a: null })).toEqual({})
  })

  it('reports a field appearing for the first time', () => {
    expect(diffFields({}, { title: 'New' })).toEqual({ title: { from: undefined, to: 'New' } })
  })

  it('returns an empty object for an empty patch', () => {
    expect(diffFields({ a: 1 }, {})).toEqual({})
  })
})
