import ExcelJS from 'exceljs'
import Papa from 'papaparse'

// ─── Spreadsheet → rows ──────────────────────────────────────
// Turns a supplier's emailed stock file into headers + row objects. Format is
// chosen by file extension, since suppliers routinely send a .csv labelled as
// an Excel MIME type and vice versa — the extension is the more reliable
// signal here, and a mislabelled body would fail loudly either way.
//
// Deliberately dumb: this layer knows nothing about SKUs or inventory. It only
// produces `{ headers, rows }`. Meaning is assigned in mapRows.ts.

export interface ParsedSheet {
  headers: string[]
  // One entry per data row, keyed by the raw header text as it appeared.
  rows: Record<string, string>[]
}

export class UnsupportedFileError extends Error {
  constructor(filename: string) {
    super(`Unsupported file type: ${filename} (expected .xlsx, .xls or .csv)`)
    this.name = 'UnsupportedFileError'
  }
}

export class EmptySheetError extends Error {
  constructor(message = 'The file contains no header row') {
    super(message)
    this.name = 'EmptySheetError'
  }
}

const XLSX_EXTENSIONS = ['.xlsx', '.xlsm', '.xls']
const CSV_EXTENSIONS = ['.csv', '.txt']

export function isSupportedFile(filename: string): boolean {
  const lower = filename.toLowerCase()
  return [...XLSX_EXTENSIONS, ...CSV_EXTENSIONS].some((ext) => lower.endsWith(ext))
}

export async function parseSheet(buffer: Buffer, filename: string): Promise<ParsedSheet> {
  const lower = filename.toLowerCase()
  if (XLSX_EXTENSIONS.some((ext) => lower.endsWith(ext))) return parseXlsx(buffer)
  if (CSV_EXTENSIONS.some((ext) => lower.endsWith(ext))) return parseCsv(buffer)
  throw new UnsupportedFileError(filename)
}

// ─── CSV ─────────────────────────────────────────────────────
async function parseCsv(buffer: Buffer): Promise<ParsedSheet> {
  // Strip a UTF-8 BOM — Excel adds one when saving as CSV, and it would
  // otherwise corrupt the first header ("﻿Item" never matches "Item").
  let text = buffer.toString('utf8')
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)

  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
    // Keep everything as text. Coercion belongs in mapRows, where a bad value
    // can be reported against a named column instead of silently becoming NaN.
    dynamicTyping: false,
  })

  const headers = (result.meta.fields || []).filter((h) => h.length > 0)
  if (headers.length === 0) throw new EmptySheetError()

  const rows = result.data
    .map((row) => normalizeRow(row, headers))
    .filter((row) => !isBlankRow(row))

  return { headers, rows }
}

// ─── XLSX ────────────────────────────────────────────────────
async function parseXlsx(buffer: Buffer): Promise<ParsedSheet> {
  const workbook = new ExcelJS.Workbook()
  // ExcelJS types the argument as its own Buffer alias; the Node Buffer is
  // accepted at runtime.
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer)

  const sheet = workbook.worksheets[0]
  if (!sheet) throw new EmptySheetError('The workbook contains no sheets')

  // The header is the first row with at least two non-empty cells. Suppliers
  // frequently prefix exports with a title row or a blank spacer row, so
  // assuming row 1 is the header would misread those files entirely.
  let headerRowNumber = 0
  let headers: string[] = []
  for (let r = 1; r <= Math.min(sheet.rowCount, 20); r++) {
    const values = rowValues(sheet.getRow(r))
    if (values.filter((v) => v.length > 0).length >= 2) {
      headerRowNumber = r
      headers = values
      break
    }
  }
  if (headerRowNumber === 0) throw new EmptySheetError()

  const rows: Record<string, string>[] = []
  for (let r = headerRowNumber + 1; r <= sheet.rowCount; r++) {
    const values = rowValues(sheet.getRow(r))
    const row: Record<string, string> = {}
    headers.forEach((header, i) => {
      if (header) row[header] = values[i] ?? ''
    })
    if (!isBlankRow(row)) rows.push(row)
  }

  return { headers: headers.filter((h) => h.length > 0), rows }
}

// Flatten an ExcelJS row to trimmed strings, preserving column position.
// ExcelJS cell values may be objects (formulas, rich text, hyperlinks); we
// take the displayed result so the importer sees what a human would see.
function rowValues(row: ExcelJS.Row): string[] {
  const out: string[] = []
  // row.values is 1-indexed with a leading hole, hence the offset.
  const raw = (row.values as unknown[]) || []
  for (let i = 1; i < raw.length; i++) {
    out.push(cellToString(raw[i]))
  }
  return out
}

function cellToString(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>
    // Formula cells expose the computed value; rich text exposes segments.
    if ('result' in v) return cellToString(v.result)
    if ('text' in v) return cellToString(v.text)
    if ('richText' in v && Array.isArray(v.richText)) {
      return v.richText.map((seg: any) => seg?.text ?? '').join('').trim()
    }
    if ('hyperlink' in v && 'text' in v) return cellToString(v.text)
  }
  return String(value).trim()
}

function normalizeRow(row: Record<string, unknown>, headers: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const header of headers) {
    out[header] = cellToString(row[header])
  }
  return out
}

function isBlankRow(row: Record<string, string>): boolean {
  return Object.values(row).every((v) => v.trim().length === 0)
}
