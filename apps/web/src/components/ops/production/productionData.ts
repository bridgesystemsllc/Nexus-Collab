// ─── Production Tracking — Types, Constants, Seed Data & Helpers ────────────

// ─── Types ──────────────────────────────────────────────────────────────────

export type ProductionStatus =
  | 'Awaiting Materials'
  | 'Production Scheduled'
  | 'In Production'
  | 'QC Review'
  | 'Ready to Ship'
  | 'Shipped'
  | 'On Hold'

export type PoStatus =
  | 'Draft'
  | 'Sent to Vendor'
  | 'Acknowledged'
  | 'In Production'
  | 'Partially Received'
  | 'Received'
  | 'Closed'
  | 'Cancelled'

export type CoworkType =
  | 'PO Revision'
  | 'Artwork Update'
  | 'QC Hold'
  | 'Planning Review'
  | 'Other'

export interface ProductionOrder {
  id: string
  brand: string
  cm: string
  customerPo: string
  salesOrder: string
  workOrder: string
  bulkWo: string
  fillingWo: string
  itemNumber: string
  description: string
  qtyOrdered: number
  qtyRemaining: number
  qtyProduced: number
  qtySkids: number
  unitPrice: number
  orderValue: number
  orderDate: string
  shipDate: string
  originalDate: string
  requestedDel: string
  promisedDate: string
  leadTime: number
  productionLine: string
  bulkFormula: string
  batchSize: string
  kRequired: number
  rmStatus: string
  compStatus: string
  tentBatchWk: string
  fillWk: string
  shipWk: string
  status: ProductionStatus
  progressPct: number
  isCowork: boolean
  coworkType: string
  coworkNote: string
  coworkAssignedTo: string
  coworkPriority?: 'Normal' | 'Urgent'
  coworkResolved: boolean
  coworkResolutionNote?: string
  isEmergency: boolean
  // ─── ERP Open-Order (PO lifecycle) — synced with KareEve ERP ───
  poStatus: PoStatus
  urgency: 'Normal' | 'Urgent'
  qtyReceived: number
  deliveryDue: string
  eta: string
  lineCount: number
  erpPoId: string
  erpLastSyncAt: string
  notes: ProductionNote[]
  components: ProductionComponent[]
}

export interface ProductionNote {
  id: string
  noteDate: string
  noteText: string
  createdBy: string
  createdAt: string
  /** @deprecated Use noteDate instead */
  date?: string
  /** @deprecated Use noteText instead */
  text?: string
  /** @deprecated Use createdBy instead */
  author?: string
}

export interface ProductionComponent {
  id: string
  componentNumber: string
  componentDesc: string
  supplier: string
  eta: string
  status: string
  notes: string
}

// ─── Constants ──────────────────────────────────────────────────────────────

export const STATUS_COLORS: Record<string, string> = {
  'Awaiting Materials': '#FF9F0A',
  'Production Scheduled': '#0A84FF',
  'In Production': '#7C3AED',
  'QC Review': '#64D2FF',
  'Ready to Ship': '#32D74B',
  'Shipped': '#6E6E73',
  'On Hold': '#FF453A',
}

export const ALL_STATUSES: ProductionStatus[] = [
  'Awaiting Materials',
  'Production Scheduled',
  'In Production',
  'QC Review',
  'Ready to Ship',
  'Shipped',
  'On Hold',
]

export const ALL_PO_STATUSES: PoStatus[] = [
  'Draft',
  'Sent to Vendor',
  'Acknowledged',
  'In Production',
  'Partially Received',
  'Received',
  'Closed',
  'Cancelled',
]

export const PO_STATUS_COLORS: Record<string, string> = {
  Draft: '#8E8E93',
  'Sent to Vendor': '#0A84FF',
  Acknowledged: '#5E5CE6',
  'In Production': '#7C3AED',
  'Partially Received': '#FF9F0A',
  Received: '#32D74B',
  Closed: '#6E6E73',
  Cancelled: '#FF453A',
}

export const BRANDS = ['AcneFree', 'Ambi', 'Baxter', "Carol's Daughter", 'Dermablend']

export const COWORK_TYPES: CoworkType[] = [
  'PO Revision',
  'Artwork Update',
  'QC Hold',
  'Planning Review',
  'Other',
]

// ─── Empty Form ─────────────────────────────────────────────────────────────

