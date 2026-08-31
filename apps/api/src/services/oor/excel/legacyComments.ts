// ─── Legacy comment migration ───────────────────────────────
// The Comments column is the reason this feature exists. Today it is a single
// cell holding a stack of dated entries in the house convention:
//
//   08.18.2026 - Fill date 09.21.2026. Chemical issue resolved. AD
//
// which people append to by hand, week after week, until the cell is the only
// record of what happened to a purchase order. Splitting it into rows is what
// turns that into history you can query, filter and attribute.
//
// The rule that governs every decision here: never discard text. A fragment
// that cannot be dated or attributed still becomes a comment, because the words
// are the asset and the metadata is a bonus.

import type { ParsedComment } from '../sourceAdapter'

// A full dated prefix: 8.18.2026 - or 08.18.2026 -
// Deliberately requires a four-digit year. Short forms like "6.8" and "AC 5.4"
// also appear in these cells, but they are indistinguishable from quantities
// and part-number fragments, so splitting on them would corrupt entries rather
// than separate them. They stay in the body of the entry that carries them.
const ENTRY_PREFIX = /(\d{1,2})\.(\d{1,2})\.(\d{4})\s*-\s*/

/** Trailing author initials: two or three capitals at the very end of an entry. */
const TRAILING_INITIALS = /\s+([A-Z]{2,3})\s*$/

function toDate(month: string, day: string, year: string): Date | null {
  const m = Number(month)
  const d = Number(day)
  const y = Number(year)
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  return new Date(Date.UTC(y, m - 1, d))
}

export function splitLegacyComments(cell: string | null | undefined): ParsedComment[] {
  if (cell === null || cell === undefined) return []
  const text = String(cell).replace(/\r\n/g, '\n').trim()
  if (text === '') return []

  // Split while keeping each delimiter with the segment that follows it, so an
  // entry's date travels with its own text rather than the previous entry's.
  const global = new RegExp(ENTRY_PREFIX.source, 'g')
  const segments: { date: Date | null; body: string }[] = []
  let lastIndex = 0
  let pending: Date | null = null
  let match: RegExpExecArray | null

  while ((match = global.exec(text)) !== null) {
    const body = text.slice(lastIndex, match.index)
    if (body.trim() !== '' || segments.length > 0 || pending !== null) {
      segments.push({ date: pending, body })
    }
    pending = toDate(match[1], match[2], match[3])
    lastIndex = match.index + match[0].length
  }
  segments.push({ date: pending, body: text.slice(lastIndex) })

  return segments
    .map(({ date, body }) => {
      let cleaned = body.trim()
      let authorInitials: string | null = null
      const initials = cleaned.match(TRAILING_INITIALS)
      if (initials) {
        authorInitials = initials[1]
        cleaned = cleaned.slice(0, initials.index).trim()
      }
      return { body: cleaned, entryDate: date, authorInitials }
    })
    .filter((c) => c.body !== '' || c.entryDate !== null)
}
