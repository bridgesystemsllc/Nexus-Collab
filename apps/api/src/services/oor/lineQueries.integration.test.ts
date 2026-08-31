// Needs a live database — run with `pnpm --filter @nexus/api test:integration`.
// Named *.integration.test.ts so the default `pnpm test` (and CI, which has no
// Postgres) skips it. These assert on indexed queries, SQL aggregates and
// cross-tenant scoping, none of which survive being mocked.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { runImport } from './importRun'
import { ExcelSourceAdapter } from './excel/excelSourceAdapter'
import {
  listLines, getLine, getTree, updateLine, updateNode,
  getManufacturerMapping, upsertManufacturerMapping,
} from './lineQueries'
import { listLinesQuerySchema } from '../../routes/oor.schema'

const prisma = new PrismaClient()
const ORG_ID = 'test_org_oor_queries'
const BRAND_ID = 'test_brand_oor_queries'
const ACTOR = { id: null, email: 'ops@example.com' }
const q = (params: Record<string, unknown> = {}) => listLinesQuerySchema.parse(params)

const fixture = (n: string) => fs.readFileSync(path.resolve(process.cwd(), '../../fixtures/oor', n))

async function wipe() {
  const lines = await prisma.oorLine.findMany({ where: { orgId: ORG_ID }, select: { id: true } })
  const ids = lines.map((l) => l.id)
  if (ids.length) {
    await prisma.oorComment.deleteMany({ where: { oorLineId: { in: ids } } })
    await prisma.oorNote.deleteMany({ where: { oorLineId: { in: ids } } })
    await prisma.oorMeetingUpdate.deleteMany({ where: { oorLineId: { in: ids } } })
    await prisma.oorShortageNode.deleteMany({ where: { oorLineId: { in: ids } } })
  }
  await prisma.oorLine.deleteMany({ where: { orgId: ORG_ID } })
  await prisma.oorReportRun.deleteMany({ where: { orgId: ORG_ID } })
  await prisma.oorManufacturerMapping.deleteMany({ where: { orgId: ORG_ID } })
  await prisma.auditLog.deleteMany({ where: { orgId: ORG_ID } })
}

beforeAll(async () => {
  await wipe()
  // This integration database can intentionally lag optional Organization
  // columns; raw setup keeps an OOR query test independent of that drift.
  await prisma.$executeRaw`
    INSERT INTO "Organization" ("id", "name", "slug", "featureInterests", "onboardingComplete", "createdAt", "updatedAt")
    VALUES (${ORG_ID}, 'OOR query test', ${ORG_ID}, ARRAY[]::TEXT[], false, NOW(), NOW())
    ON CONFLICT ("slug") DO NOTHING
  `
  const adapter = new ExcelSourceAdapter()
  for (const name of ['Acne_Free_Open_Order_Report_Week_of_08_17_2026.xls', 'AMBI_Open_Order_Shortage_Report_08_24_26.xlsx']) {
    await runImport(prisma, adapter, {
      buffer: fixture(name), filename: name, orgId: ORG_ID, brandId: BRAND_ID,
      importedById: null, now: new Date('2026-08-30T00:00:00Z'),
    })
  }
})

afterAll(async () => {
  await wipe()
  await prisma.$executeRaw`DELETE FROM "Organization" WHERE "id" = ${ORG_ID}`
  await prisma.$disconnect()
})

