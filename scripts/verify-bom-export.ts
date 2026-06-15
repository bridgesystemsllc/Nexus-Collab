// scripts/verify-bom-export.ts
//
// Golden-fixture verification for the BOM ExcelJS export engine.
//
// Reconstructs the 4 seeded Carol's Daughter / Lisa's Kitchen BOMs inline
// (values copied from packages/prisma/prisma/seed.ts SEED_BOMS), builds the
// workbook via buildBomWorkbook, then reads the workbook back with ExcelJS
// and asserts byte-level fidelity of the canonical format.
//
// Run from the repo root:
//   pnpm exec tsx scripts/verify-bom-export.ts
//
// Exits 1 if any assertion fails. Also writes each .xlsx to /tmp for manual
// inspection.

import ExcelJS from 'exceljs'
import { buildBomWorkbook } from '../apps/web/src/components/ops/bom/bomExcel'
import type { Bom, BomLine, PartType } from '../apps/web/src/components/ops/bom/bomTypes'
import { bomShortName } from '../apps/web/src/components/ops/bom/bomTypes'

// ─── Part master (pn -> vendor/type), copied from seed BOM_PARTS ──────────
const PART_META: Record<string, { vendor: string; type: PartType }> = {
  'CD-73ACT139': { vendor: 'ACT', type: 'bulk' },
  'CD-73ACT166A': { vendor: 'ACT', type: 'bulk' },
  'CD-73ACT105': { vendor: 'ACT', type: 'bulk' },
  'CD-67ACT166': { vendor: 'ACT', type: 'bulk' },
  'CD-101000': { vendor: 'BestChinaSourcing', type: 'bottle' },
  'CD-101001': { vendor: 'BROOK + WHITTLE', type: 'label' },
  'CD-101002': { vendor: 'Undirected', type: 'divider' },
  'CD-101003': { vendor: 'Undirected', type: 'shipper' },
  'CD-101004': { vendor: 'Jansy Packaging', type: 'tube' },
  'CD-101005': { vendor: 'Mill Rock Pkg', type: 'carton' },
  'CD-101006': { vendor: 'Undirected', type: 'shipper' },
  'CD-101007': { vendor: 'TricorBraun', type: 'bottle' },
  'CD-101008': { vendor: 'BestChinaSourcing', type: 'cap' },
  'CD-101009': { vendor: 'BROOK + WHITTLE', type: 'label' },
  'CD-101010': { vendor: 'Undirected', type: 'shipper' },
  'CD-101011': { vendor: 'TricorBraun', type: 'bottle' },
  'CD-101012': { vendor: 'BROOK + WHITTLE', type: 'label' },
  'CD-101013': { vendor: 'Undirected', type: 'shipper' },
  'CD-101014': { vendor: 'Undirected', type: 'shrinkwrap' },
}

type SeedLine = { pn: string; desc: string; um: string }

function mkBom(
  fgPartNumber: string,
  productName: string,
  fillClaim: string,
  fillerName: string,
  caseQty: number,
  overUnderTolerance: string,
  launchPriority: number,
  seedLines: SeedLine[],
): Bom {
  const lines: BomLine[] = seedLines.map((ln, i) => ({
    lineNo: i + 1,
    componentId: null,
    partNumber: ln.pn,
    description: ln.desc,
    um: ln.um,
    supplier: PART_META[ln.pn]?.vendor ?? '',
    partType: PART_META[ln.pn]?.type ?? 'other',
  }))
  return {
    brand: "Carol's Daughter",
    fgPartNumber,
    productName,
    fillClaim,
    minFill: 'Legal fill claim',
    fillerSupplier: 'ACT',
    fillerName,
    caseQty,
    innerPack: '3 eaches per',
    overUnderTolerance,
    launchPriority,
    status: 'active',
    version: 1,
    lines,
  }
}

