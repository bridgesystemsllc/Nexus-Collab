// ─── Export ─────────────────────────────────────────────────
// Regenerates both reports as .xlsx with layout parity to the files people
// already forward to the contract manufacturer: same title row and merge,
// header on row 2, same column order and labels, Arial 10, the same number
// formats, autofilter on the header, frozen header, and the source column
// widths (measured from the fixtures: Mfg Comment 94.29, Description 56.71,
// level description 128.43).
//
// Parity is the whole point. The CM opens this in Excel and has to recognise
// it, not adapt to it. Anything the app adds — a Status column, an appendix of
// the conversation — is opt-in and off by default, so the default download
// stays drop-in compatible.
//
// Export must also round-trip: exporting and re-importing changes nothing. That
// is why dirty source values are replayed verbatim rather than cleaned up. The
// quantity cell holding two numbers goes back out holding two numbers, and the
// mistyped currency goes back out mistyped — the export is a faithful copy of
// the report, not an improved one.

import ExcelJS from 'exceljs'
import type { PrismaClient, Prisma } from '@prisma/client'
import { OOR_STATUS_META, type OorLineStatus } from '@nexus/shared'

export interface ExportOptions {
  orgId: string
  brandId?: string | null
  customerPoNumber?: string | null
  cmCode?: string | null
  reportType: 'customer_open_order' | 'open_order_shortage'
  includeStatus?: boolean
  includeAppendix?: boolean
}

const FONT = { name: 'Arial', size: 10 } as const

// Excel stores a column width as (characters * 7 + 5) / 7 — the character count
// plus 0.71 of padding. exceljs writes whatever number it is handed straight
// into that stored field, so handing it the source's character width would make
// every column render 0.71 characters narrower than the file it is copying.
// Adding the padding back is what makes the exported columns the same width on
// screen as the ones people are used to.
const WIDTH_PADDING = 0.71
const excelWidth = (sourceWidth: number) => sourceWidth + WIDTH_PADDING

const CURRENCY_FMT = '"$"#,##0.00'
const QTY_FMT = '#,##0'
const QTY_NEED_FMT = '#,##0.0;\\(#,##0.0\\)'
const DATE_FMT = 'm/d/yy'

const num = (v: Prisma.Decimal | null): number | null => (v === null ? null : Number(v))

/** Replays whatever the source cell held when we could not read it, so a
 *  re-import produces the same warnings rather than silently different data. */
function rawOr<T>(rawRow: unknown, label: string, parsed: T | null): T | string | null {
  if (parsed !== null) return parsed
  const raw = (rawRow as Record<string, unknown> | null)?.[label]
  return raw === undefined || raw === null || raw === '' ? null : String(raw)
}

function styleHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { ...FONT, bold: true }
    cell.alignment = { vertical: 'bottom', wrapText: false }
  })
}

// ─── Format A: Customer Open Order Report ────────────────────

const FORMAT_A_COLUMNS: { header: string; width: number }[] = [
  { header: 'Customer PO Number', width: 22.14 },
  { header: 'Order', width: 15 },
  { header: 'Item#', width: 10.86 },
  { header: 'Description', width: 37.43 },
  { header: 'Qtys', width: 9.29 },
  { header: 'RemQty', width: 9.29 },
  { header: 'Price', width: 9.29 },
  { header: 'Value', width: 11 },
  { header: 'OrdDt', width: 9.29 },
  { header: 'ShipDt', width: 9.29 },
  { header: 'Orig Date', width: 9.29 },
  { header: 'Req.Del', width: 9.29 },
  { header: 'WO', width: 15.29 },
  { header: 'Comments', width: 80.14 },
]