export const EMPTY_PRODUCTION_ORDER = {
  brand: '',
  cm: '',
  customerPo: '',
  salesOrder: '',
  workOrder: '',
  bulkWo: '',
  fillingWo: '',
  itemNumber: '',
  description: '',
  qtyOrdered: 0,
  qtyRemaining: 0,
  qtyProduced: 0,
  qtySkids: 0,
  unitPrice: 0,
  orderValue: 0,
  orderDate: '',
  shipDate: '',
  originalDate: '',
  requestedDel: '',
  promisedDate: '',
  leadTime: 0,
  productionLine: '',
  bulkFormula: '',
  batchSize: '',
  kRequired: 0,
  rmStatus: '',
  compStatus: '',
  tentBatchWk: '',
  fillWk: '',
  shipWk: '',
  status: 'Awaiting Materials' as ProductionStatus,
  progressPct: 0,
  isCowork: false,
  coworkType: '',
  coworkNote: '',
  coworkAssignedTo: '',
  coworkResolved: false,
  isEmergency: false,
  poStatus: 'Draft' as PoStatus,
  urgency: 'Normal' as 'Normal' | 'Urgent',
  qtyReceived: 0,
  deliveryDue: '',
  eta: '',
  lineCount: 0,
  erpPoId: '',
  erpLastSyncAt: '',
  notes: [] as ProductionNote[],
  components: [] as ProductionComponent[],
}

/** @deprecated Use EMPTY_PRODUCTION_ORDER instead */
export const EMPTY_ORDER = EMPTY_PRODUCTION_ORDER

// ─── Seed Data ──────────────────────────────────────────────────────────────

