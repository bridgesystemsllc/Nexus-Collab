// ─── Excel-parity formatting ────────────────────────────────
// The grid has to read like the workbook people already forward to the contract
// manufacturer, so these mirror the source number formats exactly:
// Unit Price $#,##0.00 · Qty Due #,##0 · QTY Need #,##0.0 with negatives in
// parentheses · dates mm-dd-yy.
//
// Parentheses for negatives is not decoration. In a shortage report a negative
// QTY Need means the job is over-committed, and accountants read "(12.5)" as
// that instantly where "-12.5" reads as a typo.

const toNumber = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

export function formatCurrency(value: unknown): string {
  const n = toNumber(value)
  if (n === null) return ''
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Whole units, thousands separated — the Qty Due / RemQty format. */
export function formatQty(value: unknown): string {
  const n = toNumber(value)
  if (n === null) return ''
  return Math.round(n).toLocaleString('en-US')
}

/** One decimal, negatives in parentheses — the QTY Need format. */
export function formatQtyNeed(value: unknown): string {
  const n = toNumber(value)
  if (n === null) return ''
  const text = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return n < 0 ? `(${text})` : text
}

/** mm-dd-yy, in UTC — these are calendar dates, not moments, and shifting them
 *  into the viewer's timezone is how a ship date lands a day early. */
export function formatShortDate(value: unknown): string {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(String(value))
  if (Number.isNaN(d.getTime())) return ''
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const yy = String(d.getUTCFullYear()).slice(2)
  return `${mm}-${dd}-${yy}`
}

export function formatLongDate(value: unknown): string {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(String(value))
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

/** Whole days from today to a required date, negative once it has passed. */
export function daysUntil(value: unknown, today = new Date()): number | null {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(String(value))
  if (Number.isNaN(d.getTime())) return null
  const a = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  const b = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  return Math.round((a - b) / 86_400_000)
}

/** "in 12 days" / "3 days ago" / "today" — the countdown beside a required date. */
export function formatCountdown(value: unknown, today = new Date()): string {
  const days = daysUntil(value, today)
  if (days === null) return ''
  if (days === 0) return 'today'
  if (days > 0) return `in ${days} day${days === 1 ? '' : 's'}`
  const past = Math.abs(days)
  return `${past} day${past === 1 ? '' : 's'} ago`
}

/** A selected range, as TSV, so a paste into Excel lands in cells. */
export function toTsv(rows: string[][]): string {
  return rows.map((r) => r.map((c) => c.replace(/\t/g, ' ').replace(/\n/g, ' ')).join('\t')).join('\n')
}