async function buildCustomerOpenOrderSheet(
  wb: ExcelJS.Workbook,
  lines: LineWithRelations[],
  options: ExportOptions,
): Promise<void> {
  const sheet = wb.addWorksheet('Sheet1')
  const columns = [...FORMAT_A_COLUMNS]
  if (options.includeStatus) columns.push({ header: 'Status', width: 24 })

  sheet.columns = columns.map((c) => ({ width: excelWidth(c.width) }))

  // The banner the source carries above the grid.
  const banner = sheet.getRow(1)
  banner.getCell(1).value = 'Customer:'
  banner.getCell(2).value = lines[0]?.brandId ?? ''
  banner.eachCell((cell) => (cell.font = { ...FONT, bold: true }))

  const header = sheet.getRow(2)
  columns.forEach((c, i) => (header.getCell(i + 1).value = c.header))
  styleHeaderRow(header)

  lines.forEach((line, index) => {
    const row = sheet.getRow(3 + index)
    const po = line.channelTag ? `${line.customerPoNumber ?? ''}>${line.channelTag}` : line.customerPoNumber

    row.getCell(1).value = po
    row.getCell(2).value = line.salesOrderNumber
    row.getCell(3).value = line.itemNumber
    row.getCell(4).value = line.description
    // The stacked-quantity cell goes back out stacked.
    row.getCell(5).value = line.qtyOrdered === null ? line.qtyOrderedRaw : num(line.qtyOrdered)
    row.getCell(6).value = num(line.qtyRemaining)
    row.getCell(7).value = num(line.unitPrice)
    // The report's own Value, mistakes and all — including the cell we could
    // not read, replayed as text.
    row.getCell(8).value = rawOr(line.rawRow, 'Value', num(line.valueSource))
    row.getCell(9).value = line.orderDate
    row.getCell(10).value = line.shipDate
    row.getCell(11).value = line.origRequiredDate
    row.getCell(12).value = line.requiredDeliveryDate
    row.getCell(13).value = line.workOrderNumber
    // Comments are rebuilt in the house convention, newest first, so the cell
    // reads the way the people still working out of Excel expect.
    row.getCell(14).value = renderCommentCell(line.comments)
    if (options.includeStatus) {
      row.getCell(15).value = OOR_STATUS_META[line.lineStatus as OorLineStatus]?.label ?? line.lineStatus
    }

    row.eachCell({ includeEmpty: true }, (cell) => (cell.font = FONT))
    row.getCell(5).numFmt = QTY_FMT
    row.getCell(6).numFmt = QTY_FMT
    row.getCell(7).numFmt = CURRENCY_FMT
    row.getCell(8).numFmt = CURRENCY_FMT
    for (const c of [9, 10, 11, 12]) row.getCell(c).numFmt = DATE_FMT
    row.getCell(14).alignment = { wrapText: false, vertical: 'top' }
  })

  sheet.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: columns.length } }
  sheet.views = [{ state: 'frozen', ySplit: 2 }]
}

/** `MM.DD.YYYY - text II`, newest first — the convention the source cell uses. */
function renderCommentCell(comments: { body: string; entryDate: Date | null; authorInitials: string | null }[]): string {
  return comments
    .filter((c) => c.body.trim() !== '')
    .map((c) => {
      const date = c.entryDate
        ? `${String(c.entryDate.getUTCMonth() + 1).padStart(2, '0')}.${String(c.entryDate.getUTCDate()).padStart(2, '0')}.${c.entryDate.getUTCFullYear()} - `
        : ''
      const initials = c.authorInitials ? ` ${c.authorInitials}` : ''
      return `${date}${c.body}${initials}`
    })
    .join('\n')
}

// ─── Format B: Open Order Shortage Report ────────────────────

const FORMAT_B_COLUMNS: { header: string; width: number }[] = [
  { header: 'PO', width: 9.57 },
  { header: 'Order Date', width: 10.14 },
  { header: "Orig Req'd Date", width: 14.71 },
  { header: 'PartNum', width: 8.29 },
  { header: 'Cust Part', width: 11.86 },
  { header: 'Description', width: 56.71 },
  { header: "Req'd Date", width: 10.14 },
  { header: 'Qty Due', width: 7.43 },
  { header: 'Unit Price', width: 9.14 },
  { header: 'Job Num', width: 9.43 },
  { header: 'Lvl1 Part', width: 8.29 },
  { header: 'Lvl2Part', width: 8.29 },
  { header: 'Description', width: 128.43 },
  { header: 'QTY Need', width: 9.29 },
  { header: 'UOM', width: 4.57 },
  { header: 'CP?', width: 4 },
  { header: 'Mfg Comment', width: 94.29 },
]

