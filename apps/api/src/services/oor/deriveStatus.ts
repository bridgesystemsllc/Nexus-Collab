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
  computeRiskScore,
  toOorRiskLevel,
  type RiskNodeInput,
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
 *
 * Delegates to the shared computeRiskScore for the actual logic, then maps
 * the result to the OorRiskLevel enum for persistence.
 */
export function deriveRiskLevel(input: DeriveInput, today: Date): OorRiskLevel {
  const riskNodes: RiskNodeInput[] = input.nodes.map((n) => ({
    level: n.level,
    materialClass: n.materialClass,
    componentType: n.componentType,
    qtyNeeded: n.qtyNeeded,
    qtyOnHand: n.qtyOnHand,
    customerProvided: n.customerProvided,
    nodeStatus: n.nodeStatus,
    etaDate: n.etaDate,
  }))

  const result = computeRiskScore({
    qtyRemaining: input.qtyRemaining,
    manualStatus: input.manualStatus,
    requiredDeliveryDate: input.requiredDeliveryDate,
    nodes: riskNodes,
    today,
  })

  return toOorRiskLevel(result.level)
}

/** A line stays in the open worklist while it has quantity left and no closing status. */
export function isLineOpen(qtyRemaining: number | null, status: OorLineStatus): boolean {
  if (OOR_CLOSED_STATUSES.includes(status)) return false
  return (qtyRemaining ?? 0) > 0
}
