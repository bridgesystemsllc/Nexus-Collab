// ─── Line queries and mutations ─────────────────────────────
// Every list is one indexed query plus one count; nothing is filtered or
// totalled in Node. The grid is the operator's whole working surface and it
// will hold thousands of lines, so "fetch and filter in memory" would be a
// promise the feature cannot keep by the second import.

import type { Prisma, PrismaClient } from '@prisma/client'
import type { OorLineStatus } from '@nexus/shared'
import type { ListLinesQuery } from '../../routes/oor.schema'
import { buildLineWhere, buildLineOrderBy } from '../../routes/oor.schema'
import { deriveLineStatus, deriveRiskLevel, isLineOpen, type DeriveNode } from './deriveStatus'

export interface LineSummary {
  openLines: number
  openValue: number
  linesShort: number
  critical: number
  awaitingCustomerApproval: number
}

export interface ListLinesResult {
  rows: unknown[]
  total: number
  page: number
  pageSize: number
  summary: LineSummary
}

/** Counts shown on the stat cards. Computed in SQL: they describe the whole
 *  filtered set, not the page, so summing the page would simply be wrong. */
async function summarise(
  prisma: PrismaClient,
  where: Prisma.OorLineWhereInput,
): Promise<LineSummary> {
  const [openLines, valueAgg, linesShort, critical, awaitingCustomerApproval] = await Promise.all([
    prisma.oorLine.count({ where }),
    prisma.oorLine.aggregate({ where, _sum: { valueComputed: true } }),
    prisma.oorLine.count({
      where: { ...where, lineStatus: { in: ['SHORT_MATERIAL', 'AWAITING_COMPONENT', 'AWAITING_ARTWORK'] } },
    }),
    prisma.oorLine.count({ where: { ...where, riskLevel: 'critical' } }),
    prisma.oorLine.count({ where: { ...where, lineStatus: 'AWAITING_CUSTOMER_APPROVAL' } }),
  ])

  return {
    openLines,
    openValue: Number(valueAgg._sum.valueComputed ?? 0),
    linesShort,
    critical,
    awaitingCustomerApproval,
  }
}

export async function listLines(
  prisma: PrismaClient,
  orgId: string,
  query: ListLinesQuery,
): Promise<ListLinesResult> {
  const where = buildLineWhere(orgId, query)
  const [rows, total, summary] = await Promise.all([
    prisma.oorLine.findMany({
      where,
      orderBy: buildLineOrderBy(query),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      // Counts, not contents: the grid shows activity as chips, and loading
      // every comment for every row to render a number would be absurd.
      include: {
        _count: { select: { nodes: true, comments: true, notes: true, meetingUpdates: true } },
      },
    }),
    prisma.oorLine.count({ where }),
    summarise(prisma, where),
  ])

  return { rows, total, page: query.page, pageSize: query.pageSize, summary }
}

export async function getLine(prisma: PrismaClient, orgId: string, id: string) {
  return prisma.oorLine.findFirst({
    where: { id, orgId },
    include: {
      _count: { select: { nodes: true, comments: true, notes: true, meetingUpdates: true } },
      reportRun: { select: { id: true, reportLabel: true, asOfDate: true, sourceFilename: true, importedAt: true } },
    },
  })
}

export interface TreeNode {
  id: string
  level: number
  children: TreeNode[]
  [key: string]: unknown
}

/** The tree, fetched flat in one query and nested here. Recursing in SQL would
 *  cost one round trip per level for a shape that is never deeper than two. */
export async function getTree(prisma: PrismaClient, orgId: string, lineId: string): Promise<TreeNode[] | null> {
  const line = await prisma.oorLine.findFirst({ where: { id: lineId, orgId }, select: { id: true } })
  if (!line) return null

  const flat = await prisma.oorShortageNode.findMany({
    where: { oorLineId: lineId },
    orderBy: [{ level: 'asc' }, { sortIndex: 'asc' }],
  })

  const byId = new Map<string, TreeNode>()
  for (const node of flat) byId.set(node.id, { ...node, children: [] } as unknown as TreeNode)

  const roots: TreeNode[] = []
  for (const node of flat) {
    const shaped = byId.get(node.id)!
    const parent = node.parentNodeId ? byId.get(node.parentNodeId) : null
    if (parent) parent.children.push(shaped)
    else roots.push(shaped)
  }
  return roots.sort((a, b) => Number(a.sortIndex) - Number(b.sortIndex))
}

/** Only fields whose change is worth a reader's time later. */
const AUDITED_LINE_FIELDS = ['lineStatus', 'riskLevel', 'ownerId', 'requiredDeliveryDate', 'shipDate'] as const
const AUDITED_NODE_FIELDS = [
  'qtyOnHand', 'onHandLocation', 'etaDate', 'etaConfidence', 'shortageReason', 'nodeStatus', 'mfgComment',
] as const