export const SEED_ORDERS: ProductionOrder[] = [
  {
    id: 'prod-seed-1',
    brand: 'AcneFree',
    cm: 'KIK Custom Products',
    customerPo: 'PO-2026-4401',
    salesOrder: 'SO-88120',
    workOrder: 'WO-55001',
    bulkWo: 'BWO-55001',
    fillingWo: 'FWO-55001',
    itemNumber: 'AF-CLN-8OZ',
    description: 'AcneFree Oil-Free Acne Cleanser 8oz',
    qtyOrdered: 24000,
    qtyRemaining: 24000,
    qtyProduced: 0,
    qtySkids: 0,
    unitPrice: 3.42,
    orderValue: 82080,
    orderDate: '2026-03-10',
    shipDate: '2026-04-25',
    originalDate: '2026-04-25',
    requestedDel: '2026-04-28',
    promisedDate: '2026-04-25',
    leadTime: 46,
    productionLine: 'Line 3',
    bulkFormula: 'BF-1022',
    batchSize: '6000 units',
    kRequired: 82,
    rmStatus: 'Pending — Salicylic Acid ETA 4/2',
    compStatus: 'On Hand',
    tentBatchWk: 'Wk 15',
    fillWk: 'Wk 16',
    shipWk: 'Wk 17',
    status: 'Awaiting Materials',
    progressPct: 10,
    isCowork: false,
    coworkType: '',
    coworkNote: '',
    coworkAssignedTo: '',
    coworkResolved: false,
    isEmergency: false,
    poStatus: 'Sent to Vendor',
    urgency: 'Normal',
    qtyReceived: 0,
    deliveryDue: '2026-04-28',
    eta: '2026-04-25',
    lineCount: 2,
    erpPoId: 'ERP-PO-4401',
    erpLastSyncAt: '',
    notes: [],
    components: [],
  },
  {
    id: 'prod-seed-2',
    brand: 'Ambi',
    cm: 'Voyant Beauty',
    customerPo: 'PO-2026-4388',
    salesOrder: 'SO-88095',
    workOrder: 'WO-54987',
    bulkWo: 'BWO-54987',
    fillingWo: 'FWO-54987',
    itemNumber: 'AMB-FDE-2OZ',
    description: 'Ambi Fade Cream Normal Skin 2oz',
    qtyOrdered: 36000,
    qtyRemaining: 12000,
    qtyProduced: 24000,
    qtySkids: 16,
    unitPrice: 2.18,
    orderValue: 78480,
    orderDate: '2026-02-18',
    shipDate: '2026-04-04',
    originalDate: '2026-03-28',
    requestedDel: '2026-04-01',
    promisedDate: '2026-04-04',
    leadTime: 45,
    productionLine: 'Line 1',
    bulkFormula: 'BF-0744',
    batchSize: '12000 units',
    kRequired: 78,
    rmStatus: 'On Hand',
    compStatus: 'On Hand',
    tentBatchWk: 'Wk 12',
    fillWk: 'Wk 13',
    shipWk: 'Wk 14',
    status: 'In Production',
    progressPct: 67,
    isCowork: true,
    coworkType: 'PO Revision',
    coworkNote: 'Customer increased qty from 30K to 36K — need updated PO and label recount',
    coworkAssignedTo: 'Ops Team',
    coworkResolved: false,
    isEmergency: false,
    poStatus: 'In Production',
    urgency: 'Normal',
    qtyReceived: 24000,
    deliveryDue: '2026-04-01',
    eta: '2026-04-04',
    lineCount: 3,
    erpPoId: 'ERP-PO-4388',
    erpLastSyncAt: '',
    notes: [],
    components: [],
  },
  {
    id: 'prod-seed-3',
    brand: "Carol's Daughter",
    cm: 'Cosmetic Group USA',
    customerPo: 'PO-2026-4350',
    salesOrder: 'SO-88042',
    workOrder: 'WO-54920',
    bulkWo: 'BWO-54920',
    fillingWo: 'FWO-54920',
    itemNumber: 'CD-MHM-12OZ',
    description: "Carol's Daughter Monoi Hair Mask 12oz",
    qtyOrdered: 18000,
    qtyRemaining: 0,
    qtyProduced: 18000,
    qtySkids: 24,
    unitPrice: 4.85,
    orderValue: 87300,
    orderDate: '2026-01-22',
    shipDate: '2026-03-31',
    originalDate: '2026-03-21',
    requestedDel: '2026-03-25',
    promisedDate: '2026-03-31',
    leadTime: 68,
    productionLine: 'Line 5',
    bulkFormula: 'BF-0891',
    batchSize: '9000 units',
    kRequired: 87,
    rmStatus: 'On Hand',
    compStatus: 'On Hand',
    tentBatchWk: 'Wk 9',
    fillWk: 'Wk 11',
    shipWk: 'Wk 13',
    status: 'Ready to Ship',
    progressPct: 95,
    isCowork: false,
    coworkType: '',
    coworkNote: '',
    coworkAssignedTo: '',
    coworkResolved: false,
    isEmergency: false,
    poStatus: 'Partially Received',
    urgency: 'Normal',
    qtyReceived: 18000,
    deliveryDue: '2026-03-25',
    eta: '2026-03-31',
    lineCount: 4,
    erpPoId: 'ERP-PO-4350',
    erpLastSyncAt: '',
    notes: [],
    components: [],
  },
  {
    id: 'prod-seed-4',
    brand: 'Dermablend',
    cm: 'Kolmar Americas',
    customerPo: 'PO-2026-4412',
    salesOrder: 'SO-88155',
    workOrder: 'WO-55030',
    bulkWo: 'BWO-55030',
    fillingWo: 'FWO-55030',
    itemNumber: 'DB-FND-1OZ',
    description: 'Dermablend Flawless Creator Foundation 1oz',
    qtyOrdered: 15000,
    qtyRemaining: 15000,
    qtyProduced: 0,
    qtySkids: 0,
    unitPrice: 6.75,
    orderValue: 101250,
    orderDate: '2026-03-20',
    shipDate: '2026-05-15',
    originalDate: '2026-05-15',
    requestedDel: '2026-05-12',
    promisedDate: '2026-05-15',
    leadTime: 56,
    productionLine: 'Line 2',
    bulkFormula: 'BF-1105',
    batchSize: '5000 units',
    kRequired: 101,
    rmStatus: 'Pending — Pigment blend ETA 4/10',
    compStatus: 'Pending — Glass bottles ETA 4/8',
    tentBatchWk: 'Wk 17',
    fillWk: 'Wk 18',
    shipWk: 'Wk 20',
    status: 'Production Scheduled',
    progressPct: 5,
    isCowork: false,
    coworkType: '',
    coworkNote: '',
    coworkAssignedTo: '',
    coworkResolved: false,
    isEmergency: true,
    poStatus: 'Acknowledged',
    urgency: 'Urgent',
    qtyReceived: 0,
    deliveryDue: '2026-05-12',
    eta: '2026-05-15',
    lineCount: 2,
    erpPoId: 'ERP-PO-4412',
    erpLastSyncAt: '',
    notes: [],
    components: [],
  },
]

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Compute top-line KPIs from a list of production orders.
 */
