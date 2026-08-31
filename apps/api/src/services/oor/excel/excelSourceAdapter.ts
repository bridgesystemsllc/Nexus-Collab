// ─── Excel source adapter ───────────────────────────────────
// The file drop, expressed as a SourceAdapter. Detection reads the header row
// and routes to the matching parser; an unrecognised workbook fails loudly and
// names the headers it did find, because "import failed" without that list
// sends the operator back to a spreadsheet with no idea what to change.

import * as XLSX from 'xlsx'
import type { ParsedReport, SourceAdapter, SourceInput } from '../sourceAdapter'
import { detectFormat } from './detectFormat'
import { parseCustomerOpenOrder } from './parseCustomerOpenOrder'
import { parseShortageReport } from './parseShortageReport'

export class ExcelSourceAdapter implements SourceAdapter {
  readonly key = 'excel'

  async load(input: SourceInput): Promise<ParsedReport> {
    if (!input.buffer) throw new Error('ExcelSourceAdapter requires a file buffer')
    const wb = XLSX.read(input.buffer, { cellNF: true })
    const sheetName = wb.SheetNames[0]
    const sheet = wb.Sheets[sheetName]
    if (!sheet) throw new Error('The uploaded workbook has no sheets.')

    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, blankrows: false })
    // The header is on row 2 in both reports, but a banner row is not
    // guaranteed, so try each of the first few rows before giving up.
    let format: ReturnType<typeof detectFormat> | null = null
    let lastError: unknown = null
    for (const candidate of rows.slice(0, 5)) {
      try {
        format = detectFormat(candidate ?? [])
        break
      } catch (err) {
        lastError = err
      }
    }
    if (!format) throw lastError ?? new Error('Could not identify the report format.')

    const filename = input.filename ?? 'upload'
    return format === 'customer_open_order'
      ? parseCustomerOpenOrder(sheet, filename)
      : parseShortageReport(sheet, filename)
  }
}
