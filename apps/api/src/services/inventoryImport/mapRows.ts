import type { ParsedSheet } from './parseSheet'

// ─── Rows → inventory records ────────────────────────────────
// Assigns meaning to a parsed sheet using a configurable column mapping, so a
// supplier renaming "On Hand" to "OnHand Qty" is a config edit rather than a
// code change.
//
// This layer is where a file is judged trustworthy. It reports failures per
// row and per column instead of coercing junk into zeros — a silently wrong
// quantity is far more damaging than a refused import, because it flows
// straight into purchasing decisions.

export interface ColumnMap {
  sku: string
  name?: string
  brand?: string
  onHand?: string
  committed?: string
  available?: string
}

export interface InventoryRecord {
  sku: string
  name: string
  brand: string
  onHand: number
  committed: number
  available: number
}

export interface RowError {
  // 1-based index among data rows, matching what a person counting rows
  // beneath the header would say.
  row: number
  reason: string
}

export interface MapResult {
  records: InventoryRecord[]
  errors: RowError[]
  // Rows dropped as duplicates of an earlier SKU (last occurrence wins).
  duplicateSkus: string[]
}

export class MappingError extends Error {
  readonly expected: string[]
  readonly found: string[]

  constructor(missing: string[], found: string[]) {
    super(
      `Sheet is missing required column(s): ${missing.join(', ')}. ` +
        `Found headers: ${found.join(', ') || '(none)'}`,
    )
    this.name = 'MappingError'
    this.expected = missing
    this.found = found
  }
}

// Header matching is case-insensitive and whitespace-collapsing. Suppliers are
// inconsistent about capitalisation and padding between exports, and a failed
// import over " On Hand " vs "On Hand" would be a false alarm.
function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, ' ')
}

function resolveHeader(headers: string[], wanted: string | undefined): string | null {
  if (!wanted) return null
  const target = normalizeHeader(wanted)
  return headers.find((h) => normalizeHeader(h) === target) ?? null
}

// Parses a quantity cell. Tolerates thousands separators and currency-style
// parentheses for negatives, both of which appear in real exports. Returns
// null when the cell cannot be read as a number so the caller can decide.
export function parseQuantity(raw: string | undefined): number | null {
  if (raw == null) return null
  let text = raw.trim()
  if (text === '' || text === '-') return null

  let negative = false
  if (/^\(.*\)$/.test(text)) {
    negative = true
    text = text.slice(1, -1)
  }

  text = text.replace(/,/g, '').replace(/\s/g, '')
  if (text.startsWith('-')) {
    negative = true
    text = text.slice(1)
  }

  if (!/^\d+(\.\d+)?$/.test(text)) return null
  const value = Number(text)
  if (!Number.isFinite(value)) return null
  return negative ? -value : value
}

export function mapRows(sheet: ParsedSheet, columnMap: ColumnMap): MapResult {
  const skuHeader = resolveHeader(sheet.headers, columnMap.sku)
  if (!skuHeader) throw new MappingError([columnMap.sku], sheet.headers)

  const nameHeader = resolveHeader(sheet.headers, columnMap.name)
  const brandHeader = resolveHeader(sheet.headers, columnMap.brand)
  const onHandHeader = resolveHeader(sheet.headers, columnMap.onHand)
  const committedHeader = resolveHeader(sheet.headers, columnMap.committed)
  const availableHeader = resolveHeader(sheet.headers, columnMap.available)

  // A stock file with no quantity column at all is meaningless, and applying
  // it would zero out every SKU. Refuse it rather than destroy the snapshot.
  if (!onHandHeader && !availableHeader) {
    const wanted = [columnMap.onHand, columnMap.available].filter(Boolean) as string[]
    throw new MappingError(wanted.length ? wanted : ['onHand or available'], sheet.headers)
  }

  const records: InventoryRecord[] = []
  const errors: RowError[] = []
  const duplicateSkus: string[] = []
  const indexBySku = new Map<string, number>()

  sheet.rows.forEach((row, i) => {
    const rowNumber = i + 1
    const sku = (row[skuHeader] ?? '').trim()
    if (!sku) {
      errors.push({ row: rowNumber, reason: 'Missing SKU' })
      return
    }

    const onHand = onHandHeader ? parseQuantity(row[onHandHeader]) : null
    const committed = committedHeader ? parseQuantity(row[committedHeader]) : null
    const available = availableHeader ? parseQuantity(row[availableHeader]) : null

    if (onHandHeader && onHand == null) {
      errors.push({ row: rowNumber, reason: `${sku}: unreadable "${columnMap.onHand}" value "${row[onHandHeader]}"` })
      return
    }
    if (availableHeader && available == null) {
      errors.push({ row: rowNumber, reason: `${sku}: unreadable "${columnMap.available}" value "${row[availableHeader]}"` })
      return
    }
    // A committed column that is present but unreadable is a soft failure: the
    // stock figures that matter are still trustworthy, so treat it as zero
    // rather than discarding the row.
    const committedValue = committed ?? 0

    const onHandValue = onHand ?? (available ?? 0) + committedValue
    // Fall back to onHand - committed when the supplier omits an available
    // column, which is how availability is defined everywhere else in Nexus.
    const availableValue = available ?? onHandValue - committedValue

    const record: InventoryRecord = {
      sku,
      name: nameHeader ? (row[nameHeader] ?? '').trim() : '',
      brand: brandHeader ? (row[brandHeader] ?? '').trim() : '',
      onHand: onHandValue,
      committed: committedValue,
      available: availableValue,
    }

    // Suppliers sometimes emit one line per lot or per pick location. Last
    // occurrence wins, which matches how a full-snapshot feed is meant to read.
    const existing = indexBySku.get(sku)
    if (existing != null) {
      duplicateSkus.push(sku)
      records[existing] = record
      return
    }
    indexBySku.set(sku, records.length)
    records.push(record)
  })

  return { records, errors, duplicateSkus }
}