async function buildShortageSheet(
  wb: ExcelJS.Workbook,
  lines: LineWithRelations[],
  options: ExportOptions,
  label: string,
): Promise<void> {
  const sheet = wb.addWorksheet('CUstShortSSRS')
  const columns = [...FORMAT_B_COLUMNS]
  if (options.includeStatus) columns.push({ header: 'Status', width: 24 })

  sheet.columns = columns.map((c) => ({ width: excelWidth(c.width) }))

  const title = sheet.getRow(1)
  title.getCell(1).value = label
  title.getCell(1).font = { ...FONT, bold: true, size: 12 }
  sheet.mergeCells(1, 1, 1, 14)

  const header = sheet.getRow(2)
  columns.forEach((c, i) => (header.getCell(i + 1).value = c.header))
  styleHeaderRow(header)

  let rowIndex = 3
  for (const line of lines) {
    const row = sheet.getRow(rowIndex++)
    row.getCell(1).value = line.customerPoNumber
    row.getCell(2).value = line.orderDate
    row.getCell(3).value = line.origRequiredDate
    row.getCell(4).value = line.itemNumber
    row.getCell(5).value = line.custPartNumber
    row.getCell(6).value = line.description
    row.getCell(7).value = line.requiredDeliveryDate
    row.getCell(8).value = num(line.qtyRemaining)
    row.getCell(9).value = num(line.unitPrice)
    row.getCell(10).value = line.jobNumber
    if (options.includeStatus) {
      row.getCell(18).value = OOR_STATUS_META[line.lineStatus as OorLineStatus]?.label ?? line.lineStatus
    }
    row.eachCell({ includeEmpty: true }, (cell) => (cell.font = FONT))
    for (const c of [2, 3, 7]) row.getCell(c).numFmt = DATE_FMT
    row.getCell(8).numFmt = QTY_FMT
    row.getCell(9).numFmt = CURRENCY_FMT

    // Materials, in source order, depth carried by which column is populated —
    // exactly how the source encodes it, because that is what the importer on
    // the other end (ours or theirs) reads.
    const level1 = line.nodes.filter((n) => n.level === 1).sort((a, b) => a.sortIndex - b.sortIndex)
    for (const parent of level1) {
      rowIndex = writeNodeRow(sheet, rowIndex, parent, 11)
      const children = line.nodes
        .filter((n) => n.parentNodeId === parent.id)
        .sort((a, b) => a.sortIndex - b.sortIndex)
      for (const child of children) {
        rowIndex = writeNodeRow(sheet, rowIndex, child, 12)
      }
    }
  }

  sheet.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: columns.length } }
  sheet.views = [{ state: 'frozen', ySplit: 2 }]
}

function writeNodeRow(
  sheet: ExcelJS.Worksheet,
  rowIndex: number,
  node: NodeRow,
  partColumn: 11 | 12,
): number {
  const row = sheet.getRow(rowIndex)
  // The job number rides on level-1 rows, as it does in the source.
  if (partColumn === 11) row.getCell(10).value = node.jobNumber
  row.getCell(partColumn).value = node.partNumber
  row.getCell(13).value = node.description
  row.getCell(14).value = num(node.qtyNeeded)
  row.getCell(15).value = node.uom
  row.getCell(16).value = node.customerProvided ? 'Y' : null
  // An ETA read out of this column goes back into it, so a re-import recovers
  // the same date rather than losing it.
  row.getCell(17).value =
    node.mfgComment ?? (node.etaDate && node.etaConfidence === 'estimated' ? node.etaDate : null)

  row.eachCell({ includeEmpty: true }, (cell) => (cell.font = FONT))
  row.getCell(14).numFmt = QTY_NEED_FMT
  if (node.mfgComment === null && node.etaDate && node.etaConfidence === 'estimated') {
    row.getCell(17).numFmt = DATE_FMT
  }
  row.getCell(17).alignment = { wrapText: true, vertical: 'top' }
  row.getCell(13).alignment = { wrapText: false, vertical: 'top' }
  return rowIndex + 1
}

// ─── Appendix ────────────────────────────────────────────────

function buildAppendix(wb: ExcelJS.Workbook, lines: LineWithRelations[]): void {
  const sheet = wb.addWorksheet('Collaboration')
  sheet.columns = [20, 14, 14, 12, 12, 90].map((w) => ({ width: excelWidth(w) }))
  const header = sheet.getRow(1)
  ;['Customer PO', 'Order', 'Item#', 'Kind', 'Date', 'Entry'].forEach((h, i) => (header.getCell(i + 1).value = h))
  styleHeaderRow(header)

  let r = 2
  for (const line of lines) {
    const entries: { kind: string; at: Date | null; text: string }[] = [
      ...line.comments.map((c) => ({ kind: 'Comment', at: c.entryDate ?? c.createdAt, text: c.body })),
      ...line.notes.map((n) => ({ kind: 'Note', at: n.createdAt, text: `${n.title}: ${n.body}` })),
      ...line.meetingUpdates.map((m) => ({
        kind: 'Meeting',
        at: m.meetingDate,
        text: [m.meetingTitle, m.decision, m.nextAction ? `Next: ${m.nextAction}` : null].filter(Boolean).join(' — '),
      })),
    ]
    for (const entry of entries) {
      const row = sheet.getRow(r++)
      row.getCell(1).value = line.customerPoNumber
      row.getCell(2).value = line.salesOrderNumber
      row.getCell(3).value = line.itemNumber
      row.getCell(4).value = entry.kind
      row.getCell(5).value = entry.at
      row.getCell(6).value = entry.text
      row.eachCell({ includeEmpty: true }, (cell) => (cell.font = FONT))
      row.getCell(5).numFmt = DATE_FMT
      row.getCell(6).alignment = { wrapText: true, vertical: 'top' }
    }
  }
}

