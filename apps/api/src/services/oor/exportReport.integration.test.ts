// Needs a live database — run with `pnpm --filter @nexus/api test:integration`.
// Named *.integration.test.ts so the default `pnpm test` (and CI, which has no
// Postgres) skips it. The round-trip guarantee is export -> re-import -> compare
// every stored field, which only means something against real rows.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import * as XLSX from 'xlsx'
import { PrismaClient } from '@prisma/client'
import { runImport } from './importRun'
import { ExcelSourceAdapter } from './excel/excelSourceAdapter'
import { buildExportWorkbook } from './exportReport'

const prisma = new PrismaClient()
const adapter = new ExcelSourceAdapter()

const ORG = 'test_org_oor_export'
const ORG_RT = 'test_org_oor_roundtrip'
const BRAND = 'test_brand_oor_export'

const ACNE = 'Acne_Free_Open_Order_Report_Week_of_08_17_2026.xls'
const AMBI = 'AMBI_Open_Order_Shortage_Report_08_24_26.xlsx'
const fixture = (n: string) => fs.readFileSync(path.resolve(process.cwd(), '../../fixtures/oor', n))

const load = (orgId: string, name: string, buffer?: Buffer) => ({
  buffer: buffer ?? fixture(name),
  filename: name,
  orgId,
  brandId: BRAND,
  importedById: null,
  now: new Date('2026-08-30T00:00:00Z'),
})

async function wipe(orgId: string) {
  const lines = await prisma.oorLine.findMany({ where: { orgId }, select: { id: true } })
  const ids = lines.map((l) => l.id)
  if (ids.length) {
    await prisma.oorComment.deleteMany({ where: { oorLineId: { in: ids } } })
    await prisma.oorNote.deleteMany({ where: { oorLineId: { in: ids } } })
    await prisma.oorMeetingUpdate.deleteMany({ where: { oorLineId: { in: ids } } })
    await prisma.oorShortageNode.deleteMany({ where: { oorLineId: { in: ids } } })
  }
  await prisma.oorLine.deleteMany({ where: { orgId } })
  await prisma.oorReportRun.deleteMany({ where: { orgId } })
}

beforeAll(async () => {
  await wipe(ORG)
  await wipe(ORG_RT)
  await runImport(prisma, adapter, load(ORG, ACNE))
  await runImport(prisma, adapter, load(ORG, AMBI))
})

afterAll(async () => {
  await wipe(ORG)
  await wipe(ORG_RT)
  await prisma.$disconnect()
})

const sheetOf = (buffer: Buffer, name?: string) => {
  const wb = XLSX.read(buffer, { cellNF: true, cellStyles: true })
  return { wb, ws: wb.Sheets[name ?? wb.SheetNames[0]]! }
}

describe('export — Format A layout parity', () => {
  it('puts the banner on row 1 and the source headers on row 2, in order', async () => {
    const { buffer } = await buildExportWorkbook(prisma, { orgId: ORG, reportType: 'customer_open_order' })
    const { ws } = sheetOf(buffer)
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, blankrows: false })
    expect(rows[0]![0]).toBe('Customer:')
    expect(rows[1]).toEqual([
      'Customer PO Number', 'Order', 'Item#', 'Description', 'Qtys', 'RemQty', 'Price', 'Value',
      'OrdDt', 'ShipDt', 'Orig Date', 'Req.Del', 'WO', 'Comments',
    ])
  })

  it('freezes the header and filters on it, like the file people already use', async () => {
    const { buffer } = await buildExportWorkbook(prisma, { orgId: ORG, reportType: 'customer_open_order' })
    const { ws } = sheetOf(buffer)
    expect(ws['!autofilter']).toBeDefined()
    expect(ws['!autofilter']!.ref).toMatch(/^A2:/)
  })

  it('carries the source column widths', async () => {
    const { buffer } = await buildExportWorkbook(prisma, { orgId: ORG, reportType: 'customer_open_order' })
    const { ws } = sheetOf(buffer)
    // Widths are asserted to the nearest character against the numbers measured
    // off the fixture. exceljs rounds the stored width, so exact equality is not
    // achievable through a write/read cycle — but a third of a character is
    // invisible on screen, which is what parity actually means here.
    const widths = (ws['!cols'] ?? []).map((c) => (c?.wch ?? 0) as number)
    expect(widths[0]).toBeCloseTo(22.14, 0)  // Customer PO Number
    expect(widths[3]).toBeCloseTo(37.43, 0)  // Description
    expect(widths[13]).toBeCloseTo(80.14, 0) // Comments
  })

  it('omits the Status column by default so the file stays drop-in compatible', async () => {
    const plain = await buildExportWorkbook(prisma, { orgId: ORG, reportType: 'customer_open_order' })
    const withStatus = await buildExportWorkbook(prisma, { orgId: ORG, reportType: 'customer_open_order', includeStatus: true })
    const header = (b: Buffer) => XLSX.utils.sheet_to_json<unknown[]>(sheetOf(b).ws, { header: 1 })[1] as string[]
    expect(header(plain.buffer)).not.toContain('Status')
    expect(header(withStatus.buffer)).toContain('Status')
  })

  it('adds the collaboration appendix only when asked', async () => {
    const plain = await buildExportWorkbook(prisma, { orgId: ORG, reportType: 'customer_open_order' })
    const withAppendix = await buildExportWorkbook(prisma, { orgId: ORG, reportType: 'customer_open_order', includeAppendix: true })
    expect(sheetOf(plain.buffer).wb.SheetNames).not.toContain('Collaboration')
    expect(sheetOf(withAppendix.buffer).wb.SheetNames).toContain('Collaboration')
  })
})

