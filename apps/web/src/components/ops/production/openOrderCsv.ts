// CSV export for the Open-Order view. Reads the LIVE production item.data
// shape (poNumber/qty/cm/status/eta...) with fallbacks to the ERP-synced
// fields (customerPo/qtyOrdered/poStatus/qtyReceived/qtyRemaining), so it works
// both before and after an ERP open-order sync.

export interface OpenOrderRow {
  poNumber: string
  manufacturer: string
  poStatus: string
  urgency: string
  orderDate: string
  deliveryDue: string
  lineCount: number
  qtyOrdered: number
  qtyReceived: number
  qtyRemaining: number
  eta: string
}

/** Normalize a raw item.data blob into the columns the Open-Order view shows. */
export function readOpenOrder(d: Record<string, any> | null | undefined): OpenOrderRow {
  const data = d ?? {}
  const qtyOrdered = Number(data.qty ?? data.qtyOrdered ?? 0) || 0
  const qtyReceived = Number(data.qtyReceived ?? 0) || 0
  const qtyRemaining =
    data.qtyRemaining != null ? Number(data.qtyRemaining) || 0 : Math.max(qtyOrdered - qtyReceived, 0)
  return {
    poNumber: String(data.poNumber ?? data.customerPo ?? ''),
    manufacturer: String(data.cm ?? 'Unassigned'),
    poStatus: String(data.poStatus ?? data.status ?? '—'),
    urgency: String(data.urgency ?? (data.priority === 'emergency' ? 'Urgent' : 'Normal')),
    orderDate: String(data.orderDate ?? ''),
    deliveryDue: String(data.deliveryDue ?? ''),
    lineCount: Number(data.lineCount ?? 0) || 0,
    qtyOrdered,
    qtyReceived,
    qtyRemaining,
    eta: String(data.eta ?? data.deliveryDue ?? ''),
  }
}

const TERMINAL = new Set(['Received', 'Closed', 'Cancelled'])

/** A PO is overdue when ETA/deliveryDue is past AND it is not terminal. */
export function isOpenOrderOverdue(row: OpenOrderRow): boolean {
  if (TERMINAL.has(row.poStatus)) return false
  const raw = row.eta || row.deliveryDue
  if (!raw) return false
  const due = new Date(raw)
  if (isNaN(due.getTime())) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return due.getTime() < today.getTime()
}

const COLUMNS: Array<[string, (r: OpenOrderRow) => string | number]> = [
  ['PO Number', (r) => r.poNumber],
  ['Manufacturer', (r) => r.manufacturer],
  ['PO Status', (r) => r.poStatus],
  ['Urgency', (r) => r.urgency],
  ['Order Date', (r) => r.orderDate],
  ['Delivery Due', (r) => r.deliveryDue],
  ['Lines', (r) => r.lineCount],
  ['Qty Ordered', (r) => r.qtyOrdered],
  ['Qty Received', (r) => r.qtyReceived],
  ['Qty Remaining', (r) => r.qtyRemaining],
  ['ETA', (r) => r.eta],
  ['Overdue', (r) => (isOpenOrderOverdue(r) ? 'YES' : '')],
]

function escapeCsv(v: string | number): string {
  const str = String(v ?? '')
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

export function openOrdersToCsv(items: Array<{ data?: any }>): string {
  const header = COLUMNS.map(([h]) => h).join(',')
  const rows = items.map((it) => {
    const row = readOpenOrder(it.data)
    return COLUMNS.map(([, get]) => escapeCsv(get(row))).join(',')
  })
  return [header, ...rows].join('\n')
}

export function downloadOpenOrdersCsv(items: Array<{ data?: any }>): void {
  const blob = new Blob([openOrdersToCsv(items)], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'open-orders.csv'
  a.click()
  URL.revokeObjectURL(url)
}
