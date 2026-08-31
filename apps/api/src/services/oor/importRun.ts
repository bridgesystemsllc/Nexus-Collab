// ─── Import runs ────────────────────────────────────────────
// One rule governs this file: an import refreshes what the report owns and
// touches nothing a person wrote. The reports arrive weekly and the whole point
// of the feature is that the conversation about a PO — the comments, the
// meeting decisions, the vendor's ETA email — outlives any single file. An
// importer that replaced rows wholesale would delete exactly the thing the
// feature exists to keep.
//
// So: report-sourced fields are refreshed, user-authored records are left
// alone, and a field a person has edited by hand is carried forward rather than
// overwritten.

import { createHash } from 'node:crypto'
import type { Prisma, PrismaClient } from '@prisma/client'
import type { OorLineStatus } from '@nexus/shared'
import type { ParsedLine, ParsedNode, ParseWarning, SourceAdapter, SourceInput } from './sourceAdapter'
import { deriveLineStatus, deriveRiskLevel, isLineOpen, type DeriveNode } from './deriveStatus'

export interface ImportResult {
  runId: string
  created: number
  updated: number
  nodesWritten: number
  commentsImported: number
  warnings: ParseWarning[]
  /** Set when this exact file has already been imported; nothing is written. */
  duplicateOfRunId?: string
}

export interface RunImportInput extends SourceInput {
  importedById: string | null
  /** Injected so a test can pin the clock; risk derivation must not read it. */
  now?: Date
}

const num = (v: number | null): Prisma.Decimal | null => (v === null ? null : (v as unknown as Prisma.Decimal))

/** Only these node fields belong to a person once they have edited one. */
interface PreservedNodeEdits {
  qtyOnHand: Prisma.Decimal | null
  onHandLocation: string | null
  etaDate: Date | null
  etaConfidence: string
  shortageReason: string
  nodeStatus: string
  mfgComment: string | null
  updatedById: string | null
}

const nodeKey = (level: number, jobNumber: string | null, partNumber: string | null) =>
  `${level}::${jobNumber ?? ''}::${partNumber ?? ''}`

function flattenNodes(nodes: ParsedNode[]): ParsedNode[] {
  return nodes.flatMap((n) => [n, ...flattenNodes(n.children)])
}

function toDeriveNodes(nodes: ParsedNode[], onHand: Map<string, number | null>): DeriveNode[] {
  return flattenNodes(nodes).map((n) => ({
    level: n.level,
    materialClass: n.materialClass,
    componentType: n.componentType,
    qtyNeeded: n.qtyNeeded,
    qtyOnHand: onHand.get(nodeKey(n.level, n.jobNumber, n.partNumber)) ?? null,
    customerProvided: n.customerProvided,
    nodeStatus: 'OPEN',
    etaDate: n.etaDate,
  }))
}

export async function runImport(
  prisma: PrismaClient,
  adapter: SourceAdapter,
  input: RunImportInput,
): Promise<ImportResult> {
  const now = input.now ?? new Date()

  // Idempotency is on the bytes, not the filename: the same report forwarded
  // twice under two names is still the same report.
  const sourceFileHash = input.buffer
    ? createHash('sha256').update(input.buffer).digest('hex')
    : createHash('sha256').update(`${adapter.key}:${input.orgId}:${now.toISOString()}`).digest('hex')

  const duplicate = await prisma.oorReportRun.findFirst({
    where: { orgId: input.orgId, sourceFileHash },
    select: { id: true, parseWarnings: true },
  })
  if (duplicate) {
    return {
      runId: duplicate.id,
      created: 0,
      updated: 0,
      nodesWritten: 0,
      commentsImported: 0,
      warnings: (duplicate.parseWarnings as unknown as ParseWarning[]) ?? [],
      duplicateOfRunId: duplicate.id,
    }
  }

  const report = await adapter.load(input)

  const run = await prisma.oorReportRun.create({
    data: {
      orgId: input.orgId,
      brandId: input.brandId || null,
      reportType: report.reportType,
      reportLabel: report.reportLabel,
      asOfDate: report.asOfDate,
      sourceFilename: input.filename ?? 'upload',
      sourceFileHash,
      sourceAdapter: adapter.key,
      importedById: input.importedById,
      status: 'importing',
      parseWarnings: report.warnings as unknown as Prisma.InputJsonValue,
      parseWarningCount: report.warnings.length,
      rowCount: report.lines.length,
    },
    select: { id: true },
  })

  let created = 0
  let updated = 0
  let nodesWritten = 0
  let commentsImported = 0

  for (const line of report.lines) {
    const written = await writeLine(prisma, run.id, input, line, now)
    if (written.created) created++
    else updated++
    nodesWritten += written.nodesWritten
    commentsImported += written.commentsImported
  }

  await prisma.oorReportRun.update({
    where: { id: run.id },
    data: { status: 'ready' },
  })

  return {
    runId: run.id,
    created,
    updated,
    nodesWritten,
    commentsImported,
    warnings: report.warnings,
  }
}