function diff(before: Record<string, unknown>, after: Record<string, unknown>, fields: readonly string[]) {
  const changes: Record<string, { from: unknown; to: unknown }> = {}
  for (const f of fields) {
    if (!(f in after)) continue
    const from = before[f] instanceof Date ? (before[f] as Date).toISOString() : before[f]
    const to = after[f] instanceof Date ? (after[f] as Date).toISOString() : after[f]
    const norm = (v: unknown) => (v === undefined ? null : v === null ? null : String(v))
    if (norm(from) !== norm(to)) changes[f] = { from: from ?? null, to: to ?? null }
  }
  return changes
}

interface Actor {
  id: string | null
  email: string | null
}

const normalizeManufacturerName = (value: string) => value.trim().toLocaleLowerCase()

export async function getManufacturerMapping(
  prisma: PrismaClient,
  orgId: string,
  manufacturerName: string,
) {
  const [mapping, codes] = await Promise.all([
    prisma.oorManufacturerMapping.findUnique({
      where: {
        orgId_erpManufacturerNameNormalized: {
          orgId,
          erpManufacturerNameNormalized: normalizeManufacturerName(manufacturerName),
        },
      },
    }),
    prisma.oorLine.findMany({
      where: { orgId, fulfillmentType: 'CONTRACT_MFG', cmCode: { not: null } },
      distinct: ['cmCode'],
      orderBy: { cmCode: 'asc' },
      select: { cmCode: true },
    }),
  ])
  return { mapping, cmCodes: codes.flatMap((row) => row.cmCode ? [row.cmCode] : []) }
}

export async function upsertManufacturerMapping(
  prisma: PrismaClient,
  orgId: string,
  actor: Actor,
  manufacturerName: string,
  cmCode: string,
) {
  const normalized = normalizeManufacturerName(manufacturerName)
  return prisma.$transaction(async (tx) => {
    // Serialize saves for one organization/manufacturer so the audit diff
    // always describes the value that this write actually replaced.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${orgId}:${normalized}`}))`
    const before = await tx.oorManufacturerMapping.findUnique({
      where: { orgId_erpManufacturerNameNormalized: { orgId, erpManufacturerNameNormalized: normalized } },
    })
    const after = await tx.oorManufacturerMapping.upsert({
      where: { orgId_erpManufacturerNameNormalized: { orgId, erpManufacturerNameNormalized: normalized } },
      create: {
        orgId,
        erpManufacturerName: manufacturerName.trim(),
        erpManufacturerNameNormalized: normalized,
        cmCode: cmCode.trim(),
        createdById: actor.id,
        updatedById: actor.id,
      },
      update: {
        erpManufacturerName: manufacturerName.trim(),
        cmCode: cmCode.trim(),
        updatedById: actor.id,
      },
    })
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        actorEmailSnapshot: actor.email,
        action: before ? 'oor.manufacturer_mapping.update' : 'oor.manufacturer_mapping.create',
        entityType: 'oor_manufacturer_mapping',
        entityId: after.id,
        orgId,
        changes: {
          erpManufacturerName: { from: before?.erpManufacturerName ?? null, to: after.erpManufacturerName },
          cmCode: { from: before?.cmCode ?? null, to: after.cmCode },
        },
      },
    })
    return after
  })
}

/**
 * Status events reuse AuditLog rather than a bespoke table: it already carries
 * actor, denormalised actor email (so a trail still names someone after they
 * leave), a {field: {from, to}} changes blob, orgId, and an index on
 * (entityType, entityId, createdAt desc) — which is precisely the Activity
 * feed's query.
 */
async function writeAudit(
  prisma: PrismaClient,
  actor: Actor,
  orgId: string,
  entityType: 'oor_line' | 'oor_shortage_node',
  entityId: string,
  changes: Record<string, { from: unknown; to: unknown }>,
  reason?: string | null,
): Promise<void> {
  if (Object.keys(changes).length === 0) return

  const entry = {
    actorEmailSnapshot: actor.email,
    action: entityType === 'oor_line' ? ('oor.line.update' as const) : ('oor.node.update' as const),
    entityType,
    entityId,
    changes: changes as unknown as Prisma.InputJsonValue,
    orgId,
  }
  const metadata = reason ? { reason } : undefined

  try {
    await prisma.auditLog.create({
      data: { ...entry, actorId: actor.id, metadata: metadata as unknown as Prisma.InputJsonValue },
    })
  } catch (err: unknown) {
    // AuditLog.actorId is a foreign key to Member. An actor that does not
    // resolve to a row — a service account, a member deleted mid-request —
    // must not take the edit down with it: the update has already been applied,
    // so throwing here would show the operator a failure for a change that
    // actually happened.
    //
    // The entry is still written, with the id dropped and the reason recorded.
    // actorEmailSnapshot exists exactly so a trail can name someone without
    // the foreign key, which is what makes this degradation lossless.
    if (!isForeignKeyViolation(err)) throw err
    await prisma.auditLog.create({
      data: {
        ...entry,
        actorId: null,
        metadata: {
          ...(metadata ?? {}),
          unresolvedActorId: actor.id,
        } as unknown as Prisma.InputJsonValue,
      },
    })
  }
}

function isForeignKeyViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2003'
}

export async function updateLine(
  prisma: PrismaClient,
  orgId: string,
  actor: Actor,
  id: string,
  patch: {
    lineStatus?: OorLineStatus
    statusOverrideReason?: string
    riskLevel?: string
    ownerId?: string | null
    requiredDeliveryDate?: Date | null
    shipDate?: Date | null
  },
) {
  const before = await prisma.oorLine.findFirst({ where: { id, orgId } })
  if (!before) return null

  const data: Prisma.OorLineUpdateInput = {}
  if (patch.riskLevel !== undefined) data.riskLevel = patch.riskLevel
  if (patch.ownerId !== undefined) data.ownerId = patch.ownerId
  if (patch.requiredDeliveryDate !== undefined) data.requiredDeliveryDate = patch.requiredDeliveryDate
  if (patch.shipDate !== undefined) data.shipDate = patch.shipDate

  if (patch.lineStatus !== undefined) {
    data.lineStatus = patch.lineStatus
    // A hand-set status marks the line, so no later import silently undoes it.
    data.statusSource = 'manual'
    data.statusOverrideReason = patch.statusOverrideReason ?? null
    data.isOpen = isLineOpen(before.qtyRemaining === null ? null : Number(before.qtyRemaining), patch.lineStatus)
  }
  data.updatedById = actor.id

  const after = await prisma.oorLine.update({ where: { id }, data })
  await writeAudit(
    prisma, actor, orgId, 'oor_line', id,
    diff(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>, AUDITED_LINE_FIELDS),
    patch.statusOverrideReason ?? null,
  )
  return after
}

export async function updateNode(
  prisma: PrismaClient,
  orgId: string,
  actor: Actor,
  nodeId: string,
  patch: Record<string, unknown>,
  now = new Date(),
) {
  const before = await prisma.oorShortageNode.findFirst({
    where: { id: nodeId, oorLine: { orgId } },
    include: { oorLine: { select: { id: true, qtyRemaining: true, requiredDeliveryDate: true, statusSource: true, lineStatus: true } } },
  })
  if (!before) return null

  const after = await prisma.oorShortageNode.update({
    where: { id: nodeId },
    // updatedById is what tells the next import this node was touched by a
    // person and its values must survive the rebuild.
    data: { ...patch, updatedById: actor.id },
  })

  await writeAudit(
    prisma, actor, orgId, 'oor_shortage_node', nodeId,
    diff(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>, AUDITED_NODE_FIELDS),
  )

  // Editing the tree can change what the line's status should be — resolving
  // the last short component is exactly how a line stops being blocked — so the
  // line is re-derived unless a person has pinned its status by hand.
  const line = before.oorLine
  const siblings = await prisma.oorShortageNode.findMany({
    where: { oorLineId: line.id },
    select: {
      level: true, materialClass: true, componentType: true, qtyNeeded: true,
      qtyOnHand: true, customerProvided: true, nodeStatus: true, etaDate: true,
    },
  })
  const deriveNodes: DeriveNode[] = siblings.map((n) => ({
    level: n.level,
    materialClass: n.materialClass,
    componentType: n.componentType,
    qtyNeeded: n.qtyNeeded === null ? null : Number(n.qtyNeeded),
    qtyOnHand: n.qtyOnHand === null ? null : Number(n.qtyOnHand),
    customerProvided: n.customerProvided,
    nodeStatus: n.nodeStatus,
    etaDate: n.etaDate,
  }))
  const deriveInput = {
    qtyRemaining: line.qtyRemaining === null ? null : Number(line.qtyRemaining),
    manualStatus: line.statusSource === 'manual' ? (line.lineStatus as OorLineStatus) : null,
    nodes: deriveNodes,
    requiredDeliveryDate: line.requiredDeliveryDate,
  }
  const lineStatus = deriveLineStatus(deriveInput)
  const riskLevel = deriveRiskLevel(deriveInput, now)
  await prisma.oorLine.update({
    where: { id: line.id },
    data: {
      riskLevel,
      ...(line.statusSource === 'manual' ? {} : { lineStatus }),
    },
  })

  return after
}
