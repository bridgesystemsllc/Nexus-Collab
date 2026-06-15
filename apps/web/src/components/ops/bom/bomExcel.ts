// Byte-accurate ExcelJS export for the Bill of Materials module.
//
// Reproduces the canonical KarEve / Carol's Daughter BOM spreadsheet layout
// exactly: one worksheet per BOM, fixed column widths / row heights, the
// black header band, the blue filler name, the dynamically positioned
// yellow over/under tolerance footer + gray launch-priority box.
//
// Consumes `Bom` objects (see ./bomTypes). All colors are literal ARGB
// strings (never theme indices) so fidelity does not depend on a theme.

import ExcelJS from 'exceljs'
import type { Bom } from './bomTypes'
import { bomShortName } from './bomTypes'

// ─── Literal ARGB palette ───────────────────────────────────────────────
const WHITE = 'FFFFFFFF'
const BLACK = 'FF000000'
const ACCENT_BLUE = 'FF4472C4'
const ROW_GRAY = 'FFF2F2F2'
const PRIORITY_GRAY = 'FFD9D9D9'
const YELLOW = 'FFFFFF00'

const FONT = 'Calibri'

type Fill = ExcelJS.Fill
const solid = (argb: string): Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })

const THIN: Partial<ExcelJS.Border> = { style: 'thin' }
const MEDIUM: Partial<ExcelJS.Border> = { style: 'medium' }

/**
 * Sheet name `BOM-<ShortName>`, sanitized for Excel: strip the illegal
 * characters : \ / ? * [ ] and cap at 31 chars. De-duplication on collision
 * is handled inside buildBomWorkbook.
 */
export function bomSheetName(bom: Bom): string {
  const raw = `BOM-${bomShortName(bom)}`
  // Excel forbids : \ / ? * [ ]
  const cleaned = raw.replace(/[:\\/?*[\]]/g, '')
  return cleaned.slice(0, 31)
}

/** Build a multi-sheet workbook, one worksheet per BOM. */
export async function buildBomWorkbook(boms: Bom[]): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Nexus Collab'
  wb.created = new Date()

  const usedNames = new Set<string>()

  for (const bom of boms) {
    // De-dupe sheet name on collision by appending -2, -3, … keeping <=31.
    let name = bomSheetName(bom)
    if (usedNames.has(name)) {
      let n = 2
      let candidate: string
      do {
        const suffix = `-${n}`
        candidate = name.slice(0, 31 - suffix.length) + suffix
        n += 1
      } while (usedNames.has(candidate))
      name = candidate
    }
    usedNames.add(name)

    const ws = wb.addWorksheet(name)
    writeBomSheet(ws, bom)
  }

  return wb
}

