// Costing report exports for the Finance hub.
//
// Two entry points, both fed the live finance aggregation payloads:
//   - exportCostingXlsx → multi-sheet ExcelJS workbook (Product Costs, Component
//     Costs, MOQ Costs, Cost Analysis). Models on ops/bom/bomExcel.ts.
//   - exportCostingPdf  → jsPDF + autotable product-cost summary. Models on
//     utils/generateBriefPDF.ts.
//
// All numeric cells are null-safe: blank cells render empty (never NaN/0).

import ExcelJS from 'exceljs'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { dateStamp, toNum } from './financeFormat'

export interface FinanceReportData {
  productCosts: any[]
  componentCosts: any[]
  moqCosts: any[]
  costAnalysis: any[]
}

const FONT = 'Calibri'
const HEADER_FILL = 'FF1A1A1A'
const HEADER_TEXT = 'FFFFFFFF'

// Round a numeric cell to N decimals, or null when not a finite number, so the
// cell is genuinely blank rather than 0 or NaN.
function cellNum(value: unknown, digits = 4): number | null {
  const n = toNum(value)
  if (n == null) return null
  return Number(n.toFixed(digits))
}

function styleHeaderRow(ws: ExcelJS.Worksheet): void {
  const header = ws.getRow(1)
  header.font = { name: FONT, size: 11, bold: true, color: { argb: HEADER_TEXT } }
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
  header.alignment = { vertical: 'middle' }
  header.height = 20
}

function buildWorkbook(data: FinanceReportData): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Nexus Collab'
  wb.created = new Date()

  // ─── Product Costs ────────────────────────────────────────
  const ws1 = wb.addWorksheet('Product Costs')
  ws1.columns = [
    { header: 'SKU', key: 'sku', width: 14 },
    { header: 'Product', key: 'product', width: 34 },
    { header: 'Brand', key: 'brand', width: 18 },
    { header: 'Component', key: 'component', width: 12 },
    { header: 'Bulk', key: 'bulk', width: 12 },
    { header: 'Label', key: 'label', width: 12 },
    { header: 'Freight', key: 'freight', width: 12 },
    { header: 'Overhead', key: 'overhead', width: 12 },
    { header: 'Rolled COGS', key: 'rolled', width: 13 },
    { header: 'COGS', key: 'cogs', width: 12 },
    { header: 'Retail', key: 'retail', width: 12 },
    { header: 'Margin %', key: 'margin', width: 11 },
    { header: 'vs Target', key: 'vs', width: 11 },
    { header: 'Incomplete', key: 'incomplete', width: 11 },
  ]
  for (const r of data.productCosts || []) {
    ws1.addRow({
      sku: r.fgPartNumber || '',
      product: r.productName || '',
      brand: r.brand || '',
      component: cellNum(r.componentCost),
      bulk: cellNum(r.bulkCost),
      label: cellNum(r.labelCost),
      freight: cellNum(r.freightPerUnit),
      overhead: cellNum(r.overheadPerUnit),
      rolled: cellNum(r.rolledCogs),
      cogs: cellNum(r.cogs),
      retail: cellNum(r.retail, 2),
      margin: cellNum(r.marginPct, 2),
      vs: cellNum(r.marginVsTarget, 2),
      incomplete: r.incomplete ? 'YES' : '',
    })
  }
  styleHeaderRow(ws1)

  // ─── Component Costs ──────────────────────────────────────
  const ws2 = wb.addWorksheet('Component Costs')
  ws2.columns = [
    { header: 'Part #', key: 'part', width: 16 },
    { header: 'Name', key: 'name', width: 40 },
    { header: 'Type', key: 'type', width: 16 },
    { header: 'Vendor', key: 'vendor', width: 22 },
    { header: 'Target Cost', key: 'target', width: 13 },
    { header: 'Best Landed Unit', key: 'landed', width: 16 },
    { header: 'MOQ Tiers', key: 'tiers', width: 11 },
  ]
  for (const r of data.componentCosts || []) {
    ws2.addRow({
      part: r.partNumber || '',
      name: r.name || '',
      type: r.type || '',
      vendor: r.vendor || '',
      target: cellNum(r.targetCostPerUnit),
      landed: cellNum(r.bestLandedUnitCost),
      tiers: cellNum(r.moqTierCount, 0),
    })
  }
  styleHeaderRow(ws2)

  // ─── MOQ Costs ────────────────────────────────────────────
  const ws3 = wb.addWorksheet('MOQ Costs')
  ws3.columns = [
    { header: 'Part #', key: 'part', width: 16 },
    { header: 'Name', key: 'name', width: 40 },
    { header: 'MOQ Qty', key: 'moq', width: 12 },
    { header: 'Unit Cost', key: 'unit', width: 12 },
    { header: 'Tooling', key: 'tooling', width: 12 },
    { header: 'Shipping/unit', key: 'shipping', width: 13 },
    { header: 'Duty %', key: 'duty', width: 10 },
    { header: 'Landed Unit', key: 'landed', width: 13 },
    { header: 'Quote Ref', key: 'quote', width: 20 },
  ]
  const sortedMoq = [...(data.moqCosts || [])].sort((a, b) => {
    const pa = (a.partNumber || '').localeCompare(b.partNumber || '')
    if (pa !== 0) return pa
    return (a.moqQuantity ?? 0) - (b.moqQuantity ?? 0)
  })
  for (const r of sortedMoq) {
    ws3.addRow({
      part: r.partNumber || '',
      name: r.name || '',
      moq: cellNum(r.moqQuantity, 0),
      unit: cellNum(r.unitCost),
      tooling: cellNum(r.toolingCost, 2),
      shipping: cellNum(r.shippingCostPerUnit),
      duty: cellNum(r.dutyRatePct, 2),
      landed: cellNum(r.landedUnitCost),
      quote: r.quoteReference || '',
    })
  }
  styleHeaderRow(ws3)

  // ─── Cost Analysis ────────────────────────────────────────
  const ws4 = wb.addWorksheet('Cost Analysis')
  ws4.columns = [
    { header: 'Product', key: 'product', width: 34 },
    { header: 'Cost / kg', key: 'cost', width: 12 },
    { header: 'Top Drivers', key: 'drivers', width: 60 },
  ]
  for (const r of data.costAnalysis || []) {
    const drivers = (r.topDrivers || [])
      .map((d: any) => {
        const c = cellNum(d.costContribution)
        return `${d.inciName || d.phase || '—'}${c != null ? ` ($${c})` : ''}`
      })
      .join(', ')
    ws4.addRow({
      product: r.productName || '',
      cost: cellNum(r.totalCostPerKg, 2),
      drivers,
    })
  }
  styleHeaderRow(ws4)

  return wb
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Multi-sheet ExcelJS costing workbook → browser download. */
export async function exportCostingXlsx(data: FinanceReportData): Promise<void> {
  const wb = buildWorkbook(data)
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  triggerDownload(blob, `KarEve_CostingReport_${dateStamp()}.xlsx`)
}