export function getKPIs(orders: ProductionOrder[]) {
  const active = orders.filter((o) => o.status !== 'Shipped')
  return {
    totalActive: active.length,
    totalValue: active.reduce((sum, o) => sum + o.orderValue, 0),
    emergencyCount: active.filter((o) => o.isEmergency).length,
    coworkPending: orders.filter((o) => o.isCowork && !o.coworkResolved).length,
  }
}

/**
 * A PO is overdue when its ETA (or delivery-due date) is in the past AND it
 * has not reached a terminal received/closed/cancelled state. Overdue is
 * DERIVED, never stored.
 */
export function isOverdue(o: Pick<ProductionOrder, 'eta' | 'deliveryDue' | 'poStatus'>): boolean {
  const terminal: PoStatus[] = ['Received', 'Closed', 'Cancelled']
  if (terminal.includes(o.poStatus)) return false
  const raw = o.eta || o.deliveryDue
  if (!raw) return false
  const due = new Date(raw)
  if (isNaN(due.getTime())) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return due.getTime() < today.getTime()
}

/**
 * ERP-parity KPI cards: Open Orders, Total Lines, Units Remaining,
 * Units Received, Overdue. "Open" excludes terminal PO statuses.
 */
export function getOpenOrderKPIs(orders: ProductionOrder[]) {
  const open = orders.filter(
    (o) => !['Received', 'Closed', 'Cancelled'].includes(o.poStatus),
  )
  return {
    openOrders: open.length,
    totalLines: open.reduce((s, o) => s + (o.lineCount || 0), 0),
    unitsRemaining: open.reduce((s, o) => s + (o.qtyRemaining || 0), 0),
    unitsReceived: orders.reduce((s, o) => s + (o.qtyReceived || 0), 0),
    overdue: open.filter((o) => isOverdue(o)).length,
  }
}

/**
 * Group orders by Contract Manufacturer (cm).
 */
export function groupByCM(orders: ProductionOrder[]): Record<string, ProductionOrder[]> {
  return orders.reduce<Record<string, ProductionOrder[]>>((acc, order) => {
    // Support both direct ProductionOrder objects and wrapped items (item.data?.cm)
    const cm = (order as any).data?.cm || order.cm || 'Unassigned'
    if (!acc[cm]) acc[cm] = []
    acc[cm].push(order)
    return acc
  }, {})
}

/**
 * Parse OOR-style comments where each entry starts with a date prefix like "3.10"
 * into an array of ProductionNote objects.
 *
 * Example input: "3.10 RM delayed to next week 3.12 Rescheduled fill to Wk 14"
 */
export function parseOORComments(commentsText: string): ProductionNote[] {
  if (!commentsText || !commentsText.trim()) return []

  // Match date prefixes like "3.10", "12.05", etc.
  const parts = commentsText.split(/(?=\d{1,2}\.\d{1,2}\s)/).filter((s) => s.trim())

  return parts.map((part, idx) => {
    const match = part.match(/^(\d{1,2}\.\d{1,2})\s+(.*)$/)
    const noteDate = match ? match[1] : ''
    const noteText = match ? match[2].trim() : part.trim()
    const now = new Date().toISOString()

    return {
      id: `oor-note-${idx + 1}`,
      noteDate,
      noteText,
      createdBy: 'OOR Import',
      createdAt: now,
      // Backward-compat aliases
      date: noteDate,
      text: noteText,
      author: 'OOR Import',
    }
  })
}

/**
 * Format a number as USD currency string: "$X,XXX.XX"
 */
export function formatCurrency(n: number): string {
  return (
    '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  )
}

/**
 * Return today's date in "M.DD" format, used as the prefix for new production notes.
 */
export function formatDatePrefix(): string {
  const now = new Date()
  const month = now.getMonth() + 1
  const day = String(now.getDate()).padStart(2, '0')
  return `${month}.${day}`
}

// ─── Backward-Compatible Aliases ────────────────────────────────────────────
// These preserve the API used by ProductionModule.tsx

/**
 * Format a date string for display.
 * @deprecated Kept for backward compat with ProductionModule
 */
export function formatDate(dateStr: string): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * @deprecated Use formatDatePrefix instead
 */
export const notePrefix = formatDatePrefix
