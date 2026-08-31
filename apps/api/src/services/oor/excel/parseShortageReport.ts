// ─── Format B: Open Order Shortage Report ───────────────────
// An SSRS export with a three-level tree flattened into rows: a PO line, the
// job materials under it (bulk and components), and the raw materials under
// each bulk. Depth is encoded only by which column is populated, and the
// parent-child link exists nowhere except row order — so the walk below IS the
// hierarchy. Get it wrong and a raw material silently attaches to the wrong
// bulk, which reads as a plausible shortage against the wrong purchase order.

import * as XLSX from 'xlsx'
import type {
  MaterialClass,
  ParsedLine,
  ParsedNode,
  ParsedReport,
  ParseWarning,
} from '../sourceAdapter'
import { coerceCurrency, coerceDate, coerceNumber } from './cellCoercion'

const COLUMNS = {
  po: 'PO',
  orderDate: 'Order Date',
  origReqDate: "Orig Req'd Date",
  partNum: 'PartNum',
  custPart: 'Cust Part',
  reqDate: "Req'd Date",
  qtyDue: 'Qty Due',
  unitPrice: 'Unit Price',
  jobNum: 'Job Num',
  lvl1Part: 'Lvl1 Part',
  lvl2Part: 'Lvl2Part',
  qtyNeed: 'QTY Need',
  uom: 'UOM',
  cp: 'CP?',
  mfgComment: 'Mfg Comment',
} as const

// Both a PO line and a material carry a column literally called "Description",
// so they are resolved by position: the first occurrence describes the finished
// good, the second describes the material.
const DESCRIPTION = 'Description'

/**
 * Component types, longest first so "BACK LABEL" wins over "BACK".
 *
 * The type is not simply the second comma-separated segment: the source writes
 * `Components, x24, PAD, ...` (pack size first) and `Components, CP, BACK,
 * BACK LABEL ...` (customer-provided marker first). Scanning for a known type
 * anywhere in the description is the only reading that survives both.
 */
const COMPONENT_TYPES = [
  'FRONT LABEL',
  'BACK LABEL',
  'WRAP LABEL',
  'UNIT CARTON',
  'SHRINK WRAP',
  'DIVIDER',
  'SHIPPER',
  'BOTTLE',
  'CARTON',
  'LABEL',
  'PUMP',
  'TUBE',
  'CAP',
  'PAD',
]

/** Component types whose shortage is an artwork problem, not a supply problem. */
export const ARTWORK_COMPONENT_TYPES = new Set(['FRONT LABEL', 'BACK LABEL', 'WRAP LABEL', 'LABEL', 'UNIT CARTON'])

const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}
const nz = (v: unknown): boolean => str(v) !== null

export function classifyMaterial(description: unknown): {
  materialClass: MaterialClass
  componentType: string | null
} {
  const text = String(description ?? '').trim()
  const head = text.split(',')[0]?.trim().toUpperCase() ?? ''

  if (head === 'BULK') return { materialClass: 'BULK', componentType: null }
  if (head === 'RAW MATERIALS' || head === 'RAW MATERIAL') {
    return { materialClass: 'RAW_MATERIAL', componentType: null }
  }
  if (head === 'COMPONENTS' || head === 'COMPONENT') {
    const upper = text.toUpperCase()
    const found = COMPONENT_TYPES.find((t) => upper.includes(t)) ?? null
    return { materialClass: 'COMPONENT', componentType: found }
  }
  return { materialClass: 'OTHER', componentType: null }
}

/** `AMBI Open Order Shortage Report 8/24/26` → the date it was run. */
function asOfFromTitle(title: string | null): Date | null {
  if (!title) return null
  const m = title.match(/(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})/)
  if (!m) return null
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
  return new Date(Date.UTC(year, Number(m[1]) - 1, Number(m[2])))
}