async function writeLine(
  prisma: PrismaClient,
  runId: string,
  input: RunImportInput,
  line: ParsedLine,
  now: Date,
): Promise<{ created: boolean; nodesWritten: number; commentsImported: number }> {
  const brandId = input.brandId || null

  // The unique index covers nullable columns, and Postgres treats NULLs as
  // distinct — so an upsert would create a second row for every Format B line,
  // which has no sales order number. Match explicitly instead.
  const existing = await prisma.oorLine.findFirst({
    where: {
      orgId: input.orgId,
      brandId,
      customerPoNumber: line.customerPoNumber,
      salesOrderNumber: line.salesOrderNumber,
      itemNumber: line.itemNumber,
    },
    select: {
      id: true,
      lineStatus: true,
      statusSource: true,
      statusOverrideReason: true,
      ownerId: true,
    },
  })

  // Carry forward anything a person has edited on the existing tree before it
  // is replaced. Keyed on (level, job, part) because ids do not survive a
  // re-import and the source has no stable node identifier of its own.
  const preserved = new Map<string, PreservedNodeEdits>()
  if (existing) {
    const priorNodes = await prisma.oorShortageNode.findMany({
      where: { oorLineId: existing.id },
      select: {
        level: true,
        jobNumber: true,
        partNumber: true,
        qtyOnHand: true,
        onHandLocation: true,
        etaDate: true,
        etaConfidence: true,
        shortageReason: true,
        nodeStatus: true,
        mfgComment: true,
        updatedById: true,
      },
    })
    for (const n of priorNodes) {
      // Only a node someone actually touched carries its values forward. An
      // untouched node takes the file's values, which is how a corrected ETA in
      // next week's report actually reaches the screen.
      if (n.updatedById === null) continue
      preserved.set(nodeKey(n.level, n.jobNumber, n.partNumber), {
        qtyOnHand: n.qtyOnHand,
        onHandLocation: n.onHandLocation,
        etaDate: n.etaDate,
        etaConfidence: n.etaConfidence,
        shortageReason: n.shortageReason,
        nodeStatus: n.nodeStatus,
        mfgComment: n.mfgComment,
        updatedById: n.updatedById,
      })
    }
  }

  const onHandByKey = new Map<string, number | null>()
  for (const [key, edits] of preserved) {
    onHandByKey.set(key, edits.qtyOnHand === null ? null : Number(edits.qtyOnHand))
  }

  const manualStatus =
    existing?.statusSource === 'manual' ? (existing.lineStatus as OorLineStatus) : null
  const deriveInput = {
    qtyRemaining: line.qtyRemaining,
    manualStatus,
    nodes: toDeriveNodes(line.nodes, onHandByKey),
    requiredDeliveryDate: line.requiredDeliveryDate,
  }
  const lineStatus = deriveLineStatus(deriveInput)
  const riskLevel = deriveRiskLevel(deriveInput, now)

  // Everything the report owns. Deliberately excludes ownerId, statusSource,
  // statusOverrideReason and every collaboration relation.
  const reportOwnedFields = {
    reportRunId: runId,
    channelTag: line.channelTag,
    custPartNumber: line.custPartNumber,
    description: line.description,
    qtyOrdered: num(line.qtyOrdered),
    qtyOrderedRaw: line.qtyOrderedRaw,
    qtyRemaining: num(line.qtyRemaining),
    unitPrice: num(line.unitPrice),
    valueSource: num(line.valueSource),
    valueComputed: num(line.valueComputed),
    valueMismatch: line.valueMismatch,
    orderDate: line.orderDate,
    shipDate: line.shipDate,
    origRequiredDate: line.origRequiredDate,
    requiredDeliveryDate: line.requiredDeliveryDate,
    workOrderNumber: line.workOrderNumber,
    jobNumber: line.jobNumber,
    fulfillmentType: line.fulfillmentType,
    cmCode: line.cmCode,
    jobStatus: line.jobStatus,
    riskLevel,
    isOpen: isLineOpen(line.qtyRemaining, lineStatus),
    externalIds: line.externalIds as unknown as Prisma.InputJsonValue,
    rawRow: line.rawRow as unknown as Prisma.InputJsonValue,
    updatedById: input.importedById,
  }

  let lineId: string
  let wasCreated = false

  if (existing) {
    await prisma.oorLine.update({
      where: { id: existing.id },
      data: {
        ...reportOwnedFields,
        // A status somebody set by hand survives every future import.
        ...(existing.statusSource === 'manual' ? {} : { lineStatus }),
      },
    })
    lineId = existing.id
  } else {
    const createdLine = await prisma.oorLine.create({
      data: {
        ...reportOwnedFields,
        orgId: input.orgId,
        brandId,
        customerPoNumber: line.customerPoNumber,
        salesOrderNumber: line.salesOrderNumber,
        itemNumber: line.itemNumber,
        lineStatus,
        statusSource: 'derived',
        createdById: input.importedById,
      },
      select: { id: true },
    })
    lineId = createdLine.id
    wasCreated = true
  }

  // Nodes are rebuilt rather than diffed: the source has no stable identifier,
  // so a diff would be guesswork. User edits were lifted out above and are put
  // back below, which makes the rebuild safe.
  await prisma.oorShortageNode.deleteMany({ where: { oorLineId: lineId } })
  const nodesWritten = await writeNodes(prisma, lineId, line.nodes, null, preserved, input.importedById)

  const commentsImported = await importLegacyComments(prisma, lineId, line)

  return { created: wasCreated, nodesWritten, commentsImported }
}