describe('export — Format B layout parity', () => {
  it('merges the title and puts the 17 source headers on row 2', async () => {
    const { buffer } = await buildExportWorkbook(prisma, { orgId: ORG, reportType: 'open_order_shortage' })
    const { ws } = sheetOf(buffer, 'CUstShortSSRS')
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, blankrows: false })
    expect(String(rows[0]![0])).toContain('Open Order Shortage Report')
    expect(ws['!merges']?.length).toBeGreaterThan(0)
    expect(rows[1]).toEqual([
      'PO', 'Order Date', "Orig Req'd Date", 'PartNum', 'Cust Part', 'Description', "Req'd Date",
      'Qty Due', 'Unit Price', 'Job Num', 'Lvl1 Part', 'Lvl2Part', 'Description', 'QTY Need',
      'UOM', 'CP?', 'Mfg Comment',
    ])
  })

  it('carries the source widths for the wide columns', async () => {
    const { buffer } = await buildExportWorkbook(prisma, { orgId: ORG, reportType: 'open_order_shortage' })
    const { ws } = sheetOf(buffer, 'CUstShortSSRS')
    const widths = (ws['!cols'] ?? []).map((c) => (c?.wch ?? 0) as number)
    expect(widths[5]).toBeCloseTo(56.71, 0)   // Description
    expect(widths[12]).toBeCloseTo(128.43, 0) // level description
    expect(widths[16]).toBeCloseTo(94.29, 0)  // Mfg Comment
  })

  it('encodes depth by column, the way the source does', async () => {
    const { buffer } = await buildExportWorkbook(prisma, { orgId: ORG, reportType: 'open_order_shortage' })
    const { ws } = sheetOf(buffer, 'CUstShortSSRS')
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, blankrows: false }).slice(2)
    const nz = (v: unknown) => v !== undefined && v !== null && String(v).trim() !== ''
    expect(rows.filter((r) => nz(r[0]))).toHaveLength(7)
    expect(rows.filter((r) => !nz(r[0]) && nz(r[10]))).toHaveLength(33)
    expect(rows.filter((r) => !nz(r[0]) && !nz(r[10]) && nz(r[11]))).toHaveLength(80)
  })
})