describe('listLines', () => {
  it('paginates without loading the table, and totals the whole filtered set', async () => {
    const page1 = await listLines(prisma, ORG_ID, q({ pageSize: 10 }))
    expect(page1.rows).toHaveLength(10)
    expect(page1.total).toBe(58) // 51 AcneFree + 7 AMBI
    expect(page1.summary.openLines).toBe(58)
  })

  it('does not leak another organization rows', async () => {
    const other = await listLines(prisma, 'org_that_does_not_exist', q())
    expect(other.total).toBe(0)
  })

  it('summarises in SQL, so the cards describe the filter and not the page', async () => {
    const all = await listLines(prisma, ORG_ID, q({ pageSize: 1 }))
    expect(all.rows).toHaveLength(1)
    expect(all.summary.openLines).toBe(58)
    expect(all.summary.openValue).toBeGreaterThan(3_000_000)
    expect(all.summary.awaitingCustomerApproval).toBeGreaterThan(0)
  })

  it('filters by status and reflects it in the total', async () => {
    const blocked = await listLines(prisma, ORG_ID, q({ status: 'AWAITING_CUSTOMER_APPROVAL' }))
    expect(blocked.total).toBeGreaterThan(0)
    expect(blocked.total).toBeLessThan(58)
    expect(blocked.rows.every((r: any) => r.lineStatus === 'AWAITING_CUSTOMER_APPROVAL')).toBe(true)
  })

  it('searches across every identifier', async () => {
    const byPo = await listLines(prisma, ORG_ID, q({ search: 'V09302025' }))
    expect(byPo.total).toBe(1)
    const byItem = await listLines(prisma, ORG_ID, q({ search: 'S3976205' }))
    expect(byItem.total).toBeGreaterThan(0)
  })

  it('finds only lines that actually carry a shortage tree when asked', async () => {
    const short = await listLines(prisma, ORG_ID, q({ hasShortage: 'true' }))
    expect(short.total).toBe(7)
  })

  it('sorts both directions and keeps pages stable', async () => {
    const desc = await listLines(prisma, ORG_ID, q({ sort: 'qtyRemaining', dir: 'desc', pageSize: 5 }))
    const qtys = desc.rows.map((r: any) => Number(r.qtyRemaining))
    expect(qtys).toEqual([...qtys].sort((a, b) => b - a))
  })

  it('returns activity counts without fetching the activity', async () => {
    const page = await listLines(prisma, ORG_ID, q({ pageSize: 60 }))
    const withComments = page.rows.filter((r: any) => r._count.comments > 0)
    expect(withComments.length).toBe(46)
  })
})

describe('getTree', () => {
  it('nests the tree two levels deep in one query', async () => {
    const line = await prisma.oorLine.findFirstOrThrow({ where: { orgId: ORG_ID, customerPoNumber: 'V09302025' } })
    const tree = await getTree(prisma, ORG_ID, line.id)!
    expect(tree).not.toBeNull()
    expect(tree!.every((n) => n.level === 1)).toBe(true)
    const children = tree!.flatMap((n) => n.children)
    expect(children.every((c) => c.level === 2)).toBe(true)
    expect(children.length).toBeGreaterThan(0)
  })

  it('refuses to read a tree from another organization', async () => {
    const line = await prisma.oorLine.findFirstOrThrow({ where: { orgId: ORG_ID } })
    expect(await getTree(prisma, 'someone_else', line.id)).toBeNull()
  })
})

describe('updateLine', () => {
  it('records a status override, marks it manual, and writes the audit entry', async () => {
    const line = await prisma.oorLine.findFirstOrThrow({ where: { orgId: ORG_ID, statusSource: 'derived' } })
    const before = line.lineStatus

    const after = await updateLine(prisma, ORG_ID, ACTOR, line.id, {
      lineStatus: 'ON_HOLD_QC',
      statusOverrideReason: 'Failed micro on the retain',
    })

    expect(after!.lineStatus).toBe('ON_HOLD_QC')
    expect(after!.statusSource).toBe('manual')
    expect(after!.statusOverrideReason).toBe('Failed micro on the retain')

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: 'oor_line', entityId: line.id },
      orderBy: { createdAt: 'desc' },
    })
    expect(audit).not.toBeNull()
    expect(audit!.action).toBe('oor.line.update')
    expect((audit!.changes as any).lineStatus).toEqual({ from: before, to: 'ON_HOLD_QC' })
    expect((audit!.metadata as any).reason).toBe('Failed micro on the retain')
    expect(audit!.actorEmailSnapshot).toBe('ops@example.com')
  })

  it('writes no audit entry when nothing actually changed', async () => {
    const line = await prisma.oorLine.findFirstOrThrow({ where: { orgId: ORG_ID } })
    const countBefore = await prisma.auditLog.count({ where: { entityId: line.id } })
    await updateLine(prisma, ORG_ID, ACTOR, line.id, { ownerId: line.ownerId })
    expect(await prisma.auditLog.count({ where: { entityId: line.id } })).toBe(countBefore)
  })

  it('refuses to update a line belonging to another organization', async () => {
    const line = await prisma.oorLine.findFirstOrThrow({ where: { orgId: ORG_ID } })
    expect(await updateLine(prisma, 'someone_else', ACTOR, line.id, { ownerId: 'x' })).toBeNull()
  })
})

