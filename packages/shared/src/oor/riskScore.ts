// ─── Risk Score ─────────────────────────────────────────────
// A shared, pure risk-scoring function that computes both a numeric score
// (0–100) and a categorical level (Low/Med/High) with explanatory drivers.
// This centralizes risk logic for the Open Order Report, making it testable
// and consistent between import-time derivation and runtime queries.
//
// The OorRiskLevel enum (on_track/at_risk/critical) is the persistence layer's
// vocabulary. This module bridges it with a human-readable Low/Med/High scale.

import { OOR_CLOSED_STATUSES, type OorLineStatus, type OorRiskLevel } from './status'

/** Detects delay-related keywords in notes or comments. */
export const NOTES_DELAY_RE = /delay|late|slip|push|behind/i

/** Human-readable risk levels. */
export type RiskScoreLevel = 'Low' | 'Med' | 'High'

export interface RiskScoreInput {
  /** Quantity still to be fulfilled. */
  qtyRemaining: number | null
  /** Whether the status was pinned by a person. */
  manualStatus: string | null
  /** Required delivery date for the line. */
  requiredDeliveryDate: Date | null
  /** Nodes representing materials/components with their shortage state. */
  nodes: RiskNodeInput[]
  /** Concatenated notes/comments for keyword detection. */
  notesText?: string
  /** Reference date for "days remaining" calculations. */
  today?: Date
}

export interface RiskNodeInput {
  level: number
  materialClass: string
  componentType: string | null
  qtyNeeded: number | null
  qtyOnHand: number | null
  customerProvided: boolean
  nodeStatus: string
  etaDate: Date | null
}

export interface RiskScoreResult {
  level: RiskScoreLevel
  score: number
  drivers: string[]
}

const MS_PER_DAY = 24 * 60 * 60 * 1000
const RESOLVED_NODE_STATUSES = new Set(['RESOLVED', 'CLOSED', 'RECEIVED'])

const isResolved = (n: RiskNodeInput) =>
  RESOLVED_NODE_STATUSES.has(String(n.nodeStatus).toUpperCase())

function isShort(n: RiskNodeInput): boolean {
  if (isResolved(n)) return false
  const needed = n.qtyNeeded ?? 0
  if (needed <= 0) return false
  return (n.qtyOnHand ?? 0) < needed
}

/**
 * Map the OorRiskLevel persistence enum to the human-readable level.
 * High ↔ critical, Med ↔ at_risk, Low ↔ on_track
 */
export function fromOorRiskLevel(risk: OorRiskLevel): RiskScoreLevel {
  switch (risk) {
    case 'critical':
      return 'High'
    case 'at_risk':
      return 'Med'
    case 'on_track':
    default:
      return 'Low'
  }
}

/**
 * Map the human-readable level back to OorRiskLevel for persistence.
 * High → critical, Med → at_risk, Low → on_track
 */
export function toOorRiskLevel(level: RiskScoreLevel): OorRiskLevel {
  switch (level) {
    case 'High':
      return 'critical'
    case 'Med':
      return 'at_risk'
    case 'Low':
    default:
      return 'on_track'
  }
}

/**
 * Compute a risk score (0–100), a categorical level (Low/Med/High), and
 * human-readable drivers explaining why the risk is elevated.
 *
 * Scoring breakdown:
 * - Base: 0 (on track)
 * - Short materials: +20 per type (raw, component, customer-provided)
 * - Missing ETA on blockers: +25
 * - ETA past required date: +25
 * - Required date < 14 days away: +15
 * - Required date past: +30
 * - Delay keywords in notes: +10
 * - Customer-provided blocker: +10
 *
 * Thresholds: 0–29 = Low, 30–59 = Med, 60+ = High
 */
