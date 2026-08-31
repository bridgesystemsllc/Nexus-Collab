// ─── Format A: Customer Open Order Report ───────────────────
// Crystal Reports "Customer Open Order Rpt": one row per open sales-order line,
// a `Customer:` banner in A1, the header on row 2, data from row 3.
//
// Columns are resolved by label rather than by position. Upstream adds columns
// without warning, and an index-based reader would silently start writing ship
// dates into the price field the first time that happened.

import * as XLSX from 'xlsx'
import type { ParsedLine, ParsedReport, ParseWarning } from '../sourceAdapter'
import {
  coerceCurrency,
  coerceDate,
  coerceNumber,
  classifyFulfillment,
  splitChannelTag,
} from './cellCoercion'
import { splitLegacyComments } from './legacyComments'

const COLUMNS = {
  customerPo: 'Customer PO Number',
  order: 'Order',
  item: 'Item#',
  description: 'Description',
  qtys: 'Qtys',
  remQty: 'RemQty',
  price: 'Price',
  value: 'Value',
  ordDt: 'OrdDt',
  shipDt: 'ShipDt',
  origDate: 'Orig Date',
  reqDel: 'Req.Del',
  wo: 'WO',
  comments: 'Comments',
} as const

/** Recomputed and source values may differ by at most this much before it counts. */
const VALUE_TOLERANCE = 0.02

const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

function buildHeaderIndex(rows: unknown[][]): { index: Map<string, number>; headerRow: number } {
  // The banner row is optional — some exports drop it — so find the row that
  // actually carries the signature column rather than assuming row 2.
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const cells = (rows[r] ?? []).map((c) => String(c ?? '').trim())
    if (cells.some((c) => c.toLowerCase() === COLUMNS.customerPo.toLowerCase())) {
      const index = new Map<string, number>()
      cells.forEach((label, i) => {
        if (label !== '' && !index.has(label)) index.set(label, i)
      })
      return { index, headerRow: r }
    }
  }
  throw new Error(`Could not find the "${COLUMNS.customerPo}" header row in this workbook.`)
}

export function parseCustomerOpenOrder(sheet: XLSX.WorkSheet, filename: string): ParsedReport {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, blankrows: false })
  const { index, headerRow } = buildHeaderIndex(rows)
  const warnings: ParseWarning[] = []
  const lines: ParsedLine[] = []

  const at = (row: unknown[], column: string): unknown => {
    const i = index.get(column)
    return i === undefined ? undefined : row[i]
  }

  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] ?? []
    const poCell = at(row, COLUMNS.customerPo)
    const orderCell = at(row, COLUMNS.order)
    // Spacing and subtotal rows carry neither identifier.
    if (str(poCell) === null && str(orderCell) === null) continue

    const rowNumber = r + 1 // 1-based, so it matches what the operator sees in Excel
    const ctx = (column: string) => ({ rowNumber, column })
    const collect = <T,>(c: { value: T | null; raw?: string | null; warning?: ParseWarning }) => {
      if (c.warning) warnings.push(c.warning)
      return c
    }

    const { poNumber, channelTag } = splitChannelTag(poCell)
    const qtys = collect(coerceNumber(at(row, COLUMNS.qtys), ctx(COLUMNS.qtys)))
    const remQty = collect(coerceNumber(at(row, COLUMNS.remQty), ctx(COLUMNS.remQty)))
    const price = collect(coerceCurrency(at(row, COLUMNS.price), ctx(COLUMNS.price)))
    const value = collect(coerceCurrency(at(row, COLUMNS.value), ctx(COLUMNS.value)))

    const valueComputed =
      remQty.value !== null && price.value !== null ? remQty.value * price.value : null

    // A value cell that was present but unreadable counts as a mismatch too:
    // the operator still needs to see that row in review.
    const sourcePresent = str(at(row, COLUMNS.value)) !== null
    const valueMismatch =
      sourcePresent &&
      (value.value === null ||
        valueComputed === null ||
        Math.abs(value.value - valueComputed) > VALUE_TOLERANCE)

    const workOrderNumber = str(at(row, COLUMNS.wo))
    const itemNumber = str(at(row, COLUMNS.item))

    const rawRow: Record<string, unknown> = {}
    for (const [label, i] of index) rawRow[label] = row[i] ?? null

    lines.push({
      customerPoNumber: poNumber || null,
      channelTag,
      salesOrderNumber: str(orderCell),
      itemNumber,
      custPartNumber: null,
      description: str(at(row, COLUMNS.description)),
      qtyOrdered: qtys.value,
      qtyOrderedRaw: qtys.raw ?? null,
      qtyRemaining: remQty.value,
      unitPrice: price.value,
      valueSource: value.value,
      valueComputed,
      valueMismatch,
      orderDate: collect(coerceDate(at(row, COLUMNS.ordDt), ctx(COLUMNS.ordDt))).value,
      shipDate: collect(coerceDate(at(row, COLUMNS.shipDt), ctx(COLUMNS.shipDt))).value,
      origRequiredDate: collect(coerceDate(at(row, COLUMNS.origDate), ctx(COLUMNS.origDate))).value,
      requiredDeliveryDate: collect(coerceDate(at(row, COLUMNS.reqDel), ctx(COLUMNS.reqDel))).value,
      workOrderNumber,
      jobNumber: null,
      fulfillmentType: classifyFulfillment(itemNumber, workOrderNumber),
      cmCode: null,
      jobStatus: null,
      comments: splitLegacyComments(str(at(row, COLUMNS.comments))),
      nodes: [],
      rawRow,
      externalIds: {},
    })
  }

  return {
    reportType: 'customer_open_order',
    reportLabel: filename.replace(/\.[^.]+$/, '').replace(/[_.]/g, ' ').trim(),
    asOfDate: null,
    lines,
    warnings,
  }
}