describe('updateNode', () => {
  it('re-derives the line when a tree edit clears the last blocker', async () => {
    const line = await prisma.oorLine.findFirstOrThrow({
      where: { orgId: ORG_ID, lineStatus: 'AWAITING_CUSTOMER_APPROVAL', statusSource: 'derived' },
    })
    const blockers = await prisma.oorShortageNode.findMany({
      where: { oorLineId: line.id, customerProvided: true },
    })
    expect(blockers.length).toBeGreaterThan(0)

    for (const b of blockers) {
      await updateNode(prisma, ORG_ID, ACTOR, b.id, { nodeStatus: 'RESOLVED' }, new Date('2026-08-30T00:00:00Z'))
    }

    const after = await prisma.oorLine.findUniqueOrThrow({ where: { id: line.id } })
    expect(after.lineStatus).not.toBe('AWAITING_CUSTOMER_APPROVAL')
  })

  it('marks the node as touched so a re-import cannot overwrite it', async () => {
    const node = await prisma.oorShortageNode.findFirstOrThrow({
      where: { oorLine: { orgId: ORG_ID }, updatedById: null },
    })
    await updateNode(prisma, ORG_ID, ACTOR, node.id, { qtyOnHand: 99 })
    const after = await prisma.oorShortageNode.findUniqueOrThrow({ where: { id: node.id } })
    expect(after.updatedById).toBe(ACTOR.id)
    expect(Number(after.qtyOnHand)).toBe(99)
  })

  it('still applies the edit, and still records it, when the actor does not resolve to a member', async () => {
    const node = await prisma.oorShortageNode.findFirstOrThrow({
      where: { oorLine: { orgId: ORG_ID }, updatedById: null },
    })
    // A member id that is not in the table: AuditLog.actorId is a foreign key,
    // so a naive write would throw after the update had already landed.
    const ghost = { id: 'member_that_does_not_exist', email: 'ghost@example.com' }
    await expect(updateNode(prisma, ORG_ID, ghost, node.id, { qtyOnHand: 77 })).resolves.toBeTruthy()

    const after = await prisma.oorShortageNode.findUniqueOrThrow({ where: { id: node.id } })
    expect(Number(after.qtyOnHand)).toBe(77)

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: 'oor_shortage_node', entityId: node.id },
      orderBy: { createdAt: 'desc' },
    })
    expect(audit).not.toBeNull()
    expect(audit!.actorId).toBeNull()
    expect(audit!.actorEmailSnapshot).toBe('ghost@example.com')
    expect((audit!.metadata as any).unresolvedActorId).toBe('member_that_does_not_exist')
  })

  it('never re-derives over a status a person pinned by hand', async () => {
    const line = await prisma.oorLine.findFirstOrThrow({ where: { orgId: ORG_ID, statusSource: 'manual' } })
    const node = await prisma.oorShortageNode.findFirst({ where: { oorLineId: line.id } })
    if (!node) return
    await updateNode(prisma, ORG_ID, ACTOR, node.id, { qtyOnHand: 0 })
    const after = await prisma.oorLine.findUniqueOrThrow({ where: { id: line.id } })
    expect(after.statusSource).toBe('manual')
    expect(after.lineStatus).toBe(line.lineStatus)
  })
})

describe('manufacturer mappings', () => {
  it('resolves case-insensitively, stays organization-scoped, and writes an audit entry', async () => {
    await prisma.oorLine.create({
      data: {
        orgId: ORG_ID,
        customerPoNumber: 'CM-MAPPING-PO',
        salesOrderNumber: 'CM-MAPPING-SO',
        itemNumber: 'CM-MAPPING-SKU',
        fulfillmentType: 'CONTRACT_MFG',
        cmCode: 'ACM',
      },
    })
    const sourceCode = await prisma.oorLine.findFirstOrThrow({
      where: { orgId: ORG_ID, fulfillmentType: 'CONTRACT_MFG', cmCode: { not: null } },
      select: { cmCode: true },
    })
    const saved = await upsertManufacturerMapping(prisma, ORG_ID, ACTOR, 'Acme Labs', sourceCode.cmCode!)
    expect(saved.cmCode).toBe(sourceCode.cmCode)

    const resolved = await getManufacturerMapping(prisma, ORG_ID, '  ACME LABS ')
    expect(resolved.mapping?.id).toBe(saved.id)
    expect(resolved.cmCodes).toContain(sourceCode.cmCode)
    expect((await getManufacturerMapping(prisma, 'someone_else', 'Acme Labs')).mapping).toBeNull()

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { orgId: ORG_ID, entityType: 'oor_manufacturer_mapping', entityId: saved.id },
    })
    expect(audit.action).toBe('oor.manufacturer_mapping.create')
    expect(audit.actorEmailSnapshot).toBe(ACTOR.email)
  })
})
