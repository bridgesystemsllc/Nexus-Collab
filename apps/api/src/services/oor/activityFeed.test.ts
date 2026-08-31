import { describe, it, expect } from 'vitest'
import { buildActivityFeed, type FeedParts } from './activityFeed'

const at = (iso: string) => new Date(iso)
const empty: FeedParts = { comments: [], notes: [], meetingUpdates: [], emails: [], statusEvents: [] }

const parts = (over: Partial<FeedParts> = {}): FeedParts => ({ ...empty, ...over })

describe('buildActivityFeed', () => {
  it('merges every kind into one reverse-chronological list', () => {
    const feed = buildActivityFeed(
      parts({
        comments: [{ id: 'c1', body: 'Called the CM', createdAt: at('2026-08-20'), entryDate: null, authorId: 'm1', authorInitials: null, source: 'app', deletedAt: null }],
        notes: [{ id: 'n1', title: 'Packaging spec', body: '...', createdAt: at('2026-08-22'), authorId: 'm1', deletedAt: null }],
        meetingUpdates: [{ id: 'g1', meetingDate: at('2026-08-18'), meetingTitle: 'Ops sync', decision: 'Ship partial', nextAction: null, createdAt: at('2026-08-21'), authorId: 'm1', deletedAt: null }],
        emails: [{ id: 'e1', createdAt: at('2026-08-23'), createdBy: 'm1', payload: { subject: 'ETA update' }, deletedAt: null }],
        statusEvents: [{ id: 's1', createdAt: at('2026-08-19'), actorId: 'm1', actorEmailSnapshot: null, changes: { lineStatus: { from: 'OPEN', to: 'IN_PRODUCTION' } }, metadata: null }],
      }),
    )
    expect(feed.map((e) => e.id)).toEqual(['e1', 'n1', 'g1', 'c1', 's1'])
  })

  it('orders by when the record was written, not by the date it describes', () => {
    // A comment migrated from a spreadsheet carries a 2026 entryDate but was
    // written today; sorting on entryDate would bury this week under history.
    const feed = buildActivityFeed(
      parts({
        comments: [
          { id: 'imported', body: 'Fill date 09.21', createdAt: at('2026-08-30'), entryDate: at('2026-02-01'), authorId: null, authorInitials: 'AD', source: 'imported_legacy', deletedAt: null },
          { id: 'today', body: 'Confirmed with the CM', createdAt: at('2026-08-29'), entryDate: null, authorId: 'm1', authorInitials: null, source: 'app', deletedAt: null },
        ],
      }),
    )
    expect(feed.map((e) => e.id)).toEqual(['imported', 'today'])
  })

  it('hides soft-deleted records without losing them from the store', () => {
    const feed = buildActivityFeed(
      parts({
        comments: [
          { id: 'gone', body: 'oops', createdAt: at('2026-08-25'), entryDate: null, authorId: 'm1', authorInitials: null, source: 'app', deletedAt: at('2026-08-26') },
          { id: 'kept', body: 'real', createdAt: at('2026-08-24'), entryDate: null, authorId: 'm1', authorInitials: null, source: 'app', deletedAt: null },
        ],
      }),
    )
    expect(feed.map((e) => e.id)).toEqual(['kept'])
  })

  it('filters to the kinds asked for', () => {
    const feed = buildActivityFeed(
      parts({
        comments: [{ id: 'c1', body: 'x', createdAt: at('2026-08-20'), entryDate: null, authorId: null, authorInitials: null, source: 'app', deletedAt: null }],
        notes: [{ id: 'n1', title: 'y', body: 'y', createdAt: at('2026-08-21'), authorId: null, deletedAt: null }],
      }),
      ['note'],
    )
    expect(feed.map((e) => e.id)).toEqual(['n1'])
  })

  it('renders a status change as something a person can read', () => {
    const feed = buildActivityFeed(
      parts({
        statusEvents: [{ id: 's1', createdAt: at('2026-08-19'), actorId: null, actorEmailSnapshot: 'ops@example.com', changes: { lineStatus: { from: 'OPEN', to: 'ON_HOLD_QC' } }, metadata: { reason: 'Failed micro' } }],
      }),
    )
    expect(feed[0].summary).toBe('lineStatus: OPEN → ON_HOLD_QC')
    expect(feed[0].actor).toBe('ops@example.com')
  })

  it('summarises a multi-line comment by its first line only', () => {
    const feed = buildActivityFeed(
      parts({
        comments: [{ id: 'c1', body: 'Fill moved\nSecond line\nThird', createdAt: at('2026-08-20'), entryDate: null, authorId: null, authorInitials: null, source: 'app', deletedAt: null }],
      }),
    )
    expect(feed[0].summary).toBe('Fill moved')
  })

  it('breaks ties deterministically so a refresh cannot reshuffle the feed', () => {
    const same = at('2026-08-20T10:00:00Z')
    const feed = buildActivityFeed(
      parts({
        comments: [{ id: 'zzz', body: 'a', createdAt: same, entryDate: null, authorId: null, authorInitials: null, source: 'app', deletedAt: null }],
        notes: [{ id: 'aaa', title: 'b', body: 'b', createdAt: same, authorId: null, deletedAt: null }],
      }),
    )
    expect(feed.map((e) => e.id)).toEqual(['zzz', 'aaa'])
    expect(buildActivityFeed(parts({
      comments: [{ id: 'zzz', body: 'a', createdAt: same, entryDate: null, authorId: null, authorInitials: null, source: 'app', deletedAt: null }],
      notes: [{ id: 'aaa', title: 'b', body: 'b', createdAt: same, authorId: null, deletedAt: null }],
    })).map((e) => e.id)).toEqual(['zzz', 'aaa'])
  })

  it('returns nothing for a line with no history', () => {
    expect(buildActivityFeed(empty)).toEqual([])
  })
})
