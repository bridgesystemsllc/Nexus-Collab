import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import * as XLSX from 'xlsx'
import { parseShortageReport, classifyMaterial } from './parseShortageReport'
import type { ParsedReport, ParsedNode } from '../sourceAdapter'

const FIXTURE = path.resolve(process.cwd(), '../../fixtures/oor/AMBI_Open_Order_Shortage_Report_08_24_26.xlsx')

let report: ParsedReport
const flatten = (ns: ParsedNode[]): ParsedNode[] => ns.flatMap((n) => [n, ...flatten(n.children)])
const allNodes = () => report.lines.flatMap((l) => flatten(l.nodes))

beforeAll(() => {
  const wb = XLSX.read(fs.readFileSync(FIXTURE), { cellNF: true })
  report = parseShortageReport(wb.Sheets['CUstShortSSRS'], path.basename(FIXTURE))
})

describe('parseShortageReport against the AMBI fixture', () => {
  it('reconstructs 7 PO lines, 33 job materials and 80 raw materials', () => {
    expect(report.lines).toHaveLength(7)
    const nodes = allNodes()
    expect(nodes.filter((n) => n.level === 1)).toHaveLength(33)
    expect(nodes.filter((n) => n.level === 2)).toHaveLength(80)
  })

  it('accounts for every source row, leaving none unclassified', () => {
    expect(report.lines.length + allNodes().length).toBe(120)
  })

  it('attaches every level-2 node to a level-1 parent, never to a line directly', () => {
    for (const line of report.lines) {
      for (const top of line.nodes) expect(top.level).toBe(1)
    }
    const level2 = allNodes().filter((n) => n.level === 2)
    expect(level2).toHaveLength(80)
    const parented = report.lines.flatMap((l) => l.nodes.flatMap((n) => n.children))
    expect(parented).toHaveLength(80)
  })

  it('carries the job number forward onto child rows that omit it', () => {
    expect(allNodes().every((n) => n.jobNumber !== null && n.jobNumber !== '')).toBe(true)
  })

  it('flags all 7 customer-provided materials', () => {
    expect(allNodes().filter((n) => n.customerProvided)).toHaveLength(7)
  })

  it('classifies materials by their description prefix', () => {
    const nodes = allNodes()
    expect(nodes.filter((n) => n.materialClass === 'BULK')).toHaveLength(7)
    expect(nodes.filter((n) => n.materialClass === 'COMPONENT')).toHaveLength(26)
    expect(nodes.filter((n) => n.materialClass === 'RAW_MATERIAL')).toHaveLength(80)
  })

  it('finds the component type even when a pack size or CP marker precedes it', () => {
    expect(classifyMaterial('Components, TUBE, TUBE 4 fl oz BX FACIAL SCRUB, 300102 I4').componentType).toBe('TUBE')
    expect(classifyMaterial('Components, x24, PAD, PAD x24 - 4 fl oz BX FACIAL SCRUB, 131120 00, AW').componentType).toBe('PAD')
    expect(classifyMaterial('Components, CP, BACK, BACK LABEL - 12fl oz').componentType).toBe('BACK LABEL')
    expect(classifyMaterial('Components, x24, SHIPPER, SHIPPER x24 - 4 fl oz').componentType).toBe('SHIPPER')
    expect(classifyMaterial('Components, UNIT CARTON, UNIT CARTON 4 fl oz').componentType).toBe('UNIT CARTON')
  })

  it('classifies bulk and raw material without a component type', () => {
    expect(classifyMaterial('Bulk, WAXES/PASTES/POMADES, Uncolored')).toEqual({ materialClass: 'BULK', componentType: null })
    expect(classifyMaterial('Raw Materials, OTHER, Characteristic, FRAG MF222013')).toEqual({ materialClass: 'RAW_MATERIAL', componentType: null })
  })

  it('preserves the hot-fill instruction with its line breaks intact', () => {
    const hotFill = allNodes().find((n) => n.mfgComment?.includes('HOT FILL'))!
    expect(hotFill.mfgComment).toContain('***HOT FILL***')
    expect(hotFill.mfgComment).toContain('\n')
    expect(hotFill.mfgComment).toMatch(/TRANSFER TEMPERATURE: 78 – 80\*C/)
    expect(hotFill.mfgComment).not.toContain('\r')
  })

  it('reads a bare date in Mfg Comment as an estimated ETA rather than choking on it', () => {
    const dated = allNodes().filter((n) => n.etaDate !== null)
    expect(dated).toHaveLength(49)
    expect(dated.every((n) => n.etaConfidence === 'estimated')).toBe(true)
    expect(dated.every((n) => n.mfgComment === null)).toBe(true)
  })

  it('leaves nodes without an ETA marked unknown', () => {
    const undated = allNodes().filter((n) => n.etaDate === null)
    expect(undated.every((n) => n.etaConfidence === 'unknown')).toBe(true)
  })

  it('keeps a Qty Due that appears on a child row', () => {
    const split = report.lines.find((l) => l.qtyRemaining === 14000)!
    expect(flatten(split.nodes).some((n) => n.rawRow['Qty Due'] === 7000)).toBe(true)
  })

  it('reads the report title into the label and as-of date', () => {
    expect(report.reportType).toBe('open_order_shortage')
    expect(report.reportLabel).toBe('AMBI Open Order Shortage Report 8/24/26')
    expect(report.asOfDate?.toISOString().slice(0, 10)).toBe('2026-08-24')
  })

  it('preserves source order so an export can reproduce the file', () => {
    for (const line of report.lines) {
      const indexes = flatten(line.nodes).map((n) => n.sortIndex)
      expect(indexes).toEqual([...indexes].sort((a, b) => a - b))
    }
  })

  it('reads the PO line fields from the level-0 row', () => {
    const first = report.lines[0]
    expect(first.customerPoNumber).toBe('V09302025')
    expect(first.itemNumber).toBe('10067103')
    expect(first.custPartNumber).toBe('P1915400')
    expect(first.qtyRemaining).toBe(11350)
    expect(first.unitPrice).toBe(3.26)
    expect(first.jobNumber).toBe('122460-1-2')
    expect(first.fulfillmentType).toBe('CONTRACT_MFG')
  })
})