export function computeRiskScore(input: RiskScoreInput): RiskScoreResult {
  const today = input.today ?? new Date()
  const drivers: string[] = []
  let score = 0

  // Closed statuses are low risk
  const closedStatuses = ['SHIPPED', 'CLOSED', 'CANCELLED']
  if (input.manualStatus && closedStatuses.includes(input.manualStatus)) {
    return { level: 'Low', score: 0, drivers: [] }
  }

  // Fulfilled lines are low risk
  if (input.qtyRemaining !== null && input.qtyRemaining <= 0) {
    return { level: 'Low', score: 0, drivers: [] }
  }

  const blockers = input.nodes.filter(isShort)

  // Material shortages
  const hasRawMaterialShortage = blockers.some(
    (n) => n.materialClass === 'RAW_MATERIAL' || n.materialClass === 'BULK',
  )
  const hasComponentShortage = blockers.some((n) => n.materialClass === 'COMPONENT')
  const hasCustomerProvidedBlocker = blockers.some((n) => n.customerProvided)

  if (hasRawMaterialShortage) {
    score += 20
    drivers.push('Raw material shortage')
  }
  if (hasComponentShortage) {
    score += 20
    drivers.push('Component shortage')
  }
  if (hasCustomerProvidedBlocker) {
    score += 10
    drivers.push('Customer-provided material pending')
  }

  // Missing ETA on blockers
  const missingEta = blockers.some((b) => b.etaDate === null)
  if (missingEta) {
    score += 25
    drivers.push('Missing ETA on blocked material')
  }

  // ETA past required date
  const required = input.requiredDeliveryDate
  if (required) {
    const lateMaterial = blockers.some(
      (b) => b.etaDate !== null && b.etaDate.getTime() > required.getTime(),
    )
    if (lateMaterial) {
      score += 25
      drivers.push('Material ETA past required date')
    }

    const daysRemaining = Math.floor((required.getTime() - today.getTime()) / MS_PER_DAY)
    if (daysRemaining < 0) {
      score += 30
      drivers.push('Required date has passed')
    } else if (daysRemaining <= 14) {
      score += 15
      drivers.push('Required date within 14 days')
    }
  } else if (blockers.length > 0) {
    // No required date but has blockers — moderate risk
    score += 10
    drivers.push('No required date set')
  }

  // Delay keywords in notes
  if (input.notesText && NOTES_DELAY_RE.test(input.notesText)) {
    score += 10
    drivers.push('Delay mentioned in notes')
  }

  // Clamp score to 0–100
  score = Math.min(100, Math.max(0, score))

  // Determine level
  let level: RiskScoreLevel
  if (score >= 60) {
    level = 'High'
  } else if (score >= 30) {
    level = 'Med'
  } else {
    level = 'Low'
  }

  return { level, score, drivers }
}

/**
 * Infer basic risk drivers from line-level data without loading nodes.
 * Used for tooltips when full node data isn't available.
 */
export interface LineRiskInput {
  lineStatus: OorLineStatus | string
  riskLevel: OorRiskLevel | string
  requiredDeliveryDate: Date | string | null
  today?: Date
}

export function inferRiskDriversFromLine(input: LineRiskInput): string[] {
  const drivers: string[] = []
  const today = input.today ?? new Date()

  // Closed statuses have no drivers
  if (OOR_CLOSED_STATUSES.includes(input.lineStatus as OorLineStatus)) {
    return []
  }

  // Low risk has no drivers
  if (input.riskLevel === 'on_track') {
    return []
  }

  // Infer shortage-related drivers from line status
  const status = input.lineStatus
  if (status === 'SHORT_MATERIAL') {
    drivers.push('Material shortage')
  }
  if (status === 'AWAITING_COMPONENT') {
    drivers.push('Component shortage')
  }
  if (status === 'AWAITING_ARTWORK') {
    drivers.push('Artwork pending')
  }
  if (status === 'AWAITING_CUSTOMER_APPROVAL') {
    drivers.push('Customer-provided material pending')
  }
  if (status === 'ON_HOLD_QC') {
    drivers.push('QC hold')
  }

  // Date-related drivers
  const required = input.requiredDeliveryDate
    ? typeof input.requiredDeliveryDate === 'string'
      ? new Date(input.requiredDeliveryDate)
      : input.requiredDeliveryDate
    : null

  if (required) {
    const daysRemaining = Math.floor((required.getTime() - today.getTime()) / MS_PER_DAY)
    if (daysRemaining < 0) {
      drivers.push('Required date has passed')
    } else if (daysRemaining <= 14) {
      drivers.push('Required date within 14 days')
    }
  } else if (input.riskLevel !== 'on_track') {
    drivers.push('No required date set')
  }

  // Critical risk without specific drivers gets a generic one
  if (input.riskLevel === 'critical' && drivers.length === 0) {
    drivers.push('High risk — check material ETAs')
  }

  return drivers
}