export function parseShortageReport(sheet: XLSX.WorkSheet, filename: string): ParsedReport {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, blankrows: false })

  let headerRowIndex = -1
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const cells = (rows[r] ?? []).map((c) => String(c ?? '').trim().toLowerCase())
    if (cells.includes('lvl1 part') && cells.includes('qty need')) {
      headerRowIndex = r
      break
    }
  }
  if (headerRowIndex === -1) {
    throw new Error('Could not find the shortage report header row (expected "Lvl1 Part" and "QTY Need").')
  }

  const headerCells = (rows[headerRowIndex] ?? []).map((c) => String(c ?? '').trim())
  const index = new Map<string, number>()
  headerCells.forEach((label, i) => {
    if (label !== '' && label !== DESCRIPTION && !index.has(label)) index.set(label, i)
  })
  const descriptionColumns = headerCells
    .map((label, i) => (label === DESCRIPTION ? i : -1))
    .filter((i) => i !== -1)
  const lineDescriptionCol = descriptionColumns[0]
  const nodeDescriptionCol = descriptionColumns[1] ?? descriptionColumns[0]

  const title = str(rows[0]?.[0]) ?? filename
  const warnings: ParseWarning[] = []
  const lines: ParsedLine[] = []

  let currentLine: ParsedLine | null = null
  let currentLevel1: ParsedNode | null = null
  let jobNumberCarry: string | null = null

  const at = (row: unknown[], column: string): unknown => {
    const i = index.get(column)
    return i === undefined ? undefined : row[i]
  }

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r] ?? []
    const rowNumber = r + 1
    const ctx = (column: string) => ({ rowNumber, column })
    const collect = <T,>(c: { value: T | null; raw?: string | null; warning?: ParseWarning }) => {
      if (c.warning) warnings.push(c.warning)
      return c
    }

    const rawRow: Record<string, unknown> = {}
    for (const [label, i] of index) rawRow[label] = row[i] ?? null
    rawRow['Description'] = row[lineDescriptionCol] ?? null
    rawRow['Material Description'] = row[nodeDescriptionCol] ?? null

    const jobHere = str(at(row, COLUMNS.jobNum))
    if (jobHere) jobNumberCarry = jobHere

    // ── Level 0: a populated PO opens a new line ──
    if (nz(at(row, COLUMNS.po))) {
      const qtyDue = collect(coerceNumber(at(row, COLUMNS.qtyDue), ctx(COLUMNS.qtyDue)))
      const unitPrice = collect(coerceCurrency(at(row, COLUMNS.unitPrice), ctx(COLUMNS.unitPrice)))
      const qtyRemaining = qtyDue.value
      const valueComputed =
        qtyRemaining !== null && unitPrice.value !== null ? qtyRemaining * unitPrice.value : null

      currentLine = {
        customerPoNumber: str(at(row, COLUMNS.po)),
        channelTag: null,
        salesOrderNumber: null,
        itemNumber: str(at(row, COLUMNS.partNum)),
        custPartNumber: str(at(row, COLUMNS.custPart)),
        description: str(row[lineDescriptionCol]),
        qtyOrdered: qtyRemaining,
        qtyOrderedRaw: qtyDue.raw ?? null,
        qtyRemaining,
        unitPrice: unitPrice.value,
        valueSource: null,
        valueComputed,
        valueMismatch: false,
        orderDate: collect(coerceDate(at(row, COLUMNS.orderDate), ctx(COLUMNS.orderDate))).value,
        shipDate: null,
        origRequiredDate: collect(coerceDate(at(row, COLUMNS.origReqDate), ctx(COLUMNS.origReqDate))).value,
        requiredDeliveryDate: collect(coerceDate(at(row, COLUMNS.reqDate), ctx(COLUMNS.reqDate))).value,
        workOrderNumber: null,
        jobNumber: jobNumberCarry,
        // A shortage report only ever describes work a contract manufacturer is
        // running — the job number is the work order.
        fulfillmentType: 'CONTRACT_MFG',
        cmCode: null,
        jobStatus: null,
        comments: [],
        nodes: [],
        rawRow,
        externalIds: {},
      }
      lines.push(currentLine)
      currentLevel1 = null
      continue
    }

    const isLevel1 = nz(at(row, COLUMNS.lvl1Part))
    const isLevel2 = !isLevel1 && nz(at(row, COLUMNS.lvl2Part))
    if (!isLevel1 && !isLevel2) continue

    if (!currentLine) {
      warnings.push({
        rowNumber,
        column: isLevel1 ? COLUMNS.lvl1Part : COLUMNS.lvl2Part,
        rawValue: String(at(row, isLevel1 ? COLUMNS.lvl1Part : COLUMNS.lvl2Part) ?? ''),
        storedValue: null,
        reason: 'Material row appeared before any PO line and was skipped',
      })
      continue
    }

    const description = str(row[nodeDescriptionCol])
    const { materialClass, componentType } = classifyMaterial(description)
    const qtyNeeded = collect(coerceNumber(at(row, COLUMNS.qtyNeed), ctx(COLUMNS.qtyNeed)))

    // A bare date in Mfg Comment is the vendor's ETA, not a comment. It appears
    // in 49 of the fixture's cells — a convention, not type drift — so it is
    // read as an estimated ETA rather than stored as unreadable text.
    const commentCell = at(row, COLUMNS.mfgComment)
    const commentIsDate =
      typeof commentCell === 'number' ||
      (typeof commentCell === 'string' && /^\d+$/.test(commentCell.trim()))
    const eta = commentIsDate
      ? coerceDate(typeof commentCell === 'number' ? commentCell : Number(String(commentCell).trim()), ctx(COLUMNS.mfgComment))
      : { value: null as Date | null }
    const mfgComment =
      commentIsDate || commentCell === undefined || commentCell === null
        ? null
        : String(commentCell).replace(/\r\n/g, '\n').replace(/\r/g, '\n') || null

    const node: ParsedNode = {
      level: isLevel1 ? 1 : 2,
      sortIndex: r,
      jobNumber: jobNumberCarry,
      partNumber: str(at(row, isLevel1 ? COLUMNS.lvl1Part : COLUMNS.lvl2Part)),
      description,
      materialClass,
      componentType,
      qtyNeeded: qtyNeeded.value,
      uom: str(at(row, COLUMNS.uom)),
      customerProvided: String(at(row, COLUMNS.cp) ?? '').trim().toUpperCase() === 'Y',
      mfgComment,
      etaDate: eta.value,
      etaConfidence: eta.value ? 'estimated' : 'unknown',
      children: [],
      rawRow,
    }

    if (isLevel1) {
      currentLine.nodes.push(node)
      currentLevel1 = node
    } else if (currentLevel1) {
      currentLevel1.children.push(node)
    } else {
      // A raw material with no bulk above it: keep it rather than drop it, and
      // say so, since the operator needs to know the tree was malformed.
      currentLine.nodes.push({ ...node, level: 1 })
      warnings.push({
        rowNumber,
        column: COLUMNS.lvl2Part,
        rawValue: String(at(row, COLUMNS.lvl2Part) ?? ''),
        storedValue: 'attached to the PO line',
        reason: 'Raw material row had no bulk parent above it',
      })
    }
  }

  return {
    reportType: 'open_order_shortage',
    reportLabel: title,
    asOfDate: asOfFromTitle(title),
    lines,
    warnings,
  }
}