async function writeNodes(
  prisma: PrismaClient,
  oorLineId: string,
  nodes: ParsedNode[],
  parentNodeId: string | null,
  preserved: Map<string, PreservedNodeEdits>,
  actorId: string | null,
): Promise<number> {
  let count = 0
  for (const node of nodes) {
    const edits = preserved.get(nodeKey(node.level, node.jobNumber, node.partNumber))
    const createdNode = await prisma.oorShortageNode.create({
      data: {
        oorLineId,
        parentNodeId,
        level: node.level,
        jobNumber: node.jobNumber,
        partNumber: node.partNumber,
        description: node.description,
        materialClass: node.materialClass,
        componentType: node.componentType,
        qtyNeeded: num(node.qtyNeeded),
        uom: node.uom,
        customerProvided: node.customerProvided,
        sortIndex: node.sortIndex,
        rawRow: node.rawRow as unknown as Prisma.InputJsonValue,
        createdById: actorId,
        // A person's edits win over the file; an untouched node takes the file.
        qtyOnHand: edits?.qtyOnHand ?? null,
        onHandLocation: edits?.onHandLocation ?? null,
        etaDate: edits ? edits.etaDate : node.etaDate,
        etaConfidence: edits ? edits.etaConfidence : node.etaConfidence,
        shortageReason: edits?.shortageReason ?? 'NONE',
        nodeStatus: edits?.nodeStatus ?? 'OPEN',
        mfgComment: edits ? edits.mfgComment : node.mfgComment,
        updatedById: edits?.updatedById ?? null,
      },
      select: { id: true },
    })
    count++
    if (node.children.length > 0) {
      count += await writeNodes(prisma, oorLineId, node.children, createdNode.id, preserved, actorId)
    }
  }
  return count
}

/**
 * Legacy comments are inserted once and never again. Matching on
 * (entryDate, body) rather than on position means re-importing a file whose
 * comment cell gained one new entry adds exactly that entry, instead of
 * duplicating the whole thread every week.
 */
async function importLegacyComments(
  prisma: PrismaClient,
  oorLineId: string,
  line: ParsedLine,
): Promise<number> {
  if (line.comments.length === 0) return 0

  const seen = await prisma.oorComment.findMany({
    where: { oorLineId, source: 'imported_legacy' },
    select: { body: true, entryDate: true },
  })
  const seenKeys = new Set(seen.map((c) => `${c.entryDate?.toISOString() ?? ''}::${c.body}`))

  const fresh = line.comments.filter(
    (c) => !seenKeys.has(`${c.entryDate?.toISOString() ?? ''}::${c.body}`),
  )
  if (fresh.length === 0) return 0

  await prisma.oorComment.createMany({
    data: fresh.map((c) => ({
      oorLineId,
      body: c.body,
      entryDate: c.entryDate,
      authorInitials: c.authorInitials,
      source: 'imported_legacy',
    })),
  })
  return fresh.length
}
