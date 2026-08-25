import { describe, it, expect } from 'vitest'
import { NOTIFICATION_CHANNELS, NOTIFICATION_EVENTS } from '@nexus/shared'
import { defaultEnabled, buildMatrix } from './meService'

// ─── Notification matrix ─────────────────────────────────────
// The interesting property is not which defaults were picked but that a stored
// row and an absent row are distinguishable, and that the matrix is always
// complete. Both are what make "reset to defaults" and "change a default
// later" possible.

describe('defaultEnabled', () => {
  it('turns every event on in-app', () => {
    for (const eventKey of NOTIFICATION_EVENTS) {
      expect(defaultEnabled('in_app', eventKey)).toBe(true)
    }
  })

  it('emails only what needs someone to act', () => {
    expect(defaultEnabled('email', 'task_assigned')).toBe(true)
    expect(defaultEnabled('email', 'mention')).toBe(true)
    expect(defaultEnabled('email', 'approval_requested')).toBe(true)
    expect(defaultEnabled('email', 'comment_reply')).toBe(false)
    expect(defaultEnabled('email', 'weekly_summary')).toBe(false)
  })

  it('puts only the weekly summary in the digest', () => {
    expect(defaultEnabled('digest', 'weekly_summary')).toBe(true)
    for (const eventKey of NOTIFICATION_EVENTS.filter((e) => e !== 'weekly_summary')) {
      expect(defaultEnabled('digest', eventKey)).toBe(false)
    }
  })
})

describe('buildMatrix', () => {
  it('returns every channel × event cell even with nothing stored', () => {
    const cells = buildMatrix([])
    expect(cells).toHaveLength(NOTIFICATION_CHANNELS.length * NOTIFICATION_EVENTS.length)
    expect(cells.every((c) => c.isDefault)).toBe(true)
  })

  it('marks a stored cell as not a default, whichever way it was set', () => {
    // Stored `true` on a cell that already defaults to true is still a stored
    // choice. Collapsing the two would make the row look resettable when it is
    // actually pinned.
    const cells = buildMatrix([
      { channel: 'email', eventKey: 'comment_reply', enabled: true },
      { channel: 'in_app', eventKey: 'mention', enabled: true },
    ])
    const email = cells.find((c) => c.channel === 'email' && c.eventKey === 'comment_reply')!
    const inApp = cells.find((c) => c.channel === 'in_app' && c.eventKey === 'mention')!

    expect(email).toMatchObject({ enabled: true, isDefault: false })
    expect(inApp).toMatchObject({ enabled: true, isDefault: false })
  })

  it('lets a stored row override the default in both directions', () => {
    const cells = buildMatrix([
      { channel: 'in_app', eventKey: 'task_assigned', enabled: false },
      { channel: 'digest', eventKey: 'mention', enabled: true },
    ])
    expect(cells.find((c) => c.channel === 'in_app' && c.eventKey === 'task_assigned')!.enabled).toBe(false)
    expect(cells.find((c) => c.channel === 'digest' && c.eventKey === 'mention')!.enabled).toBe(true)
  })

  it('ignores a stored row for a channel or event that no longer exists', () => {
    const cells = buildMatrix([
      { channel: 'sms', eventKey: 'task_assigned', enabled: true },
      { channel: 'email', eventKey: 'retired_event', enabled: true },
    ])
    expect(cells).toHaveLength(NOTIFICATION_CHANNELS.length * NOTIFICATION_EVENTS.length)
    expect(cells.some((c) => c.channel === 'sms')).toBe(false)
    expect(cells.some((c) => c.eventKey === 'retired_event')).toBe(false)
  })

  it('orders cells event-major so the UI renders one row per event', () => {
    const cells = buildMatrix([])
    const firstEvent = cells.slice(0, NOTIFICATION_CHANNELS.length)
    expect(new Set(firstEvent.map((c) => c.eventKey)).size).toBe(1)
    expect(firstEvent.map((c) => c.channel)).toEqual([...NOTIFICATION_CHANNELS])
  })
})
