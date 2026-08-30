import { describe, it, expect } from 'vitest'
import { statusPresentation, graceCopy } from './present'

describe('statusPresentation', () => {
  it('shows active as a success pill with a live dot', () => {
    const p = statusPresentation('active', 'full')
    expect(p.tone).toBe('success')
    expect(p.live).toBe(true)
    expect(p.label).toBe('Active')
  })
  it('shows trialing as accent, not success — a trial is not a paying state', () => {
    expect(statusPresentation('trialing', 'full').tone).toBe('accent')
  })
  it('shows past_due as a warning while access is still full', () => {
    const p = statusPresentation('past_due', 'full')
    expect(p.tone).toBe('warning')
    expect(p.live).toBe(false)
  })
  it('escalates past_due to danger once access is read-only', () => {
    // The visual must change when the grace period actually lapses; a static
    // amber pill through both states hides the moment it starts mattering.
    expect(statusPresentation('past_due', 'read_only').tone).toBe('danger')
  })
  it('shows canceled as neutral, not danger, while access remains', () => {
    expect(statusPresentation('canceled', 'full').tone).toBe('neutral')
  })
  it('describes no subscription without inventing a status', () => {
    const p = statusPresentation(null, 'locked')
    expect(p.label).toBe('No subscription')
    expect(p.tone).toBe('neutral')
  })
})

describe('graceCopy', () => {
  const now = new Date('2026-08-30T12:00:00Z')
  it('names the deadline in days when several remain', () => {
    expect(graceCopy('2026-09-04T12:00:00Z', now)).toContain('5 days')
  })
  it('uses the singular on the last day', () => {
    expect(graceCopy('2026-08-31T12:00:00Z', now)).toContain('1 day')
  })
  it('says access ends today rather than "in 0 days"', () => {
    expect(graceCopy('2026-08-30T20:00:00Z', now)).toMatch(/today/i)
  })
  it('states access is already restricted once the grace period has passed', () => {
    expect(graceCopy('2026-08-28T12:00:00Z', now)).toMatch(/read-only|restricted/i)
  })
})
