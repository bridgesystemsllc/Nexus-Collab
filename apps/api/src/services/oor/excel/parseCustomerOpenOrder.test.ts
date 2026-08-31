import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import * as XLSX from 'xlsx'
import { parseCustomerOpenOrder } from './parseCustomerOpenOrder'
import type { ParsedReport } from '../sourceAdapter'

// vitest runs with apps/api as the working directory.
const FIXTURE = path.resolve(process.cwd(), '../../fixtures/oor/Acne_Free_Open_Order_Report_Week_of_08_17_2026.xls')

let report: ParsedReport

beforeAll(() => {
  const wb = XLSX.read(fs.readFileSync(FIXTURE), { cellNF: true })
  report = parseCustomerOpenOrder(wb.Sheets[wb.SheetNames[0]], path.basename(FIXTURE))
})

describe('parseCustomerOpenOrder against the AcneFree fixture', () => {
  it('finds 51 open lines', () => {
    expect(report.lines).toHaveLength(51)
    expect(report.lines.every((l) => (l.qtyRemaining ?? 0) > 0)).toBe(true)
  })

  it('sums RemQty to the sheet total', () => {
    const total = report.lines.reduce((s, l) => s + (l.qtyRemaining ?? 0), 0)
    expect(total).toBe(704839)
  })

  it('classifies the 8 MISC lines', () => {
    expect(report.lines.filter((l) => l.fulfillmentType === 'MISC')).toHaveLength(8)
  })

  it('classifies the 43 work-order lines as contract manufacture', () => {
    expect(report.lines.filter((l) => l.fulfillmentType === 'CONTRACT_MFG')).toHaveLength(43)
  })

  it('extracts every channel tag present, keeping the suffix intact', () => {
    const tags = new Set(report.lines.map((l) => l.channelTag).filter(Boolean))
    expect(tags).toEqual(new Set(['AMZ', 'Retail', 'CMLEX LOI']))
  })

  it('strips the channel suffix from the PO number itself', () => {
    const tagged = report.lines.find((l) => l.channelTag === 'CMLEX LOI')!
    expect(tagged.customerPoNumber).not.toContain('>')
  })

  it('resolves both date encodings — serials and padded text — into real dates', () => {
    const withOrig = report.lines.filter((l) => l.origRequiredDate !== null)
    expect(withOrig).toHaveLength(50)
    expect(withOrig.every((l) => l.origRequiredDate instanceof Date)).toBe(true)
    expect(report.lines.filter((l) => l.requiredDeliveryDate !== null)).toHaveLength(51)
  })

  it('flags every row where the source Value disagrees with RemQty x Price', () => {
    expect(report.lines.filter((l) => l.valueMismatch)).toHaveLength(10)
  })

  it('recomputes value rather than trusting the source', () => {
    const line = report.lines.find((l) => l.salesOrderNumber === 'S0100057780')!
    expect(line.valueSource).toBe(149400)
    expect(line.valueComputed).toBeCloseTo(62210.16, 2)
    expect(line.valueMismatch).toBe(true)
  })

  it('flags the unreadable currency cell instead of storing a guess', () => {
    const line = report.lines.find((l) => l.salesOrderNumber === 'S0100058358')!
    expect(line.valueSource).toBeNull()
    expect(line.valueMismatch).toBe(true)
    expect(report.warnings.some((w) => w.column === 'Value' && w.rawValue === '$114.004.22')).toBe(true)
  })

  it('keeps the dirty quantity as raw text and warns, without throwing', () => {
    const line = report.lines.find((l) => l.qtyOrderedRaw?.includes('50000+'))!
    expect(line.qtyOrdered).toBeNull()
    expect(report.warnings.some((w) => w.column === 'Qtys')).toBe(true)
  })

  it('splits every comment cell into structured entries', () => {
    expect(report.lines.filter((l) => l.comments.length > 0)).toHaveLength(46)
    const line = report.lines.find((l) => l.salesOrderNumber === 'S0100057780')!
    expect(line.comments).toHaveLength(3)
    expect(line.comments[0].authorInitials).toBe('AD')
  })

  it('reports the label and as-of date from the file it was given', () => {
    expect(report.reportType).toBe('customer_open_order')
    expect(report.reportLabel).toContain('Week of 08 17 2026')
  })

  it('keeps the whole source row for audit', () => {
    expect(report.lines[0].rawRow['Customer PO Number']).toBeDefined()
  })
})
