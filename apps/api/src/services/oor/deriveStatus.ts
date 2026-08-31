// ─── Status and risk derivation ─────────────────────────────
// One pure function per question, no clock and no database, so the rules can be
// argued about in tests rather than discovered in production.
//
// Precedence is the whole design here. A line short on a raw material, short on
// a component AND blocked on customer approval is not three problems the
// operator can work in parallel — it is one problem, and the one worth showing
// is the one nobody at KarEve can unblock alone. So a customer-provided blocker
// outranks every internal shortage, and a component outranks a raw material
// because a missing component stops the fill line while a missing raw material
// stops the batch behind it.

import {
  OOR_ARTWORK_COMPONENT_TYPES,
  OOR_CLOSED_STATUSES,
  type OorLineStatus,
  type OorMaterialClass,
  type OorRiskLevel,
} from '@nexus/shared'

export interface DeriveNode {
  level: number
  materialClass: OorMaterialClass | string
  componentType: string | null
  qtyNeeded: number | null
  qtyOnHand: number | null
  customerProvided: boolean
  nodeStatus: string
  etaDate: Date | null
}

export interface DeriveInput {
  qtyRemaining: number | null
  manualStatus: OorLineStatus | null
  nodes: DeriveNode[]
  requiredDeliveryDate: Date | null
}

/** Days inside which a required date counts as at risk. */
const AT_RISK_WINDOW_DAYS = 14
const MS_PER_DAY = 24 * 60 * 60 * 1000

const RESOLVED_NODE_STATUSES = new Set(['RESOLVED', 'CLOSED', 'RECEIVED'])

const isResolved = (n: DeriveNode) => RESOLVED_NODE_STATUSES.has(String(n.nodeStatus).toUpperCase())

/**
 * Short means the quantity on hand does not cover what the job needs.
 *
 * A null on-hand reads as zero, not as unknown: these reports omit the figure
 * precisely when nothing has been received, and treating that as "can't say"
 * would quietly clear the shortage that made someone run the report.
 */
function isShort(n: DeriveNode): boolean {
  if (isResolved(n)) return false
  const needed = n.qtyNeeded ?? 0
  if (needed <= 0) return false
  return (n.qtyOnHand ?? 0) < needed
}

const isArtwork = (n: DeriveNode): boolean =>
  n.componentType !== null &&
  (OOR_ARTWORK_COMPONENT_TYPES as readonly string[]).includes(n.componentType.toUpperCase())

export function deriveLineStatus(input: DeriveInput): OorLineStatus {
  // A manual status is a person overriding the machine on purpose. It wins
  // even against a hard external blocker, and the reason is recorded elsewhere.
  if (input.manualStatus) return input.manualStatus

  if (input.qtyRemaining !== null && input.qtyRemaining <= 0) return 'CLOSED'

  const nodes = input.nodes
  if (nodes.length === 0) return 'OPEN'

  // Nobody inside the building can clear a customer-provided blocker, so it is
  // the status worth surfacing even when other things are also short.
  if (nodes.some((n) => n.customerProvided && !isResolved(n))) return 'AWAITING_CUSTOMER_APPROVAL'

  const shortComponents = nodes.filter((n) => n.materialClass === 'COMPONENT' && isShort(n))
  if (shortComponents.length > 0) {
    return shortComponents.some(isArtwork) ? 'AWAITING_ARTWORK' : 'AWAITING_COMPONENT'
  }

  if (nodes.some((n) => n.materialClass === 'RAW_MATERIAL' && isShort(n))) return 'SHORT_MATERIAL'
  if (nodes.some((n) => n.materialClass === 'BULK' && isShort(n))) return 'SHORT_MATERIAL'

  return 'IN_PRODUCTION'
}

/**
 * Risk answers "will this land on time", which is a different question from
 * "what is blocking it". It drives the row accent only — it never filters
 * anything out of view.
 */
export function deriveRiskLevel(input: DeriveInput, today: Date): OorRiskLevel {
  if (input.manualStatus && OOR_CLOSED_STATUSES.includes(input.manualStatus)) return 'on_track'

  const blockers = input.nodes.filter(isShort)

  // An unknown ETA is worse than a late one: a late date can be planned around,
  // an absent one cannot.
  if (blockers.some((b) => b.etaDate === null)) return 'critical'

  const required = input.requiredDeliveryDate
  if (!required) return blockers.length > 0 ? 'at_risk' : 'on_track'

  if (blockers.some((b) => b.etaDate !== null && b.etaDate.getTime() > required.getTime())) {
    return 'critical'
  }

  const daysRemaining = Math.floor((required.getTime() - today.getTime()) / MS_PER_DAY)
  if (daysRemaining < 0) return 'critical'
  if (daysRemaining <= AT_RISK_WINDOW_DAYS) return 'at_risk'
  return 'on_track'
}

/** A line stays in the open worklist while it has quantity left and no closing status. */
export function isLineOpen(qtyRemaining: number | null, status: OorLineStatus): boolean {
  if (OOR_CLOSED_STATUSES.includes(status)) return false
  return (qtyRemaining ?? 0) > 0
}