const GOLDEN: Bom[] = [
  mkBom(
    'K8120000',
    "Carol's Daughter Lisa's Kitchen Scalp & Edge Care Balancing Serum 2oz",
    '2.0 fl oz',
    '"CD LK SCALP & EDGE BALANCING SERUM 2OZ"',
    12,
    '[+ or – 8%]',
    3,
    [
      { pn: 'CD-73ACT139', desc: 'BULK-Formula#73ACT139_BalancingSerum2oz', um: '1' },
      { pn: 'CD-101000', desc: 'Glass Bottle w Dropper Set; custom color-BestChinaSourcing', um: '1' },
      { pn: 'CD-101001', desc: 'Product label-LK Balancing Serum', um: '1' },
      { pn: 'CD-101002', desc: 'Shipper corrugate dividers', um: '1' },
      { pn: 'CD-101003', desc: 'Shipper-12 ct (ship test with pad)', um: '1' },
      { pn: 'CD-101014', desc: 'Shrink-wrap (4 inner packs of 3 eaches)', um: '-' },
    ],
  ),
  mkBom(
    'K8130000',
    "Carol's Daughter Lisa's Kitchen Scalp & Edge Care Treatment Balm 2oz",
    '2.0 fl oz',
    '"CD LK SCALP & EDGE TREATMENT BALM 2OZ"',
    24,
    'Industry Standard [+ or – 10%]',
    4,
    [
      { pn: 'CD-73ACT166A', desc: 'BULK-Formula#73ACT166A_TreatmentBalm2oz', um: '1' },
      { pn: 'CD-101004', desc: 'Tube 2oz-JansyPkg', um: '1' },
      { pn: 'CD-101005', desc: 'Unit carton-MillRockPkg', um: '1' },
      { pn: 'CD-101006', desc: 'Shipper-24 ct', um: '1' },
      { pn: 'CD-101014', desc: 'Shrink-wrap (8 inner packs of 3 eaches)', um: '-' },
    ],
  ),
  mkBom(
    'K8140000',
    "Carol's Daughter Lisa's Kitchen Scalp & Edge Care Detox Nectar 8oz",
    '8.0 fl oz',
    '"CD LK SCALP & EDGE DETOX NECTAR 8OZ"',
    12,
    '[+ or – 8%]',
    2,
    [
      { pn: 'CD-73ACT105', desc: 'BULK-Formula#73ACT105_DetoxNectar8oz', um: '1' },
      { pn: 'CD-101007', desc: '8oz PET Cylinder #365649 -Tricor', um: '1' },
      { pn: 'CD-101008', desc: '24/410 needle nose cap, custom color 2655C-BestChinaSourcing', um: '1' },
      { pn: 'CD-101009', desc: 'Product label-LK Detox Nectar', um: '1' },
      { pn: 'CD-101010', desc: 'Shipper-12 ct', um: '1' },
      { pn: 'CD-101014', desc: 'Shrink-wrap (4 inner packs of 3 eaches)', um: '-' },
    ],
  ),
  mkBom(
    'K8150000',
    "Carol's Daughter Lisa's Kitchen Scalp & Edge Care Cleansing Oil 6oz",
    '6.0 fl oz',
    '"CD LK SCALP & EDGE CLEANSING OIL 6OZ"',
    12,
    '[+ or – 8%]',
    1,
    [
      { pn: 'CD-67ACT166', desc: 'BULK-Formula#67ACT166_CleansingOil6oz', um: '1' },
      { pn: 'CD-101011', desc: '6oz PET Cylinder #365648 -Tricor', um: '1' },
      { pn: 'CD-101008', desc: '24/410 needle nose cap, custom color 2655C-BestChinaSourcing', um: '1' },
      { pn: 'CD-101012', desc: 'Product label-LK Cleansing Oil', um: '1' },
      { pn: 'CD-101013', desc: 'Shipper-12 ct', um: '1' },
      { pn: 'CD-101014', desc: 'Shrink-wrap (4 inner packs of 3 eaches)', um: '-' },
    ],
  ),
]

// ─── Assertion harness ────────────────────────────────────────────────────
type Check = { name: string; pass: boolean; detail?: string }

function approx(a: number | undefined, b: number, eps = 0.01): boolean {
  return a != null && Math.abs(a - b) <= eps
}

function fillArgb(cell: ExcelJS.Cell): string | undefined {
  const f = cell.fill as ExcelJS.FillPattern | undefined
  return f?.fgColor?.argb
}

function fontColorArgb(cell: ExcelJS.Cell): string | undefined {
  return cell.font?.color?.argb
}

