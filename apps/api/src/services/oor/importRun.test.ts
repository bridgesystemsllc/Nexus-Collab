import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import * as XLSX from 'xlsx'
import { PrismaClient } from '@prisma/client'
import { runImport } from './importRun'
import { ExcelSourceAdapter } from './excel/excelSourceAdapter'

// These run against the local `nexus` database. The importer's contract —
// "never destroys user-authored content" — is a statement about real upserts
// against real constraints, so a mocked client would prove nothing.
const prisma = new PrismaClient()
const adapter = new ExcelSourceAdapter()

const ORG_ID = 'test_org_oor_import'
const BRAND_ID = 'test_brand_oor_import'

const fixture = (name: string) => fs.readFileSync(path.resolve(process.cwd(), '../../fixtures/oor', name))
const ACNE = 'Acne_Free_Open_Order_Report_Week_of_08_17_2026.xls'
const AMBI = 'AMBI_Open_Order_Shortage_Report_08_24_26.xlsx'

const load = (name: string, buffer?: Buffer) => ({
  buffer: buffer ?? fixture(name),
  filename: name,
  orgId: ORG_ID,
  brandId: BRAND_ID,
  importedById: null,
  now: new Date('2026-08-30T00:00:00Z'),
})

/** Next week's file: same report, one quantity revised. A sales order can carry
 *  several lines (an item plus a MISC fee), so the item number is part of the
 *  address, not decoration. */
function reviseQuantity(name: string, salesOrder: string, itemNumber: string, newQty: number): Buffer {
  const wb = XLSX.read(fixture(name), { cellNF: true })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, blankrows: false })
  const target = rows.findIndex((r) => r?.[1] === salesOrder && r?.[2] === itemNumber)
  if (target === -1) throw new Error(`fixture has no ${salesOrder} / ${itemNumber}`)
  sheet[XLSX.utils.encode_cell({ r: target, c: 5 })] = { t: 'n', v: newQty }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

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
}

beforeAll(wipe)
afterAll(async () => {
  await wipe()
  await prisma.$disconnect()
})

describe('runImport — first import', () => {
  it('lands 51 lines and a ready run from the AcneFree report', async () => {
    const result = await runImport(prisma, adapter, load(ACNE))
    expect(result.created).toBe(51)
    expect(result.updated).toBe(0)
    expect(result.warnings).toHaveLength(2)

    const run = await prisma.oorReportRun.findUniqueOrThrow({ where: { id: result.runId } })
    expect(run.status).toBe('ready')
    expect(run.rowCount).toBe(51)
    expect(run.parseWarningCount).toBe(2)
    expect(run.reportType).toBe('customer_open_order')
  })

  it('splits the legacy comment cells into attributable rows', async () => {
    const count = await prisma.oorComment.count({
      where: { oorLine: { orgId: ORG_ID }, source: 'imported_legacy' },
    })
    expect(count).toBe(54)
    const attributed = await prisma.oorComment.count({
      where: { oorLine: { orgId: ORG_ID }, authorInitials: { not: null } },
    })
    expect(attributed).toBeGreaterThan(0)
  })

  it('marks every line open and derives a status', async () => {
    const open = await prisma.oorLine.count({ where: { orgId: ORG_ID, isOpen: true } })
    expect(open).toBe(51)
    const derived = await prisma.oorLine.count({ where: { orgId: ORG_ID, statusSource: 'derived' } })
    expect(derived).toBe(51)
  })
})

describe('runImport — idempotency', () => {
  it('refuses to import the same bytes twice', async () => {
    const first = await prisma.oorReportRun.count({ where: { orgId: ORG_ID } })
    const result = await runImport(prisma, adapter, load(ACNE))
    expect(result.duplicateOfRunId).toBeDefined()
    expect(result.created).toBe(0)
    expect(await prisma.oorReportRun.count({ where: { orgId: ORG_ID } })).toBe(first)
  })

  it('does not duplicate the comment thread when the same report arrives again', async () => {
    const buffer = reviseQuantity(ACNE, 'S0100057780', 'S2951002', 900)
    await runImport(prisma, adapter, load(ACNE, buffer))
    const count = await prisma.oorComment.count({
      where: { oorLine: { orgId: ORG_ID }, source: 'imported_legacy' },
    })
    expect(count).toBe(54)
  })
})