describe('export — round trip', () => {
  it('re-imports the exported customer report with no net change', async () => {
    const { buffer, filename } = await buildExportWorkbook(prisma, { orgId: ORG, reportType: 'customer_open_order' })

    const before = await prisma.oorLine.findMany({
      where: { orgId: ORG, salesOrderNumber: { not: null } },
      orderBy: [{ customerPoNumber: 'asc' }, { salesOrderNumber: 'asc' }, { itemNumber: 'asc' }],
    })

    // Import into a clean org, so this compares the file's content rather than
    // an upsert onto rows that already hold the answer.
    await wipe(ORG_RT)
    const result = await runImport(prisma, adapter, load(ORG_RT, filename, buffer))
    expect(result.created).toBe(before.length)

    const after = await prisma.oorLine.findMany({
      where: { orgId: ORG_RT },
      orderBy: [{ customerPoNumber: 'asc' }, { salesOrderNumber: 'asc' }, { itemNumber: 'asc' }],
    })
    expect(after).toHaveLength(before.length)

    const shape = (l: (typeof before)[number]) => ({
      po: l.customerPoNumber,
      tag: l.channelTag,
      order: l.salesOrderNumber,
      item: l.itemNumber,
      description: l.description,
      qtyOrdered: l.qtyOrdered === null ? null : Number(l.qtyOrdered),
      qtyOrderedRaw: l.qtyOrderedRaw,
      qtyRemaining: Number(l.qtyRemaining),
      unitPrice: Number(l.unitPrice),
      valueSource: l.valueSource === null ? null : Number(l.valueSource),
      valueMismatch: l.valueMismatch,
      orderDate: l.orderDate?.toISOString() ?? null,
      shipDate: l.shipDate?.toISOString() ?? null,
      origRequiredDate: l.origRequiredDate?.toISOString() ?? null,
      requiredDeliveryDate: l.requiredDeliveryDate?.toISOString() ?? null,
      wo: l.workOrderNumber,
      fulfillmentType: l.fulfillmentType,
      lineStatus: l.lineStatus,
    })

    expect(after.map(shape)).toEqual(before.map(shape))
  })

  it('replays the dirty cells rather than cleaning them up', async () => {
    const dirtyQty = await prisma.oorLine.findFirst({
      where: { orgId: ORG_RT, qtyOrderedRaw: { contains: '50000+' } },
    })
    expect(dirtyQty).not.toBeNull()
    expect(dirtyQty!.qtyOrdered).toBeNull()

    // The mistyped currency survives as a mismatch rather than being silently
    // replaced with the recomputed figure.
    const mismatches = await prisma.oorLine.count({ where: { orgId: ORG_RT, valueMismatch: true } })
    expect(mismatches).toBe(10)
  })

  it('carries the comment thread out and back in the house format', async () => {
    const withComments = await prisma.oorLine.count({
      where: { orgId: ORG_RT, comments: { some: {} } },
    })
    expect(withComments).toBe(46)

    const sample = await prisma.oorComment.findFirst({
      where: { oorLine: { orgId: ORG_RT }, authorInitials: 'AD' },
    })
    expect(sample).not.toBeNull()
    expect(sample!.entryDate).not.toBeNull()
  })

  it('re-imports the exported shortage report with the tree intact', async () => {
    const { buffer, filename } = await buildExportWorkbook(prisma, { orgId: ORG, reportType: 'open_order_shortage' })
    await wipe(ORG_RT)
    const result = await runImport(prisma, adapter, load(ORG_RT, filename, buffer))

    expect(result.created).toBe(7)
    expect(result.nodesWritten).toBe(113)

    const level1 = await prisma.oorShortageNode.count({ where: { oorLine: { orgId: ORG_RT }, level: 1 } })
    const level2 = await prisma.oorShortageNode.count({ where: { oorLine: { orgId: ORG_RT }, level: 2 } })
    const orphans = await prisma.oorShortageNode.count({
      where: { oorLine: { orgId: ORG_RT }, level: 2, parentNodeId: null },
    })
    expect(level1).toBe(33)
    expect(level2).toBe(80)
    expect(orphans).toBe(0)

    const cp = await prisma.oorShortageNode.count({ where: { oorLine: { orgId: ORG_RT }, customerProvided: true } })
    expect(cp).toBe(7)

    const hotFill = await prisma.oorShortageNode.findFirst({
      where: { oorLine: { orgId: ORG_RT }, mfgComment: { contains: 'HOT FILL' } },
    })
    expect(hotFill?.mfgComment).toContain('\n')

    // The ETAs that live in the Mfg Comment column survive the trip.
    const withEta = await prisma.oorShortageNode.count({
      where: { oorLine: { orgId: ORG_RT }, etaDate: { not: null } },
    })
    expect(withEta).toBe(49)
  })
})
