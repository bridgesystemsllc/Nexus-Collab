import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { ExcelSourceAdapter } from './excelSourceAdapter'
import { UnknownReportFormatError } from './detectFormat'

const fixture = (name: string) => fs.readFileSync(path.resolve(process.cwd(), '../../fixtures/oor', name))
const input = (name: string) => ({ buffer: fixture(name), filename: name, brandId: 'brand_1', orgId: 'org_1' })

describe('ExcelSourceAdapter', () => {
  const adapter = new ExcelSourceAdapter()

  it('routes the legacy .xls report to the customer open order parser', async () => {
    const report = await adapter.load(input('Acne_Free_Open_Order_Report_Week_of_08_17_2026.xls'))
    expect(report.reportType).toBe('customer_open_order')
    expect(report.lines).toHaveLength(51)
  })

  it('routes the .xlsx report to the shortage parser', async () => {
    const report = await adapter.load(input('AMBI_Open_Order_Shortage_Report_08_24_26.xlsx'))
    expect(report.reportType).toBe('open_order_shortage')
    expect(report.lines).toHaveLength(7)
  })

  it('refuses a workbook it cannot identify, naming what it found', async () => {
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Widget', 'Sprocket']]), 'Sheet1')
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
    await expect(adapter.load({ buffer, filename: 'nope.xlsx', brandId: 'b', orgId: 'o' })).rejects.toThrow(
      UnknownReportFormatError,
    )
  })
})
