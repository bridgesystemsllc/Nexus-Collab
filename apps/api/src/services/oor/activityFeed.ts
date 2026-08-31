// ─── Activity feed ──────────────────────────────────────────
// The tab someone opens to answer "what happened to this PO". Five record
// types, one chronology.
//
// Pure and array-in/array-out on purpose: the merge rules are where this gets
// subtly wrong (a comment carrying an imported entryDate from 2026 sorting
// above one written today), and those rules deserve tests that do not need a
// database to run.

export type ActivityKind = 'comment' | 'note' | 'meeting' | 'email' | 'status'

export interface ActivityEntry {
  id: string
  kind: ActivityKind
  at: Date
  actor: string | null
  summary: string
  payload: unknown
}

export interface FeedParts {
  comments: {
    id: string
    body: string
    createdAt: Date
    entryDate: Date | null
    authorId: string | null
    authorInitials: string | null
    source: string
    deletedAt: Date | null
  }[]
  notes: { id: string; title: string; body: string; createdAt: Date; authorId: string | null; deletedAt: Date | null }[]
  meetingUpdates: {
    id: string
    meetingDate: Date
    meetingTitle: string | null
    decision: string | null
    nextAction: string | null
    createdAt: Date
    authorId: string | null
    deletedAt: Date | null
  }[]
  emails: { id: string; createdAt: Date; createdBy: string | null; payload: unknown; deletedAt: Date | null }[]
  statusEvents: {
    id: string
    createdAt: Date
    actorId: string | null
    actorEmailSnapshot: string | null
    changes: unknown
    metadata: unknown
  }[]
}

const firstLine = (text: string, max = 140): string => {
  const line = text.split('\n')[0]!.trim()
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

function describeChanges(changes: unknown): string {
  if (!changes || typeof changes !== 'object') return 'updated'
  const entries = Object.entries(changes as Record<string, { from?: unknown; to?: unknown }>)
  if (entries.length === 0) return 'updated'
  return entries
    .map(([field, change]) => `${field}: ${change?.from ?? '—'} → ${change?.to ?? '—'}`)
    .join(', ')
}

/**
 * Merges the five sources into one reverse-chronological list.
 *
 * Ordering uses createdAt — when the record was written — not entryDate or
 * meetingDate, which describe when the thing being recorded happened. A comment
 * migrated from a 2026 spreadsheet cell was written today; sorting it by its
 * historical date would bury this week's work under imported history.
 */
export function buildActivityFeed(parts: FeedParts, kinds?: ActivityKind[]): ActivityEntry[] {
  const wanted = kinds && kinds.length > 0 ? new Set(kinds) : null
  const include = (k: ActivityKind) => !wanted || wanted.has(k)
  const entries: ActivityEntry[] = []

  if (include('comment')) {
    for (const c of parts.comments) {
      if (c.deletedAt) continue
      entries.push({
        id: c.id,
        kind: 'comment',
        at: c.createdAt,
        actor: c.authorId ?? c.authorInitials,
        summary: firstLine(c.body),
        payload: c,
      })
    }
  }

  if (include('note')) {
    for (const n of parts.notes) {
      if (n.deletedAt) continue
      entries.push({ id: n.id, kind: 'note', at: n.createdAt, actor: n.authorId, summary: n.title, payload: n })
    }
  }

  if (include('meeting')) {
    for (const m of parts.meetingUpdates) {
      if (m.deletedAt) continue
      const summary = m.decision ?? m.nextAction ?? m.meetingTitle ?? 'Meeting update'
      entries.push({ id: m.id, kind: 'meeting', at: m.createdAt, actor: m.authorId, summary: firstLine(summary), payload: m })
    }
  }

  if (include('email')) {
    for (const e of parts.emails) {
      if (e.deletedAt) continue
      const subject = (e.payload as { subject?: string } | null)?.subject ?? 'Email'
      entries.push({ id: e.id, kind: 'email', at: e.createdAt, actor: e.createdBy, summary: firstLine(subject), payload: e })
    }
  }

  if (include('status')) {
    for (const s of parts.statusEvents) {
      entries.push({
        id: s.id,
        kind: 'status',
        at: s.createdAt,
        actor: s.actorId ?? s.actorEmailSnapshot,
        summary: describeChanges(s.changes),
        payload: s,
      })
    }
  }

  // Ties break by kind then id so the order is total, not merely sorted: two
  // records written in the same millisecond must not swap places between
  // requests, or the reader sees the feed reshuffle when they refresh.
  return entries.sort((a, b) => {
    const delta = b.at.getTime() - a.at.getTime()
    if (delta !== 0) return delta
    if (a.kind !== b.kind) return a.kind.localeCompare(b.kind)
    return a.id.localeCompare(b.id)
  })
}
