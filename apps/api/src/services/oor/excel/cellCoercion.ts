// ─── Dirty-cell coercion ────────────────────────────────────
// These reports are hand-touched before they are sent, so roughly one cell in
// five carries something a spreadsheet accepted and a parser should not: a date
// typed as text in one row and a serial in the next, a quantity holding two
// numbers, a currency with a period where a comma belongs.
//
// Nothing in this file throws. A value that cannot be read returns null with a
// warning attached, so an import always completes and the operator sees exactly
// which cells need a human. That is the difference between a report that lands
// with 10 flagged rows and one that lands not at all.

import * as XLSX from 'xlsx'
import type { ParseWarning, FulfillmentType } from '../sourceAdapter'

export interface CellContext {
  rowNumber: number
  column: string
}

export interface Coerced<T> {
  value: T | null
  raw?: string | null
  warning?: ParseWarning
}

const isBlank = (v: unknown): boolean =>
  v === null || v === undefined || (typeof v === 'string' && v.trim() === '')

function warn(ctx: CellContext, raw: unknown, reason: string): ParseWarning {
  return {
    rowNumber: ctx.rowNumber,
    column: ctx.column,
    rawValue: String(raw),
    storedValue: null,
    reason,
  }
}

/**
 * Excel serial or text date to a UTC Date.
 *
 * The report mixes both encodings in the same column — 17 serials and 33 text
 * cells in the AcneFree fixture's `Orig Date` alone — because some rows were
 * retyped by hand after Crystal Reports produced them. Text cells carry padding
 * inside the value (`7/ 2/26`), so whitespace is stripped before matching.
 */
export function coerceDate(value: unknown, ctx: CellContext): Coerced<Date> {
  if (isBlank(value)) return { value: null }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (!parsed) return { value: null, warning: warn(ctx, value, 'Unreadable date serial') }
    return { value: new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d)) }
  }

  const text = String(value).replace(/\s+/g, '')
  const m = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/)
  if (!m) return { value: null, warning: warn(ctx, value, 'Unreadable date value') }

  const [, mm, dd, yy] = m
  // A two-digit year in these reports is always this century; the source has no
  // pre-2000 open orders and never will.
  const year = yy.length === 2 ? 2000 + Number(yy) : Number(yy)
  const month = Number(mm)
  const day = Number(dd)
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return { value: null, warning: warn(ctx, value, 'Date out of range') }
  }
  return { value: new Date(Date.UTC(year, month - 1, day)) }
}

/**
 * A quantity cell. One row in the AcneFree fixture holds `"50000+\n16,400"` —
 * two fills stacked into one cell — which is information, not corruption, so
 * the raw text is preserved for the reviewer rather than coerced to a guess.
 */
export function coerceNumber(value: unknown, ctx: CellContext): Coerced<number> {
  if (isBlank(value)) return { value: null, raw: null }
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? { value, raw: String(value) }
      : { value: null, raw: String(value), warning: warn(ctx, value, 'Non-finite quantity') }
  }

  const raw = String(value)
  const cleaned = raw.replace(/,/g, '').trim()
  if (/^-?\d+(\.\d+)?$/.test(cleaned)) return { value: Number(cleaned), raw }
  return { value: null, raw, warning: warn(ctx, raw, 'Quantity is not a single number') }
}

/**
 * A currency cell. A string carrying more than one decimal point is rejected
 * rather than guessed at: `$114.004.22` is a typo for `$114,005.22`, and which
 * separator was intended is not something a parser gets to decide.
 */
export function coerceCurrency(value: unknown, ctx: CellContext): Coerced<number> {
  if (isBlank(value)) return { value: null, raw: null }
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? { value, raw: String(value) }
      : { value: null, raw: String(value), warning: warn(ctx, value, 'Non-finite currency') }
  }

  const raw = String(value)
  const cleaned = raw.replace(/[$\s]/g, '').replace(/,/g, '')
  if ((cleaned.match(/\./g) ?? []).length > 1) {
    return { value: null, raw, warning: warn(ctx, raw, 'Ambiguous currency value: more than one decimal point') }
  }
  if (/^-?\d+(\.\d+)?$/.test(cleaned)) return { value: Number(cleaned), raw }
  return { value: null, raw, warning: warn(ctx, raw, 'Unreadable currency value') }
}

/**
 * `P06282025>AMZ` names both a PO and the channel it belongs to. The suffix is
 * how operations tells an Amazon order from a retail one, so it is split out
 * rather than normalised away.
 */
export function splitChannelTag(value: unknown): { poNumber: string; channelTag: string | null } {
  const raw = String(value ?? '').trim()
  const idx = raw.indexOf('>')
  if (idx === -1) return { poNumber: raw, channelTag: null }
  return {
    poNumber: raw.slice(0, idx).trim(),
    channelTag: raw.slice(idx + 1).trim() || null,
  }
}

/** A work order means a contract manufacturer is building it; MISC lines are fees. */
export function classifyFulfillment(
  itemNumber: unknown,
  workOrderNumber: unknown,
): FulfillmentType {
  const item = String(itemNumber ?? '').trim().toUpperCase()
  if (item === 'MISC') return 'MISC'
  if (!isBlank(workOrderNumber)) return 'CONTRACT_MFG'
  return 'INTERNAL'
}