// ─── Entry point ─────────────────────────────────────────────

interface NodeRow {
  id: string
  parentNodeId: string | null
  level: number
  jobNumber: string | null
  partNumber: string | null
  description: string | null
  qtyNeeded: Prisma.Decimal | null
  uom: string | null
  customerProvided: boolean
  mfgComment: string | null
  etaDate: Date | null
  etaConfidence: string
  sortIndex: number
}

interface LineWithRelations {
  productionOrderItemId: string | null
  brandId: string | null
  customerPoNumber: string | null
  channelTag: string | null
  salesOrderNumber: string | null
  itemNumber: string | null
  custPartNumber: string | null
  description: string | null
  qtyOrdered: Prisma.Decimal | null
  qtyOrderedRaw: string | null
  qtyRemaining: Prisma.Decimal | null
  unitPrice: Prisma.Decimal | null
  valueSource: Prisma.Decimal | null
  orderDate: Date | null
  shipDate: Date | null
  origRequiredDate: Date | null
  requiredDeliveryDate: Date | null
  workOrderNumber: string | null
  jobNumber: string | null
  lineStatus: string
  rawRow: unknown
  nodes: NodeRow[]
  comments: { body: string; entryDate: Date | null; authorInitials: string | null; createdAt: Date }[]
  notes: { title: string; body: string; createdAt: Date }[]
  meetingUpdates: { meetingTitle: string | null; decision: string | null; nextAction: string | null; meetingDate: Date }[]
}

export async function buildExportWorkbook(
  prisma: PrismaClient,
  options: ExportOptions,
): Promise<{ buffer: Buffer; filename: string }> {
  const lines = (await prisma.oorLine.findMany({
    where: {
      orgId: options.orgId,
      ...(options.brandId ? { brandId: options.brandId } : {}),
      ...(options.customerPoNumber
        ? { customerPoNumber: { equals: options.customerPoNumber, mode: 'insensitive' as const } }
        : {}),
      ...(options.cmCode ? { cmCode: { equals: options.cmCode, mode: 'insensitive' as const } } : {}),
      isOpen: true,
    },
    orderBy: [{ customerPoNumber: 'asc' }, { salesOrderNumber: 'asc' }, { itemNumber: 'asc' }],
    include: {
      nodes: { orderBy: { sortIndex: 'asc' } },
      comments: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' } },
      notes: { where: { deletedAt: null } },
      meetingUpdates: { where: { deletedAt: null } },
    },
  })) as unknown as LineWithRelations[]

  // The two reports are two views of the same data, and a line only appears in
  // the view it can actually fill. The shortage report describes materials, so
  // a line with no tree has nothing to say in it. The customer report is one
  // row per open sales-order line, so a PO line carrying no sales order has
  // nothing to say in that one — and exporting it there would round-trip back
  // as a different kind of line, since the customer format has no column that
  // records a job.
  const scoped =
    options.reportType === 'open_order_shortage'
      ? lines.filter((l) => l.nodes.length > 0)
      : lines.filter((l) => l.salesOrderNumber !== null || l.productionOrderItemId !== null)

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Nexus'

  const stamp = new Date().toISOString().slice(0, 10)
  if (options.reportType === 'customer_open_order') {
    await buildCustomerOpenOrderSheet(wb, scoped, options)
  } else {
    await buildShortageSheet(wb, scoped, options, `Open Order Shortage Report ${stamp}`)
  }

  if (options.includeAppendix) buildAppendix(wb, scoped)

  const buffer = (await wb.xlsx.writeBuffer()) as unknown as Buffer
  const name =
    options.reportType === 'customer_open_order'
      ? `Customer_Open_Order_Report_${stamp}.xlsx`
      : `Open_Order_Shortage_Report_${stamp}.xlsx`
  return { buffer: Buffer.from(buffer), filename: name }
}