async function main() {
  const wb = await buildBomWorkbook(GOLDEN)

  // Round-trip: write to buffer, read back into a fresh workbook.
  const buf = await wb.xlsx.writeBuffer()
  const rt = new ExcelJS.Workbook()
  await rt.xlsx.load(buf as ArrayBuffer)

  // Also write each BOM to /tmp individually for manual inspection.
  for (const bom of GOLDEN) {
    const single = await buildBomWorkbook([bom])
    await single.xlsx.writeFile(`/tmp/bom-verify-${bomShortName(bom)}.xlsx`)
  }

  let allPass = true

  // Workbook-level checks
  const wbChecks: Check[] = []
  wbChecks.push({ name: '4 sheets', pass: rt.worksheets.length === 4, detail: `got ${rt.worksheets.length}` })
  const allBomPrefix = rt.worksheets.every((w) => w.name.startsWith('BOM-'))
  wbChecks.push({
    name: "sheet names start 'BOM-'",
    pass: allBomPrefix,
    detail: rt.worksheets.map((w) => w.name).join(', '),
  })

  printTable('WORKBOOK', wbChecks)
  allPass = allPass && wbChecks.every((c) => c.pass)

  // Expected component counts per BOM (by fgPartNumber)
  const expectedCounts: Record<string, number> = {
    K8120000: 6,
    K8130000: 5,
    K8140000: 6,
    K8150000: 6,
  }

  for (let i = 0; i < GOLDEN.length; i++) {
    const bom = GOLDEN[i]
    const ws = rt.worksheets[i]
    const N = bom.lines.length
    const footerLabelRow = 9 + N - 1 + 2
    const checks: Check[] = []

    // Col widths
    checks.push({ name: 'colA width 21.6', pass: approx(ws.getColumn(1).width, 21.6), detail: `${ws.getColumn(1).width}` })
    checks.push({ name: 'colB width 69.6', pass: approx(ws.getColumn(2).width, 69.6), detail: `${ws.getColumn(2).width}` })
    checks.push({ name: 'colC width 10.1', pass: approx(ws.getColumn(3).width, 10.1), detail: `${ws.getColumn(3).width}` })
    checks.push({ name: 'colD width 19.3', pass: approx(ws.getColumn(4).width, 19.3), detail: `${ws.getColumn(4).width}` })

    // A1 title
    const a1 = ws.getCell('A1').value
    checks.push({ name: "A1 == 'BILL OF MATERIALS'", pass: a1 === 'BILL OF MATERIALS', detail: `${a1}` })

    // A8 black fill + white bold
    const a8 = ws.getCell('A8')
    checks.push({ name: 'A8 fill FF000000', pass: fillArgb(a8) === 'FF000000', detail: `${fillArgb(a8)}` })
    checks.push({ name: 'A8 font color FFFFFFFF', pass: fontColorArgb(a8) === 'FFFFFFFF', detail: `${fontColorArgb(a8)}` })
    checks.push({ name: 'A8 bold', pass: a8.font?.bold === true, detail: `${a8.font?.bold}` })

    // B5 filler name: size 14, bold, blue
    const b5 = ws.getCell('B5')
    checks.push({ name: 'B5 size 14', pass: b5.font?.size === 14, detail: `${b5.font?.size}` })
    checks.push({ name: 'B5 bold', pass: b5.font?.bold === true, detail: `${b5.font?.bold}` })
    checks.push({ name: 'B5 color FF4472C4', pass: fontColorArgb(b5) === 'FF4472C4', detail: `${fontColorArgb(b5)}` })

    // B4 white fill
    const b4 = ws.getCell('B4')
    checks.push({ name: 'B4 fill FFFFFFFF', pass: fillArgb(b4) === 'FFFFFFFF', detail: `${fillArgb(b4)}` })

    // Yellow tolerance cell at dynamic footer row
    const tol = ws.getCell(`A${footerLabelRow}`)
    checks.push({
      name: `A${footerLabelRow} tolerance fill FFFFFF00`,
      pass: fillArgb(tol) === 'FFFFFF00',
      detail: `${fillArgb(tol)}`,
    })
    checks.push({
      name: `A${footerLabelRow} == 'OVER/UNDER RUN TOLERANCE :'`,
      pass: tol.value === 'OVER/UNDER RUN TOLERANCE :',
      detail: `${tol.value}`,
    })

    // Merged priority box C{footer}:D{footer}
    const merges = (ws as unknown as { _merges?: Record<string, unknown> })._merges
    let mergeFound = false
    if (merges && typeof merges === 'object') {
      mergeFound = Object.keys(merges).some((k) => k.includes(`C${footerLabelRow}:D${footerLabelRow}`))
    }
    // Fallback: ExcelJS exposes merge state via cell.isMerged + master address.
    if (!mergeFound) {
      const c = ws.getCell(`C${footerLabelRow}`)
      const d = ws.getCell(`D${footerLabelRow}`)
      mergeFound =
        (c as unknown as { isMerged?: boolean }).isMerged === true &&
        (d.model as { master?: string }).master === `C${footerLabelRow}`
    }
    checks.push({
      name: `merged box C${footerLabelRow}:D${footerLabelRow}`,
      pass: mergeFound,
      detail: mergeFound ? 'present' : 'missing',
    })

    // UM '-' preserved for shrinkwrap line (last line in each golden BOM)
    const shrinkLineIdx = bom.lines.findIndex((l) => l.partType === 'shrinkwrap')
    const shrinkRow = 9 + shrinkLineIdx
    const umCell = ws.getCell(`C${shrinkRow}`).value
    checks.push({ name: `UM '-' preserved (C${shrinkRow})`, pass: umCell === '-', detail: `${JSON.stringify(umCell)}` })

    // Component count rows correct
    let actualRows = 0
    for (let r = 9; r <= 8 + N; r++) {
      if (ws.getCell(`A${r}`).value != null && ws.getCell(`A${r}`).value !== '') actualRows++
    }
    checks.push({
      name: `component rows == ${expectedCounts[bom.fgPartNumber]}`,
      pass: N === expectedCounts[bom.fgPartNumber] && actualRows === N,
      detail: `lines=${N} populated=${actualRows}`,
    })

    printTable(`${bom.fgPartNumber}  [${ws.name}]`, checks)
    allPass = allPass && checks.every((c) => c.pass)
  }

  console.log('\n' + (allPass ? '✅ ALL ASSERTIONS PASS' : '❌ SOME ASSERTIONS FAILED'))
  console.log('Inspect: /tmp/bom-verify-*.xlsx')
  process.exit(allPass ? 0 : 1)
}

function printTable(title: string, checks: Check[]) {
  console.log(`\n── ${title} ──`)
  for (const c of checks) {
    const mark = c.pass ? 'PASS' : 'FAIL'
    const detail = c.pass ? '' : `   (${c.detail})`
    console.log(`  [${mark}] ${c.name}${detail}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
