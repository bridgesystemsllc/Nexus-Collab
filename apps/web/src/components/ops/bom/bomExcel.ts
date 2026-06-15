// ─── PLACEHOLDER ───────────────────────────────────────────
// The real BOM → XLSX export engine is being built in parallel and will land on
// the base branch with these EXACT signatures. This stub exists only so the UI
// branch type-checks and builds in isolation; it will be replaced (and should
// lose any merge conflict) by the parallel implementation. Do NOT build out the
// Excel logic here.
import ExcelJS from 'exceljs'
import type { Bom } from './bomTypes'

export async function buildBomWorkbook(boms: Bom[]): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  for (const bom of boms) {
    const ws = wb.addWorksheet(bom.fgPartNumber || bom.productName || 'BOM')
    ws.addRow(['BILL OF MATERIALS'])
  }
  return wb
}

export async function exportBomsXlsx(boms: Bom[], filename = 'boms.xlsx'): Promise<void> {
  const wb = await buildBomWorkbook(boms)
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