const fmtCell = (v: unknown, digits = 4, prefix = '$') => {
  const n = toNum(v)
  if (n == null) return '—'
  return `${prefix}${n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
}

/** Product-cost summary PDF (jsPDF + autotable) → browser download. */
export function exportCostingPdf(data: FinanceReportData): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 14
  let y = margin

  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(26, 26, 26)
  doc.text('KarEve — Costing Report', margin, y)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(120, 119, 116)
  const dateText = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  doc.text(dateText, pageWidth - margin - doc.getTextWidth(dateText), y)
  y += 8

  const tableStyle = {
    headStyles: {
      fillColor: [26, 26, 26] as [number, number, number],
      textColor: [255, 255, 255] as [number, number, number],
      fontStyle: 'bold' as const,
      fontSize: 8,
      cellPadding: 2.5,
    },
    bodyStyles: {
      textColor: [55, 53, 47] as [number, number, number],
      fontSize: 8,
      cellPadding: 2.2,
    },
    styles: { lineColor: [204, 204, 204] as [number, number, number], lineWidth: 0.2 },
    margin: { left: margin, right: margin },
  }

  autoTable(doc, {
    startY: y,
    head: [['SKU', 'Product', 'Brand', 'Rolled COGS', 'COGS', 'Retail', 'Margin %', 'vs Target']],
    body: (data.productCosts || []).map((r) => [
      r.fgPartNumber || '—',
      r.productName || '—',
      r.brand || '—',
      fmtCell(r.rolledCogs),
      fmtCell(r.cogs),
      fmtCell(r.retail, 2),
      toNum(r.marginPct) != null ? `${toNum(r.marginPct)!.toFixed(1)}%` : '—',
      toNum(r.marginVsTarget) != null ? `${toNum(r.marginVsTarget)! >= 0 ? '+' : ''}${toNum(r.marginVsTarget)!.toFixed(1)}%` : '—',
    ]),
    ...tableStyle,
    columnStyles: { 1: { cellWidth: 70 } },
  })

  doc.save(`KarEve_CostingReport_${dateStamp()}.pdf`)
}