function writeBomSheet(ws: ExcelJS.Worksheet, bom: Bom): void {
  // ─── Geometry: column widths ──────────────────────────────────────────
  ws.columns = [
    { width: 21.6 }, // A
    { width: 69.6 }, // B
    { width: 10.1 }, // C
    { width: 19.3 }, // D
  ]

  const lines = bom.lines
  const N = lines.length
  const firstComponentRow = 9
  const lastComponentRow = firstComponentRow + N - 1 // rows 9..(8+N)
  const footerLabelRow = lastComponentRow + 2
  const footerValueRow = footerLabelRow + 1

  // ─── Row heights ──────────────────────────────────────────────────────
  ws.getRow(1).height = 23.4
  ws.getRow(2).height = 18
  ws.getRow(3).height = 15.6
  ws.getRow(4).height = 15.6
  ws.getRow(5).height = 18
  ws.getRow(6).height = 18
  ws.getRow(7).height = 18.6
  ws.getRow(8).height = 15.6
  for (let r = firstComponentRow; r <= lastComponentRow; r++) ws.getRow(r).height = 15.6
  ws.getRow(footerLabelRow).height = 28.9

  const setCell = (
    addr: string,
    value: ExcelJS.CellValue,
    opts: {
      size?: number
      bold?: boolean
      italic?: boolean
      color?: string
      h?: 'left' | 'center' | 'right'
      v?: 'top' | 'middle' | 'bottom'
      wrap?: boolean
      fill?: string
      border?: Partial<ExcelJS.Borders>
    } = {},
  ): ExcelJS.Cell => {
    const cell = ws.getCell(addr)
    cell.value = value
    cell.font = {
      name: FONT,
      size: opts.size ?? 12,
      bold: opts.bold ?? false,
      italic: opts.italic ?? false,
      ...(opts.color ? { color: { argb: opts.color } } : {}),
    }
    cell.alignment = {
      horizontal: opts.h ?? 'left',
      vertical: opts.v ?? 'top',
      ...(opts.wrap ? { wrapText: true } : {}),
    }
    if (opts.fill) cell.fill = solid(opts.fill)
    if (opts.border) cell.border = opts.border
    return cell
  }

  // ─── A1 title ─────────────────────────────────────────────────────────
  setCell('A1', 'BILL OF MATERIALS', { size: 14, bold: true, h: 'left', v: 'middle' })

  // A2 blank spacer (leave empty)

  // ─── Row 3 finished-good header labels ────────────────────────────────
  setCell('A3', 'FINISHED GOOD', { size: 12, bold: true, h: 'center', v: 'top' })
  setCell('B3', 'PRODUCT NAME', { size: 12, bold: true, h: 'center', v: 'top' })
  setCell('C3', 'Fill Claim', { size: 12, bold: true, h: 'center', v: 'top' })
  setCell('D3', 'Min Fill', { size: 12, bold: true, h: 'center', v: 'top' })

  // ─── Row 4 finished-good values ───────────────────────────────────────
  setCell('A4', bom.fgPartNumber, { size: 12, h: 'left', v: 'top' })
  setCell('B4', bom.productName, { size: 12, h: 'left', v: 'top', wrap: true, fill: WHITE })
  setCell('C4', bom.fillClaim, { size: 12, h: 'left', v: 'top' })
  setCell('D4', bom.minFill, { size: 12, h: 'left', v: 'top' })

  // ─── Row 5 filler header + filler name ────────────────────────────────
  setCell('A5', 'FILLER(S)', { size: 12, bold: true, h: 'center', v: 'top' })
  setCell('B5', bom.fillerName, {
    size: 14,
    bold: true,
    color: ACCENT_BLUE,
    h: 'center',
    v: 'top',
    wrap: true,
    fill: WHITE,
  })
  setCell('C5', 'Case Qty', { size: 12, bold: true, h: 'center', v: 'top' })
  setCell('D5', 'Inner', { size: 12, bold: true, h: 'center', v: 'top' })

  // ─── Row 6 filler supplier + case qty / inner pack ────────────────────
  setCell('A6', bom.fillerSupplier, { size: 12, h: 'left', v: 'top' })
  // caseQty may be null → render blank, never 0.
  setCell('C6', bom.caseQty == null ? null : bom.caseQty, { size: 12, h: 'left', v: 'top' })
  setCell('D6', bom.innerPack, { size: 12, h: 'left', v: 'top' })

  // A7 blank spacer (leave empty)

  // ─── Row 8 header band (black fill, white bold text) ──────────────────
  const headerLabels: Array<[string, string]> = [
    ['A8', 'Part Number'],
    ['B8', 'Item Description '], // KEEP trailing space verbatim
    ['C8', 'UM'],
    ['D8', 'Supplier'],
  ]
  for (const [addr, label] of headerLabels) {
    const isFirst = addr === 'A8'
    setCell(addr, label, {
      size: 12,
      bold: true,
      color: WHITE,
      h: 'left',
      v: 'middle',
      wrap: true,
      fill: BLACK,
      border: {
        top: MEDIUM,
        ...(isFirst ? { left: MEDIUM } : {}),
      },
    })
  }

  // ─── Component rows (light-gray, thin bordered grid) ──────────────────
  for (let i = 0; i < N; i++) {
    const ln = lines[i]
    const r = firstComponentRow + i

    // A: left + right + bottom thin
    setCell(`A${r}`, ln.partNumber, {
      size: 12,
      h: 'left',
      v: 'top',
      fill: ROW_GRAY,
      border: { left: THIN, right: THIN, bottom: THIN },
    })
    // B: right + bottom thin, wrapped description
    setCell(`B${r}`, ln.description, {
      size: 12,
      h: 'left',
      v: 'top',
      wrap: true,
      fill: ROW_GRAY,
      border: { right: THIN, bottom: THIN },
    })
    // C: full thin box. Preserve "-" verbatim — never coerce to 0.
    setCell(`C${r}`, ln.um, {
      size: 12,
      h: 'left',
      v: 'top',
      fill: ROW_GRAY,
      border: { top: THIN, left: THIN, right: THIN, bottom: THIN },
    })
    // D: full thin box
    setCell(`D${r}`, ln.supplier, {
      size: 12,
      h: 'left',
      v: 'top',
      fill: ROW_GRAY,
      border: { top: THIN, left: THIN, right: THIN, bottom: THIN },
    })
  }

  // One blank row after the last component is lastComponentRow + 1 (untouched).

  // ─── Footer label row (dynamic) ───────────────────────────────────────
  setCell(`A${footerLabelRow}`, 'OVER/UNDER RUN TOLERANCE :', {
    size: 11,
    bold: true,
    h: 'left',
    v: 'top',
    wrap: true,
    fill: YELLOW,
  })
  // Merge C:D for the priority box label.
  ws.mergeCells(`C${footerLabelRow}:D${footerLabelRow}`)
  setCell(`C${footerLabelRow}`, 'Launch Priority (based on pack arrival)', {
    size: 12,
    h: 'center',
    v: 'top',
    wrap: true,
    fill: PRIORITY_GRAY,
  })

  // ─── Footer value row (dynamic) ───────────────────────────────────────
  setCell(`A${footerValueRow}`, bom.overUnderTolerance, {
    size: 9,
    italic: true,
    color: BLACK,
    h: 'left',
    v: 'top',
  })
  // launchPriority may be null → blank, never 0.
  setCell(`D${footerValueRow}`, bom.launchPriority == null ? null : bom.launchPriority, {
    size: 11,
    h: 'left',
    v: 'top',
  })
}

/** Mirror generateBriefPDF.ts filename sanitization. */
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_')
}

function dateStamp(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

/**
 * Build the workbook, write it to a Blob, and trigger a browser download.
 * Default filename:
 *   - multi:  ACT-KarEve_CD-Multi_BOM-<YYYYMMDD>.xlsx
 *   - single: ACT-KarEve_CD-<ShortName>_BOM-<YYYYMMDD>.xlsx
 */
export async function exportBomsXlsx(boms: Bom[], filename?: string): Promise<void> {
  const wb = await buildBomWorkbook(boms)
  const buffer = await wb.xlsx.writeBuffer()

  const stamp = dateStamp()
  let outName = filename
  if (!outName) {
    if (boms.length === 1) {
      outName = `ACT-KarEve_CD-${sanitizeFilename(bomShortName(boms[0]))}_BOM-${stamp}.xlsx`
    } else {
      outName = `ACT-KarEve_CD-Multi_BOM-${stamp}.xlsx`
    }
  }

  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = outName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
