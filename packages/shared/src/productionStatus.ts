// ─── ERP ↔ Nexus production status mapping ──────────────────
// Source of truth is the ERP `po_status` pgEnum
// (AmbiSyncOperations-V2/shared/schema.ts). Nexus stores the raw ERP value
// and derives display label + color token here.

export type ErpPoStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'SENT_TO_VENDOR'
  | 'ACKNOWLEDGED'
  | 'IN_PRODUCTION'
  | 'COMPLETE_PRODUCTION'
  | 'SHIPPED'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'CLOSED'
  | 'CANCELLED'

export interface StatusDisplay {
  label: string
  colorVar: string
}

const MAP: Record<ErpPoStatus, StatusDisplay> = {
  DRAFT: { label: 'Draft', colorVar: '--text-tertiary' },
  SUBMITTED: { label: 'Submitted', colorVar: '--info' },
  PENDING_APPROVAL: { label: 'Pending Approval', colorVar: '--warning' },
  APPROVED: { label: 'Approved', colorVar: '--info' },
  SENT_TO_VENDOR: { label: 'Sent to Vendor', colorVar: '--info' },
  ACKNOWLEDGED: { label: 'Acknowledged', colorVar: '--accent' },
  IN_PRODUCTION: { label: 'In Production', colorVar: '--accent' },
  COMPLETE_PRODUCTION: { label: 'Production Complete', colorVar: '--success' },
  SHIPPED: { label: 'Shipped', colorVar: '--success' },
  PARTIALLY_RECEIVED: { label: 'Partially Received', colorVar: '--warning' },
  RECEIVED: { label: 'Received', colorVar: '--success' },
  CLOSED: { label: 'Closed', colorVar: '--text-tertiary' },
  CANCELLED: { label: 'Cancelled', colorVar: '--danger' },
}

const UNKNOWN: StatusDisplay = { label: 'Unknown', colorVar: '--text-tertiary' }

export const ERP_PO_STATUSES = Object.keys(MAP) as readonly ErpPoStatus[]

export function erpStatusToDisplay(status: string): StatusDisplay {
  return MAP[status as ErpPoStatus] ?? UNKNOWN
}

export function displayLabelToErpStatus(label: string): ErpPoStatus | null {
  const target = label.trim().toLowerCase()
  for (const status of ERP_PO_STATUSES) {
    if (MAP[status].label.toLowerCase() === target) return status
  }
  return null
}
