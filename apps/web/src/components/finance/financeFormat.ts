// Shared null-safe formatting helpers for the Finance costing hub.
// Cost fields throughout the finance API can be 0, null, or undefined, so every
// display path goes through these so the UI never prints "NaN" / "$null".

/** Currency with configurable precision. Null/undefined/NaN → em dash. */
export function fmtCurrency(value: unknown, digits = 2): string {
  const n = toNum(value)
  if (n == null) return '—'
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
}

/** Percent with one decimal. Null/undefined/NaN → em dash. */
export function fmtPct(value: unknown, digits = 1): string {
  const n = toNum(value)
  if (n == null) return '—'
  return `${n.toFixed(digits)}%`
}

/** Integer with thousands separators. Null → em dash. */
export function fmtInt(value: unknown): string {
  const n = toNum(value)
  if (n == null) return '—'
  return Math.round(n).toLocaleString('en-US')
}

/** Coerce to a finite number, or null. */
export function toNum(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

/** YYYYMMDD stamp for export filenames. */
export function dateStamp(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}
