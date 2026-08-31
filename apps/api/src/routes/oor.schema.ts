// ─── Open Order Report request schemas ──────────────────────
// Validation and query construction, kept out of the route handlers so the
// filtering rules can be unit-tested without a database or an HTTP server —
// the same split members.schema.ts uses.

import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import {
  OOR_LINE_STATUSES,
  OOR_RISK_LEVELS,
  OOR_SHORTAGE_REASONS,
  OOR_FULFILLMENT_TYPES,
} from '@nexus/shared'

export const MAX_PAGE_SIZE = 200
const DEFAULT_PAGE_SIZE = 50

/** Query strings arrive as `?status=A&status=B` or `?status=A,B`; accept both. */
const csvArray = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined
      const list = Array.isArray(v) ? v : v.split(',')
      return list.map((s) => s.trim()).filter(Boolean)
    })
    .refine((list) => list === undefined || list.every((s) => (values as readonly string[]).includes(s)), {
      message: `Expected one of: ${values.join(', ')}`,
    })

export const SORTABLE_FIELDS = [
  'requiredDeliveryDate',
  'origRequiredDate',
  'orderDate',
  'customerPoNumber',
  'salesOrderNumber',
  'itemNumber',
  'qtyRemaining',
  'unitPrice',
  'valueComputed',
  'lineStatus',
  'riskLevel',
  'updatedAt',
] as const

export const listLinesQuerySchema = z.object({
  brandId: z.string().optional(),
  status: csvArray(OOR_LINE_STATUSES),
  risk: csvArray(OOR_RISK_LEVELS),
  fulfillmentType: z.enum(OOR_FULFILLMENT_TYPES).optional(),
  cmCode: z.string().optional(),
  search: z.string().trim().min(1).optional(),
  requiredBefore: z.coerce.date().optional(),
  hasShortage: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  openOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? true : v === 'true')),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  sort: z.enum(SORTABLE_FIELDS).default('requiredDeliveryDate'),
  dir: z.enum(['asc', 'desc']).default('asc'),
})

export type ListLinesQuery = z.infer<typeof listLinesQuerySchema>

/**
 * Builds the Prisma filter. Org scoping is applied here rather than left to the
 * caller so no route can forget it — Nexus is multi-tenant, and a missing
 * orgId is a cross-tenant leak, not a bug you notice in review.
 */
export function buildLineWhere(orgId: string, q: ListLinesQuery): Prisma.OorLineWhereInput {
  const where: Prisma.OorLineWhereInput = { orgId }

  if (q.brandId) where.brandId = q.brandId
  if (q.openOnly) where.isOpen = true
  if (q.status && q.status.length > 0) where.lineStatus = { in: q.status }
  if (q.risk && q.risk.length > 0) where.riskLevel = { in: q.risk }
  if (q.fulfillmentType) where.fulfillmentType = q.fulfillmentType
  if (q.cmCode) where.cmCode = q.cmCode
  if (q.requiredBefore) where.requiredDeliveryDate = { lte: q.requiredBefore }

  if (q.search) {
    const contains = q.search
    where.OR = [
      { customerPoNumber: { contains, mode: 'insensitive' } },
      { salesOrderNumber: { contains, mode: 'insensitive' } },
      { itemNumber: { contains, mode: 'insensitive' } },
      { custPartNumber: { contains, mode: 'insensitive' } },
      { description: { contains, mode: 'insensitive' } },
      { workOrderNumber: { contains, mode: 'insensitive' } },
      { jobNumber: { contains, mode: 'insensitive' } },
    ]
  }

  // "Has a shortage" is a question about the tree, answered by the tree: any
  // node needing more than is on hand, or any unresolved customer-provided one.
  if (q.hasShortage !== undefined) {
    const shortage: Prisma.OorLineWhereInput = {
      nodes: { some: { OR: [{ qtyOnHand: null, qtyNeeded: { gt: 0 } }, { customerProvided: true }] } },
    }
    if (q.hasShortage) Object.assign(where, shortage)
    else where.nodes = { none: { OR: [{ qtyOnHand: null, qtyNeeded: { gt: 0 } }, { customerProvided: true }] } }
  }

  return where
}

export function buildLineOrderBy(q: ListLinesQuery): Prisma.OorLineOrderByWithRelationInput[] {
  // A stable secondary key: without it, two rows sharing a required date can
  // swap places between pages and the operator sees a duplicate and a gap.
  return [{ [q.sort]: q.dir } as Prisma.OorLineOrderByWithRelationInput, { id: 'asc' }]
}

export const patchLineSchema = z
  .object({
    lineStatus: z.enum(OOR_LINE_STATUSES).optional(),
    statusOverrideReason: z.string().trim().min(1).max(500).optional(),
    riskLevel: z.enum(OOR_RISK_LEVELS).optional(),
    ownerId: z.string().nullable().optional(),
    requiredDeliveryDate: z.coerce.date().nullable().optional(),
    shipDate: z.coerce.date().nullable().optional(),
  })
  .refine((v) => v.lineStatus === undefined || (v.statusOverrideReason?.length ?? 0) > 0, {
    message: 'A status override needs a reason — it is what the audit trail shows a reader later.',
    path: ['statusOverrideReason'],
  })

export const patchNodeSchema = z.object({
  qtyOnHand: z.coerce.number().nullable().optional(),
  onHandLocation: z.string().trim().max(200).nullable().optional(),
  etaDate: z.coerce.date().nullable().optional(),
  etaConfidence: z.enum(['confirmed', 'estimated', 'unknown']).optional(),
  shortageReason: z.enum(OOR_SHORTAGE_REASONS).optional(),
  nodeStatus: z.string().trim().min(1).max(40).optional(),
  mfgComment: z.string().nullable().optional(),
})

export const importQuerySchema = z.object({
  brandId: z.string().min(1, 'An import must name the brand it belongs to.'),
})
