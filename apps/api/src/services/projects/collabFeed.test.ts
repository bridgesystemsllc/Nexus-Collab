import { describe, it, expect } from 'vitest'
import { mergeFeeds, type FeedEntry } from './collabFeed'

// Merging two paginated streams is where a feed loses entries silently: nothing
// errors, items just stop showing up on page two. These pin the windowing.

const entry = (id: string, iso: string, source: FeedEntry['source']): FeedEntry => ({
  id, type: 'UPDATE', content: id, coworkSpaceId: 'c1',
  authorId: 'm1', author: { id: 'm1', name: 'Ana', avatar: null },
  metadata: null, createdAt: new Date(iso), source,
  project: source === 'PROJECT' ? { id: 'p1', projectNumber: 'PRJ-1', title: 'P' } : null,
})

const collab = [
  entry('c-3', '2026-08-10T12:00:00Z', 'COLLAB'),
  entry('c-2', '2026-08-08T12:00:00Z', 'COLLAB'),
  entry('c-1', '2026-08-01T12:00:00Z', 'COLLAB'),
]
const project = [
  entry('p-3', '2026-08-09T12:00:00Z', 'PROJECT'),
  entry('p-2', '2026-08-05T12:00:00Z', 'PROJECT'),
  entry('p-1', '2026-08-02T12:00:00Z', 'PROJECT'),
]

describe('mergeFeeds', () => {
  it('interleaves both sources newest-first', () => {
    expect(mergeFeeds(collab, project, 0, 10).map((e) => e.id)).toEqual([
      'c-3', 'p-3', 'c-2', 'p-2', 'p-1', 'c-1',
    ])
  })

  it('pages without dropping or repeating an entry', () => {
    const page1 = mergeFeeds(collab, project, 0, 2).map((e) => e.id)
    const page2 = mergeFeeds(collab, project, 2, 2).map((e) => e.id)
    const page3 = mergeFeeds(collab, project, 4, 2).map((e) => e.id)

    expect(page1).toEqual(['c-3', 'p-3'])
    expect(page2).toEqual(['c-2', 'p-2'])
    expect(page3).toEqual(['p-1', 'c-1'])
    // Six distinct entries across three pages — none lost, none seen twice.
    expect(new Set([...page1, ...page2, ...page3]).size).toBe(6)
  })

  it('does not lose the older source when one stream dominates the top', () => {
    // The exact failure mode of taking `limit` from each side and merging:
    // five recent collab posts would push every project event off page one and
    // it would never reappear.
    const busy = Array.from({ length: 5 }, (_, i) =>
      entry(`c-busy-${i}`, `2026-08-2${i}T12:00:00Z`, 'COLLAB'),
    )
    const merged = mergeFeeds(busy, project, 0, 8).map((e) => e.source)
    expect(merged.filter((s) => s === 'PROJECT')).toHaveLength(3)
  })

  it('returns everything when the page is larger than both streams', () => {
    expect(mergeFeeds(collab, project, 0, 100)).toHaveLength(6)
  })

  it('returns an empty page past the end rather than throwing', () => {
    expect(mergeFeeds(collab, project, 50, 10)).toEqual([])
  })

  it('works when one source is empty', () => {
    expect(mergeFeeds([], project, 0, 10).map((e) => e.id)).toEqual(['p-3', 'p-2', 'p-1'])
    expect(mergeFeeds(collab, [], 0, 10).map((e) => e.id)).toEqual(['c-3', 'c-2', 'c-1'])
    expect(mergeFeeds([], [], 0, 10)).toEqual([])
  })

  it('orders same-instant entries deterministically', () => {
    // Two events in the same millisecond must not swap between requests, or
    // pagination shifts under the reader.
    const a = entry('zzz', '2026-08-10T12:00:00Z', 'COLLAB')
    const b = entry('aaa', '2026-08-10T12:00:00Z', 'PROJECT')
    const once = mergeFeeds([a], [b], 0, 10).map((e) => e.id)
    const again = mergeFeeds([a], [b], 0, 10).map((e) => e.id)
    expect(once).toEqual(again)
    expect(once).toEqual(['aaa', 'zzz'])
  })

  it('keeps the source and project tags that let the UI tell them apart', () => {
    const merged = mergeFeeds(collab, project, 0, 10)
    const fromProject = merged.find((e) => e.source === 'PROJECT')
    expect(fromProject?.project?.projectNumber).toBe('PRJ-1')
    expect(merged.find((e) => e.source === 'COLLAB')?.project).toBeNull()
  })
})
