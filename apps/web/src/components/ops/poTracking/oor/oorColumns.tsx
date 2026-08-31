// ─── Column sets ────────────────────────────────────────────
// The labels are the source workbooks' labels, verbatim — "Item#", "Req.Del",
// "Lvl1 Part", "CP?". They look like abbreviations because they are, and the
// people reading this grid have been reading those exact headers weekly for
// years. Renaming them to something tidier would make the screen harder to use,
// not easier.

import type { OorLineRow } from './useOorQueries'
import { formatCurrency, formatQty, formatShortDate } from './oorFormat'

export type Align = 'left' | 'right'

export interface OorColumn {
  key: string
  header: string
  width: number
  align?: Align
  mono?: boolean
  /** Sort key understood by the API; absent means the column is not sortable. */
  sortKey?: string
  value: (row: OorLineRow) => string
  title?: (row: OorLineRow) => string | undefined
}

const raw = (row: OorLineRow, label: string): string => {
  const v = row.rawRow?.[label]
  return v === null || v === undefined ? '' : String(v)
}

/** Format A — the customer open order report. */
export const CUSTOMER_OPEN_ORDER_COLUMNS: OorColumn[] = [
  { key: 'customerPoNumber', header: 'Customer PO Number', width: 170, mono: true, sortKey: 'customerPoNumber',
    value: (r) => (r.channelTag ? `${r.customerPoNumber ?? ''}>${r.channelTag}` : (r.customerPoNumber ?? '')) },
  { key: 'salesOrderNumber', header: 'Order', width: 120, mono: true, sortKey: 'salesOrderNumber', value: (r) => r.salesOrderNumber ?? '' },
  { key: 'itemNumber', header: 'Item#', width: 110, mono: true, sortKey: 'itemNumber', value: (r) => r.itemNumber ?? '' },
  { key: 'description', header: 'Description', width: 240, value: (r) => r.description ?? '' },
  { key: 'qtyOrdered', header: 'Qtys', width: 90, align: 'right', mono: true,
    // The one cell in the fixture holding two stacked numbers keeps its text.
    value: (r) => (r.qtyOrdered === null ? (r.qtyOrderedRaw ?? '') : formatQty(r.qtyOrdered)),
    title: (r) => (r.qtyOrdered === null && r.qtyOrderedRaw ? 'The source cell held more than one number' : undefined) },
  { key: 'qtyRemaining', header: 'RemQty', width: 90, align: 'right', mono: true, sortKey: 'qtyRemaining', value: (r) => formatQty(r.qtyRemaining) },
  { key: 'unitPrice', header: 'Price', width: 90, align: 'right', mono: true, sortKey: 'unitPrice', value: (r) => formatCurrency(r.unitPrice) },
  { key: 'valueComputed', header: 'Value', width: 120, align: 'right', mono: true, sortKey: 'valueComputed',
    value: (r) => formatCurrency(r.valueComputed),
    title: (r) => (r.valueMismatch
      ? `The report says ${formatCurrency(r.valueSource) || 'an unreadable figure'}. This is RemQty x Price, recomputed.`
      : undefined) },
  { key: 'orderDate', header: 'OrdDt', width: 88, mono: true, sortKey: 'orderDate', value: (r) => formatShortDate(r.orderDate) },
  { key: 'shipDate', header: 'ShipDt', width: 88, mono: true, value: (r) => formatShortDate(r.shipDate) },
  { key: 'origRequiredDate', header: 'Orig Date', width: 88, mono: true, sortKey: 'origRequiredDate', value: (r) => formatShortDate(r.origRequiredDate) },
  { key: 'requiredDeliveryDate', header: 'Req.Del', width: 88, mono: true, sortKey: 'requiredDeliveryDate', value: (r) => formatShortDate(r.requiredDeliveryDate) },
  { key: 'workOrderNumber', header: 'WO', width: 120, mono: true, value: (r) => r.workOrderNumber ?? '' },
]

/** Format B — the open order shortage report, at the PO-line level. */
export const SHORTAGE_COLUMNS: OorColumn[] = [
  { key: 'customerPoNumber', header: 'PO', width: 120, mono: true, sortKey: 'customerPoNumber', value: (r) => r.customerPoNumber ?? '' },
  { key: 'orderDate', header: 'Order Date', width: 100, mono: true, sortKey: 'orderDate', value: (r) => formatShortDate(r.orderDate) },
  { key: 'origRequiredDate', header: "Orig Req'd Date", width: 120, mono: true, sortKey: 'origRequiredDate', value: (r) => formatShortDate(r.origRequiredDate) },
  { key: 'itemNumber', header: 'PartNum', width: 110, mono: true, sortKey: 'itemNumber', value: (r) => r.itemNumber ?? '' },
  { key: 'custPartNumber', header: 'Cust Part', width: 110, mono: true, value: (r) => r.custPartNumber ?? '' },
  { key: 'description', header: 'Description', width: 260, value: (r) => r.description ?? '' },
  { key: 'requiredDeliveryDate', header: "Req'd Date", width: 100, mono: true, sortKey: 'requiredDeliveryDate', value: (r) => formatShortDate(r.requiredDeliveryDate) },
  { key: 'qtyRemaining', header: 'Qty Due', width: 90, align: 'right', mono: true, sortKey: 'qtyRemaining', value: (r) => formatQty(r.qtyRemaining) },
  { key: 'unitPrice', header: 'Unit Price', width: 100, align: 'right', mono: true, sortKey: 'unitPrice', value: (r) => formatCurrency(r.unitPrice) },
  { key: 'jobNumber', header: 'Job Num', width: 120, mono: true, value: (r) => r.jobNumber ?? raw(r, 'Job Num') },
]

export const COLUMN_SETS = {
  customer_open_order: CUSTOMER_OPEN_ORDER_COLUMNS,
  open_order_shortage: SHORTAGE_COLUMNS,
} as const

export type ReportView = keyof typeof COLUMN_SETS