describe('runImport — user-authored content survives a re-import', () => {
  it('keeps comments, notes and meeting updates, and honours a manual status', async () => {
    const line = await prisma.oorLine.findFirstOrThrow({
      where: { orgId: ORG_ID, salesOrderNumber: 'S0100057747', itemNumber: 'S3976205' },
    })

    await prisma.oorComment.create({
      data: { oorLineId: line.id, body: 'Called the CM, fill moved to the 21st.', source: 'app' },
    })
    await prisma.oorNote.create({
      data: { oorLineId: line.id, title: 'Packaging spec', body: 'Uses the 2026 carton.' },
    })
    await prisma.oorMeetingUpdate.create({
      data: {
        oorLineId: line.id,
        meetingDate: new Date('2026-08-25T00:00:00Z'),
        decision: 'Ship partial',
        nextAction: 'Confirm carrier',
        dueDate: new Date('2026-09-01T00:00:00Z'),
      },
    })
    await prisma.oorLine.update({
      where: { id: line.id },
      data: {
        lineStatus: 'FILLED_AWAITING_PICKUP',
        statusSource: 'manual',
        statusOverrideReason: 'Confirmed ready on the floor',
        ownerId: 'member_test',
      },
    })

    const buffer = reviseQuantity(ACNE, 'S0100057747', 'S3976205', 12345)
    const result = await runImport(prisma, adapter, load(ACNE, buffer))
    expect(result.updated).toBe(51)
    expect(result.created).toBe(0)

    const after = await prisma.oorLine.findUniqueOrThrow({
      where: { id: line.id },
      include: { comments: true, notes: true, meetingUpdates: true },
    })

    // Report-owned field refreshed...
    expect(Number(after.qtyRemaining)).toBe(12345)
    // ...user-authored content untouched.
    expect(after.comments.filter((c) => c.source === 'app')).toHaveLength(1)
    expect(after.notes).toHaveLength(1)
    expect(after.meetingUpdates).toHaveLength(1)
    expect(after.lineStatus).toBe('FILLED_AWAITING_PICKUP')
    expect(after.statusSource).toBe('manual')
    expect(after.statusOverrideReason).toBe('Confirmed ready on the floor')
    expect(after.ownerId).toBe('member_test')
  })
})

describe('runImport — the shortage tree', () => {
  it('lands 7 lines and 113 nodes with the hierarchy intact', async () => {
    const result = await runImport(prisma, adapter, load(AMBI))
    expect(result.created).toBe(7)
    expect(result.nodesWritten).toBe(113)

    const level1 = await prisma.oorShortageNode.count({
      where: { oorLine: { orgId: ORG_ID }, level: 1 },
    })
    const level2 = await prisma.oorShortageNode.count({
      where: { oorLine: { orgId: ORG_ID }, level: 2 },
    })
    expect(level1).toBe(33)
    expect(level2).toBe(80)

    const orphans = await prisma.oorShortageNode.count({
      where: { oorLine: { orgId: ORG_ID }, level: 2, parentNodeId: null },
    })
    expect(orphans).toBe(0)
  })

  it('derives a customer-approval status where a CP material is unresolved', async () => {
    const blocked = await prisma.oorLine.count({
      where: { orgId: ORG_ID, lineStatus: 'AWAITING_CUSTOMER_APPROVAL' },
    })
    expect(blocked).toBeGreaterThan(0)
  })

  it('carries a user-edited node forward but refreshes an untouched one', async () => {
    const edited = await prisma.oorShortageNode.findFirstOrThrow({
      where: { oorLine: { orgId: ORG_ID }, level: 2, mfgComment: null, etaDate: { not: null } },
    })
    const untouched = await prisma.oorShortageNode.findFirstOrThrow({
      where: { oorLine: { orgId: ORG_ID }, level: 2, id: { not: edited.id } },
    })

    await prisma.oorShortageNode.update({
      where: { id: edited.id },
      data: {
        qtyOnHand: 4321,
        shortageReason: 'MOQ_CONSTRAINT',
        etaDate: new Date('2026-12-25T00:00:00Z'),
        etaConfidence: 'confirmed',
        updatedById: 'member_test',
      },
    })
    const untouchedEtaBefore = untouched.etaDate

    // A second AMBI file: same report, different bytes.
    const wb = XLSX.read(fixture(AMBI), { cellNF: true })
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
    await runImport(prisma, adapter, load(AMBI, buffer))

    const after = await prisma.oorShortageNode.findFirstOrThrow({
      where: {
        oorLine: { orgId: ORG_ID },
        level: edited.level,
        jobNumber: edited.jobNumber,
        partNumber: edited.partNumber,
      },
    })
    expect(Number(after.qtyOnHand)).toBe(4321)
    expect(after.shortageReason).toBe('MOQ_CONSTRAINT')
    expect(after.etaConfidence).toBe('confirmed')
    expect(after.updatedById).toBe('member_test')

    const untouchedAfter = await prisma.oorShortageNode.findFirstOrThrow({
      where: {
        oorLine: { orgId: ORG_ID },
        level: untouched.level,
        jobNumber: untouched.jobNumber,
        partNumber: untouched.partNumber,
      },
    })
    expect(untouchedAfter.qtyOnHand).toBeNull()
    expect(untouchedAfter.updatedById).toBeNull()
    expect(untouchedAfter.etaDate?.toISOString() ?? null).toBe(untouchedEtaBefore?.toISOString() ?? null)
  })
})
