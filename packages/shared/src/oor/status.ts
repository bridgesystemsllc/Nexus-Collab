// ─── Open Order Report vocabulary ───────────────────────────
// The statuses, shortage reasons and risk levels, as data, in the shared
// package for the same reason the RBAC catalogue lives here: the API derives
// them, the grid renders them, and a second copy is how the two end up
// disagreeing about what "short" means.

export const OOR_LINE_STATUSES = [
  'OPEN',
  'IN_PRODUCTION',
  'SHORT_MATERIAL',
  'AWAITING_COMPONENT',
  'AWAITING_ARTWORK',
  'AWAITING_CUSTOMER_APPROVAL',
  'ON_HOLD_QC',
  'FILLED_AWAITING_PICKUP',
  'PARTIAL_SHIP',
  'SHIPPED',
  'CLOSED',
  'CANCELLED',
] as const
export type OorLineStatus = (typeof OOR_LINE_STATUSES)[number]

/** Statuses that take a line out of the open worklist. */
export const OOR_CLOSED_STATUSES: OorLineStatus[] = ['SHIPPED', 'CLOSED', 'CANCELLED']

export const OOR_SHORTAGE_REASONS = [
  'RAW_MATERIAL_DELAY',
  'COMPONENT_DELAY',
  'BULK_NOT_MADE',
  'ARTWORK_PENDING',
  'MOQ_CONSTRAINT',
  'CAPACITY',
  'QC_HOLD',
  'COST_ROLL_PENDING',
  'CUSTOMER_PROVIDED_PENDING',
  'VENDOR_ETA_UNKNOWN',
  'NONE',
] as const
export type OorShortageReason = (typeof OOR_SHORTAGE_REASONS)[number]

export const OOR_RISK_LEVELS = ['on_track', 'at_risk', 'critical'] as const
export type OorRiskLevel = (typeof OOR_RISK_LEVELS)[number]

export const OOR_FULFILLMENT_TYPES = ['CONTRACT_MFG', 'INTERNAL', 'MISC', 'PASS_THROUGH'] as const
export type OorFulfillmentType = (typeof OOR_FULFILLMENT_TYPES)[number]

export const OOR_MATERIAL_CLASSES = ['BULK', 'COMPONENT', 'RAW_MATERIAL', 'OTHER'] as const
export type OorMaterialClass = (typeof OOR_MATERIAL_CLASSES)[number]

export type OorStatusTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

/** Labels and tones for the status pill, beside the vocabulary they describe. */
export const OOR_STATUS_META: Record<OorLineStatus, { label: string; tone: OorStatusTone }> = {
  OPEN: { label: 'Open', tone: 'neutral' },
  IN_PRODUCTION: { label: 'In Production', tone: 'accent' },
  SHORT_MATERIAL: { label: 'Short Material', tone: 'danger' },
  AWAITING_COMPONENT: { label: 'Awaiting Component', tone: 'danger' },
  AWAITING_ARTWORK: { label: 'Awaiting Artwork', tone: 'warning' },
  AWAITING_CUSTOMER_APPROVAL: { label: 'Awaiting Customer Approval', tone: 'warning' },
  ON_HOLD_QC: { label: 'On Hold — QC', tone: 'warning' },
  FILLED_AWAITING_PICKUP: { label: 'Filled — Awaiting Pickup', tone: 'success' },
  PARTIAL_SHIP: { label: 'Partial Ship', tone: 'accent' },
  SHIPPED: { label: 'Shipped', tone: 'success' },
  CLOSED: { label: 'Closed', tone: 'neutral' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
}

export const OOR_SHORTAGE_REASON_LABELS: Record<OorShortageReason, string> = {
  RAW_MATERIAL_DELAY: 'Raw material delay',
  COMPONENT_DELAY: 'Component delay',
  BULK_NOT_MADE: 'Bulk not made',
  ARTWORK_PENDING: 'Artwork pending',
  MOQ_CONSTRAINT: 'MOQ constraint',
  CAPACITY: 'Capacity',
  QC_HOLD: 'QC hold',
  COST_ROLL_PENDING: 'Cost roll pending',
  CUSTOMER_PROVIDED_PENDING: 'Customer-provided pending',
  VENDOR_ETA_UNKNOWN: 'Vendor ETA unknown',
  NONE: 'None',
}

export const OOR_RISK_META: Record<OorRiskLevel, { label: string; tone: OorStatusTone }> = {
  on_track: { label: 'On track', tone: 'success' },
  at_risk: { label: 'At risk', tone: 'warning' },
  critical: { label: 'Critical', tone: 'danger' },
}

/** Component types whose shortage is an artwork problem, not a supply problem. */
export const OOR_ARTWORK_COMPONENT_TYPES = [
  'FRONT LABEL',
  'BACK LABEL',
  'WRAP LABEL',
  'LABEL',
  'UNIT CARTON',
] as const
