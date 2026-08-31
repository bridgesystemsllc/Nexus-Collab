# Open Order Report (OOR) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two weekly emailed Excel reports with one operational surface in Nexus — Operations → Purchase Order Tracking → Open Order Report — where every open PO line carries its shortage tree, derived status, and full collaboration history, and exports back to a file the contract manufacturer recognises.

**Architecture:** Dedicated Prisma models (not `ModuleItem.data` JSON) for lines, shortage nodes and collaboration, registered behind a `DepartmentModule` of type `OPEN_ORDER_REPORT` so the tab plugs into the existing Ops shell. Parsers are pure functions behind a `SourceAdapter` interface, run server-side; the Excel file drop is adapter #1 and the existing `ERP_KAREVE` open-order sync becomes adapter #2. Every mutation writes the existing `AuditLog`, not a bespoke event table.

**Tech Stack:** Express 4 + Prisma + Postgres (apps/api), React 18 + Vite + TanStack Table 8 + TanStack Query 5 + react-router-dom 6 (apps/web), zod 3, multer, xlsx 0.18 (to be added to apps/api), exceljs 4.4 (already in both).

**Spec:** The build prompt supplied by Ahmad on 2026-08-30 (Open Order Report — Operations → PO Tracking), reproduced in `docs/superpowers/specs/2026-08-30-open-order-report-spec.md`.

## Global Constraints

- Production-grade: no mock data, no `TODO`, no stubbed handlers, no placeholder components.
- Every list, filter, sort and total is server-driven and paginated. No client-side "load everything".
- Repo conventions win over the spec wherever they conflict. The conflicts, and how each is resolved, are in "Spec vs repo" below.
- IDs are cuid strings (`@default(cuid())`), matching all 64 existing models. The spec's `uuid` is not used anywhere in this repo.
- Prisma models are PascalCase with camelCase fields and no `@@map`, matching the existing schema. The spec's `snake_case` table naming is not used anywhere in this repo.
- Schema is applied with `prisma db push` plus an idempotent boot-time ensure in `apps/api/src/index.ts:start()`. **There is no `prisma migrate` history in this repo at all** — introducing one here would fork the pattern.
- Scoping is `orgId` **and** `brandId`. The spec says brand-scoped; Nexus is multi-tenant by Organization and a brand-only scope would leak across tenants.
- RBAC keys follow the catalogue's `resource:action` form — `oor:read`, `oor:import`, not the spec's `oor.view`.
- Colours come from `apps/web/src/styles/design-system.css` tokens: `--accent-secondary: #7C3AED` (the spec's Electric Indigo, already present), `--success: #0F7B6C`, `--warning: #D97706`, `--danger: #EB5757`. The spec's raw hexes (`#32D74B`, `#FF9F0A`, `#FF453A`) are iOS-dark values that break the light theme; the tokens are already theme-aware.
- Space Grotesk is already loaded (`design-system.css:402`). JetBrains Mono is **not** — Task 11 adds it. All identifiers and figures render in it.
- No animation library exists (no framer-motion). Micro-interactions are CSS transitions, wrapped in `@media (prefers-reduced-motion: reduce)` no-op guards.

---

## Spec vs repo — conflicts and resolutions

Read this before Task 1. Each one is a place the spec assumed a greenfield repo.

**1. Storage: dedicated models, not `ModuleItem.data`.**
Every existing Ops tab (SKU Pipeline, Inventory Health, Production Tracking, Brand Transition, Components, BOM) stores rows as `ModuleItem` records with an untyped `data Json` blob. OOR does not fit: it needs a self-referencing tree, paginated server-side filtering across ~15 fields, threaded soft-deleted comments, and email attachments. Expressing that in `ModuleItem.data` means every filter is a JSON path query and every tree walk is application-side. **Resolution:** dedicated models, with one `DepartmentModule` row of type `OPEN_ORDER_REPORT` created by the boot ensure so the tab resolves through the same `MODULE_TYPE_BY_TAB` mechanism as its neighbours. This is the same exception the Projects tab already takes (`ops.tsx:1327` — "Projects is not a DepartmentModule — it owns its own tables").

**2. There is already an open-order truth in this tab.**
`apps/api/src/lib/erpOpenOrders.ts` defines a two-way sync with `ERP_KAREVE` (the AmbiSync ERP): the ERP owns PO lifecycle fields, Nexus owns everything under `nexusFields`, notes are append-only. It lands in `OPEN_ORDERS` module items and renders today as the "Open Orders" mode toggle inside the Production Tracking tab (`ops.tsx:824`, `OpenOrdersView.tsx`, 796 lines). Building OOR as a second Excel-fed open-order store gives the same tab two disagreeing answers to "what is open".
**Resolution:** OOR is the successor. `SourceAdapter` gets two implementations — `ExcelSourceAdapter` (Tasks 2–4) and `ErpSourceAdapter` (wraps `mapErpOpenOrder`, Task 6) — writing into the same `OorLine` table. The old Open Orders mode stays untouched and functional until Task 17, which redirects it to the new tab. **If you would rather keep both surfaces permanently, say so now — it changes Tasks 6 and 17.**

**3. `oor_status_event` duplicates `AuditLog`.**
`AuditLog` already stores actor, denormalised actor email, action, entityType, entityId, `changes Json` as `{field: {from, to}}`, metadata, orgId, with four indexes including `[entityType, entityId, createdAt desc]`. **Resolution:** no new event table; write `AuditLog` with `entityType: 'oor_line' | 'oor_shortage_node'`. The Activity feed reads it.

**4. `oor_email` / `oor_email_attachment` duplicate `Attachment`.**
`Attachment` is already polymorphic (`attachableType`, `attachableId`), already typed `email | file | comment`, already soft-deleted via `deletedAt`, already indexed on `[attachableType, attachableId]` and `createdAt desc`. **Resolution:** emails and their attachments use `Attachment` with `attachableType: 'oor_line'` and a typed `payload`. Drops two tables.

Net effect: the spec's 10 new tables become **5** — `OorReportRun`, `OorLine`, `OorShortageNode`, `OorComment`, `OorNote`, `OorMeetingUpdate` (6 with meetings, which has no existing analogue).

**5. `exceljs` cannot read legacy `.xls`.** The AcneFree fixture is BIFF written by Crystal Reports. `apps/api` has `exceljs` and `papaparse` but not `xlsx`. `apps/web` has `xlsx@0.18.5`. **Resolution:** add `xlsx@0.18.5` to `apps/api` (Task 1). Verified: it reads both fixtures, so no second parser and no `node-xlsx`.

**6. Import is server-side here, unlike the existing client-side pattern.** `OpenOrderImport.tsx` parses in the browser and posts proposed updates. OOR needs a file hash for idempotency, persisted parse warnings, and a durable `OorReportRun` — all server concerns. `inventoryImport.ts` already establishes the server-side multer + memoryStorage pattern to copy. **Resolution:** follow `inventoryImport.ts`.

**7. Fixture reality differs from the spec's test assertions** (measured 2026-08-30, both files now in `fixtures/oor/`):

| Spec claim | Measured | Consequence |
|---|---|---|
| Format A: 51 open lines | 51 ✓ (all RemQty > 0), 8 `MISC` | assertion stands |
| Format B: 7 / 33 / 80 | 7 / 33 / 80 ✓, 0 unclassified | assertion stands |
| channel tags `>AMZ` `>Retail` `>CMLEX LOI` | all three ✓ | assertion stands |
| `Qtys` dirty cell: one | one (`"50000+\n16,400"`) ✓ | assertion stands |
| mixed date encodings | 17 serial / 33 text ✓ | assertion stands |
| `CP? = Y`: "the one flagged component" | **7 rows** | Task 4 asserts 7 |
| `Mfg Comment` bare date: "one cell" | **49 cells** | Task 4 parses these to `etaDate` + `etaConfidence: 'estimated'` — at that density it is the ETA convention, not type drift |
| `Value` mismatch: one (`$114.004.22`) | **10 of 51** — 9 numeric-but-wrong + 1 string | Task 2 asserts 10; Import Review is designed for a routine ~20% warning rate, not an exception |

On that last row: `Qtys × Price` was tested as the alternative derivation and explains **zero** of the nine. Example `S0100057780`: 1041 × $59.76 = $62,210.16, source says $149,400. And `$114.004.22` is a typo of `$114,005.22` (1042 × 109.41). The column is hand-edited. Recompute-and-flag is correct; just size the UI for it.

---

## File Structure

**apps/api**
- `src/services/oor/sourceAdapter.ts` — `SourceAdapter` interface + `ParsedReport` / `ParsedLine` / `ParsedNode` / `ParseWarning` types. The seam that lets ERP replace Excel later.
- `src/services/oor/excel/detectFormat.ts` — header-signature format detection.
- `src/services/oor/excel/parseCustomerOpenOrder.ts` — Format A.
- `src/services/oor/excel/parseShortageReport.ts` — Format B, including hierarchy reconstruction.
- `src/services/oor/excel/cellCoercion.ts` — shared dirty-value coercion (mixed date encodings, currency strings, dirty quantities). Every warning originates here.
- `src/services/oor/excel/legacyComments.ts` — the `MM.DD.YYYY - … II` splitter.
- `src/services/oor/excel/excelSourceAdapter.ts` — wires detection + parsers behind `SourceAdapter`.
- `src/services/oor/erpSourceAdapter.ts` — wraps `lib/erpOpenOrders.ts` behind the same interface.
- `src/services/oor/importRun.ts` — hash, idempotency, upsert-preserving-user-content, warning persistence.
- `src/services/oor/deriveStatus.ts` — pure status + risk derivation.
- `src/services/oor/exportReport.ts` — exceljs writers for both formats.
- `src/services/oor/bootstrap.ts` — `ensureOorModule(prisma)`, called from `index.ts:start()`.
- `src/routes/oor.ts` — every endpoint under `/api/operations/oor`.
- Tests colocate as `*.test.ts` beside their subject (repo convention: `inventoryStatus.test.ts`, `poEmailIntakeFilter.test.ts`).

**apps/web**
- `src/components/ops/poTracking/PoTrackingTab.tsx` — the new tab shell and its sub-tabs.
- `src/components/ops/poTracking/oor/OorGrid.tsx` — TanStack Table grid.
- `src/components/ops/poTracking/oor/oorColumns.tsx` — the two column sets from the spec, verbatim labels.
- `src/components/ops/poTracking/oor/ShortageTree.tsx` — inline expandable tree.
- `src/components/ops/poTracking/oor/OorStatCards.tsx` — filter-chip stat cards.
- `src/components/ops/poTracking/oor/OorModal.tsx` — modal shell + tab router.
- `src/components/ops/poTracking/oor/tabs/{Overview,ProductionTracker,Comments,Notes,MeetingUpdates,Emails,Activity}.tsx`
- `src/components/ops/poTracking/oor/ThreadComposer.tsx` — the one composer shell shared by tabs 3–6.
- `src/components/ops/poTracking/oor/oorFormat.ts` — number/date formatting matching the source workbooks.
- `src/components/ops/poTracking/oor/useOorQueries.ts` — TanStack Query hooks.

**packages/shared**
- `src/oor/status.ts` — status vocabulary, shortage reason codes, risk levels. Shared so API and web cannot disagree (same reason `rbac/catalogue.ts` lives here).
- `src/rbac/catalogue.ts` — modify: add the `oor` resource group.

---

### Task 1: Fixtures, dependency, and the SourceAdapter seam

**Files:**
- Create: `apps/api/src/services/oor/sourceAdapter.ts`
- Create: `apps/api/src/services/oor/excel/detectFormat.ts`
- Test: `apps/api/src/services/oor/excel/detectFormat.test.ts`
- Modify: `apps/api/package.json` (add `"xlsx": "^0.18.5"`)
- Already placed: `fixtures/oor/Acne_Free_Open_Order_Report_Week_of_08_17_2026.xls`, `fixtures/oor/AMBI_Open_Order_Shortage_Report_08_24_26.xlsx`

**Interfaces:**
- Produces: `type OorFormat = 'customer_open_order' | 'open_order_shortage'`; `detectFormat(headerRow: unknown[]): OorFormat` (throws `UnknownReportFormatError` naming the headers found); `interface SourceAdapter { load(input: SourceInput): Promise<ParsedReport> }`; `interface ParsedReport { reportType: OorFormat; reportLabel: string; asOfDate: Date | null; lines: ParsedLine[]; warnings: ParseWarning[] }`; `interface ParseWarning { rowNumber: number; column: string; rawValue: string; storedValue: string | null; reason: string }`.

- [ ] **Step 1: Add xlsx to the API package**

```bash
cd /Users/ahmadgeorge/Nexus-Collab && pnpm --filter @nexus/api add xlsx@^0.18.5
```

- [ ] **Step 2: Write the failing test**

```ts
// apps/api/src/services/oor/excel/detectFormat.test.ts
import { describe, it, expect } from 'vitest'
import { detectFormat, UnknownReportFormatError } from './detectFormat'

const FORMAT_A_HEADER = ['Customer PO Number','Order','Item#','Description','Qtys','RemQty','Price','Value','OrdDt','ShipDt','Orig Date','Req.Del','WO','Comments']
const FORMAT_B_HEADER = ['PO',"Order Date","Orig Req'd Date",'PartNum','Cust Part','Description',"Req'd Date",'Qty Due','Unit Price','Job Num','Lvl1 Part','Lvl2Part','Description','QTY Need','UOM','CP?','Mfg Comment']

describe('detectFormat', () => {
  it('detects the customer open order report by its signature headers', () => {
    expect(detectFormat(FORMAT_A_HEADER)).toBe('customer_open_order')
  })
  it('detects the shortage report by its signature headers', () => {
    expect(detectFormat(FORMAT_B_HEADER)).toBe('open_order_shortage')
  })
  it('names the headers it did find when it recognises neither', () => {
    expect(() => detectFormat(['Widget', 'Sprocket'])).toThrow(UnknownReportFormatError)
    expect(() => detectFormat(['Widget', 'Sprocket'])).toThrow(/Widget, Sprocket/)
  })
  it('is insensitive to case and surrounding whitespace', () => {
    expect(detectFormat(['  customer po number ', 'ORDER', 'remqty'])).toBe('customer_open_order')
  })
})
```

- [ ] **Step 3: Run it and watch it fail**

Run: `cd /Users/ahmadgeorge/Nexus-Collab && pnpm --filter @nexus/api exec vitest run src/services/oor/excel/detectFormat.test.ts`
Expected: FAIL — cannot resolve `./detectFormat`.

- [ ] **Step 4: Implement detection**

```ts
// apps/api/src/services/oor/excel/detectFormat.ts
export type OorFormat = 'customer_open_order' | 'open_order_shortage'

export class UnknownReportFormatError extends Error {
  constructor(found: string[]) {
    super(
      `Unrecognised Open Order Report format. Expected either "Customer PO Number" + "RemQty" ` +
        `(customer open order) or "Lvl1 Part" + "QTY Need" (shortage report). Headers found: ${found.join(', ')}`,
    )
    this.name = 'UnknownReportFormatError'
  }
}

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase()

export function detectFormat(headerRow: unknown[]): OorFormat {
  const cells = headerRow.map(norm)
  const has = (label: string) => cells.includes(label)
  if (has('customer po number') && has('remqty')) return 'customer_open_order'
  if (has('lvl1 part') && has('qty need')) return 'open_order_shortage'
  throw new UnknownReportFormatError(headerRow.map((c) => String(c ?? '')).filter(Boolean))
}
```

- [ ] **Step 5: Write the adapter seam**

```ts
// apps/api/src/services/oor/sourceAdapter.ts
import type { OorFormat } from './excel/detectFormat'

export interface ParseWarning {
  rowNumber: number
  column: string
  rawValue: string
  storedValue: string | null
  reason: string
}

export interface ParsedComment {
  body: string
  entryDate: Date | null
  authorInitials: string | null
}

export interface ParsedNode {
  level: 1 | 2
  sortIndex: number
  jobNumber: string | null
  partNumber: string | null
  description: string | null
  materialClass: 'BULK' | 'COMPONENT' | 'RAW_MATERIAL' | 'OTHER'
  componentType: string | null
  qtyNeeded: number | null
  uom: string | null
  customerProvided: boolean
  mfgComment: string | null
  etaDate: Date | null
  etaConfidence: 'confirmed' | 'estimated' | 'unknown'
  children: ParsedNode[]
  rawRow: Record<string, unknown>
}

export interface ParsedLine {
  customerPoNumber: string | null
  channelTag: string | null
  salesOrderNumber: string | null
  itemNumber: string | null
  custPartNumber: string | null
  description: string | null
  qtyOrdered: number | null
  qtyOrderedRaw: string | null
  qtyRemaining: number | null
  unitPrice: number | null
  valueSource: number | null
  valueComputed: number | null
  valueMismatch: boolean
  orderDate: Date | null
  shipDate: Date | null
  origRequiredDate: Date | null
  requiredDeliveryDate: Date | null
  workOrderNumber: string | null
  jobNumber: string | null
  fulfillmentType: 'CONTRACT_MFG' | 'INTERNAL' | 'MISC' | 'PASS_THROUGH'
  cmCode: string | null
  jobStatus: string | null
  comments: ParsedComment[]
  nodes: ParsedNode[]
  rawRow: Record<string, unknown>
  externalIds: Record<string, string>
}

export interface ParsedReport {
  reportType: OorFormat
  reportLabel: string
  asOfDate: Date | null
  lines: ParsedLine[]
  warnings: ParseWarning[]
}

export interface SourceInput {
  buffer?: Buffer
  filename?: string
  brandId: string
  orgId: string
}

/** The seam: an ERP or EDI feed replaces the file drop without touching the UI. */
export interface SourceAdapter {
  readonly key: string
  load(input: SourceInput): Promise<ParsedReport>
}
```

- [ ] **Step 6: Run the test and watch it pass**

Run: `pnpm --filter @nexus/api exec vitest run src/services/oor/excel/detectFormat.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 7: Commit**

```bash
git add fixtures/oor apps/api/package.json pnpm-lock.yaml apps/api/src/services/oor
git commit -m "feat(oor): fixtures, xlsx dependency, and the SourceAdapter seam"
```

---

### Task 2: Cell coercion and the Format A parser

**Files:**
- Create: `apps/api/src/services/oor/excel/cellCoercion.ts`
- Create: `apps/api/src/services/oor/excel/parseCustomerOpenOrder.ts`
- Test: `apps/api/src/services/oor/excel/cellCoercion.test.ts`, `apps/api/src/services/oor/excel/parseCustomerOpenOrder.test.ts`

**Interfaces:**
- Consumes: `ParsedLine`, `ParsedReport`, `ParseWarning` from Task 1.
- Produces: `coerceDate(value, ctx): { value: Date | null; warning?: ParseWarning }`; `coerceNumber(value, ctx): { value: number | null; raw: string | null; warning?: ParseWarning }`; `coerceCurrency(value, ctx)` (same shape, strips `$` and thousands separators, tolerates the `114.004.22` double-decimal form); `splitChannelTag(po: string): { poNumber: string; channelTag: string | null }`; `classifyFulfillment(itemNumber, workOrderNumber): ParsedLine['fulfillmentType']`; `parseCustomerOpenOrder(sheet: XLSX.WorkSheet, filename: string): ParsedReport`.

- [ ] **Step 1: Write the failing coercion tests**

```ts
// apps/api/src/services/oor/excel/cellCoercion.test.ts
import { describe, it, expect } from 'vitest'
import { coerceDate, coerceNumber, coerceCurrency, splitChannelTag, classifyFulfillment } from './cellCoercion'

const ctx = { rowNumber: 3, column: 'Orig Date' }

describe('coerceDate', () => {
  it('reads an Excel serial', () => {
    expect(coerceDate(46248, ctx).value?.toISOString().slice(0, 10)).toBe('2026-08-11')
  })
  it('reads the padded text form the report emits', () => {
    expect(coerceDate('7/ 2/26', ctx).value?.toISOString().slice(0, 10)).toBe('2026-07-02')
  })
  it('resolves both encodings of the same day identically', () => {
    expect(coerceDate(46205, ctx).value?.toISOString()).toBe(coerceDate('6/29/26', ctx).value?.toISOString())
  })
  it('warns rather than throwing on an unreadable value', () => {
    const r = coerceDate('sometime next quarter', ctx)
    expect(r.value).toBeNull()
    expect(r.warning?.reason).toMatch(/date/i)
  })
})

describe('coerceNumber', () => {
  it('keeps the raw text and warns on the stacked-quantity cell', () => {
    const r = coerceNumber('50000+\n16,400', { rowNumber: 30, column: 'Qtys' })
    expect(r.value).toBeNull()
    expect(r.raw).toBe('50000+\n16,400')
    expect(r.warning?.rawValue).toBe('50000+\n16,400')
  })
  it('strips thousands separators', () => {
    expect(coerceNumber('16,400', { rowNumber: 1, column: 'Qtys' }).value).toBe(16400)
  })
})

describe('coerceCurrency', () => {
  it('warns on the double-decimal typo and stores nothing numeric', () => {
    const r = coerceCurrency('$114.004.22', { rowNumber: 51, column: 'Value' })
    expect(r.value).toBeNull()
    expect(r.warning?.reason).toMatch(/currency/i)
  })
})

describe('splitChannelTag', () => {
  it.each([
    ['PO06302026>CMLEX LOI', 'PO06302026', 'CMLEX LOI'],
    ['P06282025>AMZ', 'P06282025', 'AMZ'],
    ['P06282025>Retail', 'P06282025', 'Retail'],
    ['P11192025', 'P11192025', null],
  ])('splits %s', (input, po, tag) => {
    expect(splitChannelTag(input)).toEqual({ poNumber: po, channelTag: tag })
  })
})

describe('classifyFulfillment', () => {
  it('classifies MISC lines', () => {
    expect(classifyFulfillment('MISC', null)).toBe('MISC')
  })
  it('classifies a line carrying a work order as contract manufacture', () => {
    expect(classifyFulfillment('S3977101A', 'W0100133948')).toBe('CONTRACT_MFG')
  })
  it('classifies a line with neither as internal', () => {
    expect(classifyFulfillment('S3976205', null)).toBe('INTERNAL')
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm --filter @nexus/api exec vitest run src/services/oor/excel/cellCoercion.test.ts`
Expected: FAIL — cannot resolve `./cellCoercion`.

- [ ] **Step 3: Implement coercion**

Implement each exported function to satisfy the tests. Notes that matter:
`coerceDate` accepts `number` (Excel serial, 1900 system, via `XLSX.SSF.parse_date_code`) and `string`; the string branch collapses internal whitespace before matching `M/D/YY`, `M/D/YYYY`, `MM-DD-YY`; two-digit years map to 2000+. `coerceCurrency` rejects a string containing more than one decimal point rather than guessing which one is the thousands separator. Every failure path returns `{ value: null, warning }` — nothing in this file throws.

- [ ] **Step 4: Run and watch it pass**

Run: `pnpm --filter @nexus/api exec vitest run src/services/oor/excel/cellCoercion.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing Format A parser test, against the real fixture**

```ts
// apps/api/src/services/oor/excel/parseCustomerOpenOrder.test.ts
import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import * as XLSX from 'xlsx'
import { parseCustomerOpenOrder } from './parseCustomerOpenOrder'
import type { ParsedReport } from '../sourceAdapter'

const FIXTURE = path.resolve(__dirname, '../../../../../../fixtures/oor/Acne_Free_Open_Order_Report_Week_of_08_17_2026.xls')

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
    expect(total).toBe(465693)
  })
  it('classifies the 8 MISC lines', () => {
    expect(report.lines.filter((l) => l.fulfillmentType === 'MISC')).toHaveLength(8)
  })
  it('extracts every channel tag present', () => {
    const tags = new Set(report.lines.map((l) => l.channelTag).filter(Boolean))
    expect(tags).toEqual(new Set(['AMZ', 'Retail', 'CMLEX LOI']))
  })
  it('resolves both date encodings — 17 serials and 33 text cells — into real dates', () => {
    const withOrig = report.lines.filter((l) => l.origRequiredDate !== null)
    expect(withOrig).toHaveLength(50)
    expect(withOrig.every((l) => l.origRequiredDate instanceof Date)).toBe(true)
  })
  it('flags all 10 rows where the source Value disagrees with RemQty x Price', () => {
    expect(report.lines.filter((l) => l.valueMismatch)).toHaveLength(10)
  })
  it('recomputes value rather than trusting the source', () => {
    const line = report.lines.find((l) => l.salesOrderNumber === 'S0100057780')!
    expect(line.valueSource).toBe(149400)
    expect(line.valueComputed).toBeCloseTo(62210.16, 2)
    expect(line.valueMismatch).toBe(true)
  })
  it('keeps the dirty quantity as raw text and warns, without throwing', () => {
    const line = report.lines.find((l) => l.qtyOrderedRaw?.includes('50000+'))!
    expect(line.qtyOrdered).toBeNull()
    expect(report.warnings.some((w) => w.column === 'Qtys')).toBe(true)
  })
  it('never discards a comment cell', () => {
    const withComments = report.lines.filter((l) => l.comments.length > 0)
    expect(withComments).toHaveLength(46)
  })
})
```

- [ ] **Step 6: Run and watch it fail**

Run: `pnpm --filter @nexus/api exec vitest run src/services/oor/excel/parseCustomerOpenOrder.test.ts`
Expected: FAIL — cannot resolve `./parseCustomerOpenOrder`.

- [ ] **Step 7: Implement the Format A parser**

Header is row 2 (`A1` holds `Customer:` / the customer name). Map the 14 columns by their exact labels rather than by index, so a column insertion upstream does not silently shift the data. For each data row: split the PO on `>`, coerce every typed cell through Task 2's helpers, compute `valueComputed = qtyRemaining * unitPrice`, set `valueMismatch` when the source value is absent-but-expected or differs by more than $0.02, classify fulfillment, and hand the `Comments` cell to Task 3's splitter. Rows with neither a PO nor an order number are skipped as spacing.

- [ ] **Step 8: Run and watch it pass**

Run: `pnpm --filter @nexus/api exec vitest run src/services/oor/excel/parseCustomerOpenOrder.test.ts`
Expected: PASS, 8 tests. If the `RemQty` total assertion fails, print the parsed total and correct the expectation to the measured value — the fixture is the authority, not this plan.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/services/oor/excel
git commit -m "feat(oor): dirty-cell coercion and the customer open order parser"
```

---

### Task 3: The legacy comment splitter

**Files:**
- Create: `apps/api/src/services/oor/excel/legacyComments.ts`
- Test: `apps/api/src/services/oor/excel/legacyComments.test.ts`

**Interfaces:**
- Consumes: `ParsedComment` from Task 1.
- Produces: `splitLegacyComments(cell: string | null | undefined): ParsedComment[]`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/services/oor/excel/legacyComments.test.ts
import { describe, it, expect } from 'vitest'
import { splitLegacyComments } from './legacyComments'

describe('splitLegacyComments', () => {
  it('parses the canonical dated entry with trailing initials', () => {
    const out = splitLegacyComments('08.18.2026 - Fill date 09.21.2026. Ship date 10.01.2026. Chemical issue resolved and is tracking for 9/21 fill date. AD')
    expect(out).toHaveLength(1)
    expect(out[0].entryDate?.toISOString().slice(0, 10)).toBe('2026-08-18')
    expect(out[0].authorInitials).toBe('AD')
    expect(out[0].body).toMatch(/^Fill date 09\.21\.2026\./)
    expect(out[0].body).not.toMatch(/AD$/)
  })
  it('accepts the single-digit month form', () => {
    const out = splitLegacyComments('8.18.2026 - Fill date 07.21.2026.  Ship date 07.31.2026.  AD')
    expect(out[0].entryDate?.toISOString().slice(0, 10)).toBe('2026-08-18')
  })
  it('splits a stacked cell into one comment per dated entry, newest first preserved as source order', () => {
    const out = splitLegacyComments('8.18.2026 - Moved out due to comps. AD  6.8 Moved out due to start date of 07/02. 5.10 customer sent revised PO.')
    expect(out.length).toBeGreaterThan(1)
    expect(out[0].entryDate?.toISOString().slice(0, 10)).toBe('2026-08-18')
  })
  it('keeps unparseable text as one comment with no date rather than discarding it', () => {
    const out = splitLegacyComments('waiting on the customer to confirm artwork')
    expect(out).toHaveLength(1)
    expect(out[0].entryDate).toBeNull()
    expect(out[0].body).toBe('waiting on the customer to confirm artwork')
  })
  it('returns nothing for an empty cell', () => {
    expect(splitLegacyComments('')).toEqual([])
    expect(splitLegacyComments(null)).toEqual([])
  })
  it('never loses characters', () => {
    const cell = '08.18.2026 - first entry. AD 07.01.2026 - second entry. AC'
    const joined = splitLegacyComments(cell).map((c) => c.body).join(' ')
    expect(joined).toContain('first entry')
    expect(joined).toContain('second entry')
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm --filter @nexus/api exec vitest run src/services/oor/excel/legacyComments.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the splitter**

Split on a lookahead for `\b\d{1,2}\.\d{1,2}\.\d{4}\s*-\s*`, keeping the delimiter with the following segment. Trailing 2–3 uppercase letters at the end of a segment become `authorInitials` and are stripped from the body. Text before the first delimiter, if any, becomes a leading comment with a null `entryDate`. Assert to yourself that the concatenated bodies plus stripped markers account for the whole input — the spec's rule is that no text is ever discarded.

- [ ] **Step 4: Run and watch it pass**

Run: `pnpm --filter @nexus/api exec vitest run src/services/oor/excel/legacyComments.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Wire it into the Format A parser and re-run Task 2's suite**

Run: `pnpm --filter @nexus/api exec vitest run src/services/oor/excel`
Expected: PASS, all three files.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/oor/excel
git commit -m "feat(oor): split legacy stacked comment cells into structured entries"
```

---

### Task 4: The Format B parser and hierarchy reconstruction

**Files:**
- Create: `apps/api/src/services/oor/excel/parseShortageReport.ts`
- Create: `apps/api/src/services/oor/excel/excelSourceAdapter.ts`
- Test: `apps/api/src/services/oor/excel/parseShortageReport.test.ts`

**Interfaces:**
- Consumes: `ParsedReport`, `ParsedNode` (Task 1), coercion helpers (Task 2).
- Produces: `parseShortageReport(sheet: XLSX.WorkSheet, filename: string): ParsedReport`; `classifyMaterial(description: string): { materialClass: ParsedNode['materialClass']; componentType: string | null }`; `class ExcelSourceAdapter implements SourceAdapter`.

- [ ] **Step 1: Write the failing test, against the real fixture**

```ts
// apps/api/src/services/oor/excel/parseShortageReport.test.ts
import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import * as XLSX from 'xlsx'
import { parseShortageReport } from './parseShortageReport'
import type { ParsedReport, ParsedNode } from '../sourceAdapter'

const FIXTURE = path.resolve(__dirname, '../../../../../../fixtures/oor/AMBI_Open_Order_Shortage_Report_08_24_26.xlsx')

let report: ParsedReport
const all = (ns: ParsedNode[]): ParsedNode[] => ns.flatMap((n) => [n, ...all(n.children)])

beforeAll(() => {
  const wb = XLSX.read(fs.readFileSync(FIXTURE), { cellNF: true })
  report = parseShortageReport(wb.Sheets['CUstShortSSRS'], path.basename(FIXTURE))
})

describe('parseShortageReport against the AMBI fixture', () => {
  it('reconstructs 7 PO lines, 33 job materials and 80 raw materials', () => {
    expect(report.lines).toHaveLength(7)
    const nodes = report.lines.flatMap((l) => all(l.nodes))
    expect(nodes.filter((n) => n.level === 1)).toHaveLength(33)
    expect(nodes.filter((n) => n.level === 2)).toHaveLength(80)
  })
  it('attaches every level-2 node to a level-1 parent, never to a line directly', () => {
    for (const line of report.lines) {
      for (const top of line.nodes) expect(top.level).toBe(1)
      for (const child of line.nodes.flatMap((n) => n.children)) expect(child.level).toBe(2)
    }
  })
  it('carries the job number forward onto child rows that omit it', () => {
    const nodes = report.lines.flatMap((l) => all(l.nodes))
    expect(nodes.every((n) => n.jobNumber !== null && n.jobNumber !== '')).toBe(true)
  })
  it('flags all 7 customer-provided materials', () => {
    const nodes = report.lines.flatMap((l) => all(l.nodes))
    expect(nodes.filter((n) => n.customerProvided)).toHaveLength(7)
  })
  it('classifies materials by their description prefix', () => {
    const nodes = report.lines.flatMap((l) => all(l.nodes))
    expect(nodes.filter((n) => n.materialClass === 'BULK')).toHaveLength(7)
    expect(nodes.filter((n) => n.materialClass === 'COMPONENT')).toHaveLength(26)
    expect(nodes.filter((n) => n.materialClass === 'RAW_MATERIAL')).toHaveLength(80)
  })
  it('extracts the component type from the description', () => {
    const nodes = report.lines.flatMap((l) => all(l.nodes))
    const tube = nodes.find((n) => n.description?.includes('TUBE'))
    expect(tube?.componentType).toBe('TUBE')
  })
  it('preserves the hot-fill instruction with its line breaks intact', () => {
    const nodes = report.lines.flatMap((l) => all(l.nodes))
    const hotFill = nodes.find((n) => n.mfgComment?.includes('HOT FILL'))!
    expect(hotFill.mfgComment).toContain('***HOT FILL***')
    expect(hotFill.mfgComment).toContain('\n')
    expect(hotFill.mfgComment).toMatch(/TRANSFER TEMPERATURE: 78 – 80\*C/)
  })
  it('reads a bare date in Mfg Comment as an estimated ETA rather than choking on it', () => {
    const nodes = report.lines.flatMap((l) => all(l.nodes))
    const dated = nodes.filter((n) => n.etaDate !== null)
    expect(dated).toHaveLength(49)
    expect(dated.every((n) => n.etaConfidence === 'estimated')).toBe(true)
    expect(dated.every((n) => n.mfgComment === null || !/^\d+$/.test(n.mfgComment))).toBe(true)
  })
  it('keeps a Qty Due that appears on a child row', () => {
    const split = report.lines.find((l) => l.qtyRemaining === 14000)!
    expect(all(split.nodes).some((n) => n.rawRow['Qty Due'] === 7000)).toBe(true)
  })
  it('reports no unclassified rows', () => {
    const counted = report.lines.length + report.lines.flatMap((l) => all(l.nodes)).length
    expect(counted).toBe(120)
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm --filter @nexus/api exec vitest run src/services/oor/excel/parseShortageReport.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the parser**

Title in `A1`, header on row 2, data from row 3. Walk rows top-down holding `currentLine` and `currentLevel1`. A populated `PO` opens a new line and resets `currentLevel1`. Otherwise a populated `Lvl1 Part` opens a level-1 node on `currentLine`; a populated `Lvl2Part` appends to `currentLevel1` (and is a parse warning if there is none). Carry `Job Num` forward from the last row that had one. `sortIndex` is the source row index, so export can reproduce order exactly. `CP?` is `Y` case-insensitively. `Mfg Comment` that is a number, or a string of only digits, is an Excel serial: coerce to `etaDate` with `etaConfidence: 'estimated'` and leave `mfgComment` null; anything else is preserved verbatim including `\r\n`, normalised to `\n`. `classifyMaterial` reads the description prefix before the first comma (`Bulk` / `Components` / `Raw Materials`) and, for components, matches the second segment against `TUBE|UNIT CARTON|PAD|SHIPPER|BOTTLE|PUMP|FRONT LABEL|BACK LABEL`.

- [ ] **Step 4: Run and watch it pass**

Run: `pnpm --filter @nexus/api exec vitest run src/services/oor/excel/parseShortageReport.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Implement ExcelSourceAdapter and test both fixtures route correctly**

```ts
// apps/api/src/services/oor/excel/excelSourceAdapter.ts
import * as XLSX from 'xlsx'
import type { SourceAdapter, SourceInput, ParsedReport } from '../sourceAdapter'
import { detectFormat } from './detectFormat'
import { parseCustomerOpenOrder } from './parseCustomerOpenOrder'
import { parseShortageReport } from './parseShortageReport'

export class ExcelSourceAdapter implements SourceAdapter {
  readonly key = 'excel'
  async load(input: SourceInput): Promise<ParsedReport> {
    if (!input.buffer) throw new Error('ExcelSourceAdapter requires a file buffer')
    const wb = XLSX.read(input.buffer, { cellNF: true })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, blankrows: false })
    const format = detectFormat((rows[1] ?? rows[0]) as unknown[])
    return format === 'customer_open_order'
      ? parseCustomerOpenOrder(sheet, input.filename ?? 'upload')
      : parseShortageReport(sheet, input.filename ?? 'upload')
  }
}
```

- [ ] **Step 6: Run the whole parser suite**

Run: `pnpm --filter @nexus/api exec vitest run src/services/oor`
Expected: PASS, all files.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/oor
git commit -m "feat(oor): shortage report parser with hierarchy reconstruction"
```

> **CHECKPOINT — stop here and show Ahmad the output.** Print the parse summary for both fixtures (line counts, node counts by level, warning list) before continuing. This is the spec's step-2 gate.

---

### Task 5: Schema, boot ensure, and RBAC

**Files:**
- Modify: `packages/prisma/prisma/schema.prisma`
- Create: `packages/shared/src/oor/status.ts`
- Modify: `packages/shared/src/rbac/catalogue.ts`
- Create: `apps/api/src/services/oor/bootstrap.ts`
- Modify: `apps/api/src/index.ts` (add `ensureOorModule` to the `start()` ensure chain, after `ensureDepartmentStructure`)
- Test: `apps/api/src/services/oor/bootstrap.test.ts`

**Interfaces:**
- Produces: models `OorReportRun`, `OorLine`, `OorShortageNode`, `OorComment`, `OorNote`, `OorMeetingUpdate`; `ensureOorModule(prisma): Promise<string>` returning the module id; `OOR_LINE_STATUSES`, `OOR_SHORTAGE_REASONS`, `OOR_RISK_LEVELS` const arrays plus their union types.

- [ ] **Step 1: Add the shared vocabulary**

```ts
// packages/shared/src/oor/status.ts
export const OOR_LINE_STATUSES = [
  'OPEN', 'IN_PRODUCTION', 'SHORT_MATERIAL', 'AWAITING_COMPONENT', 'AWAITING_ARTWORK',
  'AWAITING_CUSTOMER_APPROVAL', 'ON_HOLD_QC', 'FILLED_AWAITING_PICKUP', 'PARTIAL_SHIP',
  'SHIPPED', 'CLOSED', 'CANCELLED',
] as const
export type OorLineStatus = (typeof OOR_LINE_STATUSES)[number]

export const OOR_SHORTAGE_REASONS = [
  'RAW_MATERIAL_DELAY', 'COMPONENT_DELAY', 'BULK_NOT_MADE', 'ARTWORK_PENDING', 'MOQ_CONSTRAINT',
  'CAPACITY', 'QC_HOLD', 'COST_ROLL_PENDING', 'CUSTOMER_PROVIDED_PENDING', 'VENDOR_ETA_UNKNOWN', 'NONE',
] as const
export type OorShortageReason = (typeof OOR_SHORTAGE_REASONS)[number]

export const OOR_RISK_LEVELS = ['on_track', 'at_risk', 'critical'] as const
export type OorRiskLevel = (typeof OOR_RISK_LEVELS)[number]

/** Labels and token names for the status pill. Kept beside the vocabulary so
 *  the API and the grid cannot disagree about what a status is called. */
export const OOR_STATUS_META: Record<OorLineStatus, { label: string; tone: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' }> = {
  OPEN: { label: 'Open', tone: 'neutral' },
  IN_PRODUCTION: { label: 'In Production', tone: 'accent' },
  SHORT_MATERIAL: { label: 'Short Material', tone: 'danger' },
  AWAITING_COMPONENT: { label: 'Awaiting Component', tone: 'danger' },
  AWAITING_ARTWORK: { label: 'Awaiting Artwork', tone: 'warning' },
  AWAITING_CUSTOMER_APPROVAL: { label: 'Awaiting Customer Approval', tone: 'warning' },
  ON_HOLD_QC: { label: 'On Hold — QC', tone: 'warning' },
  FILLED_AWAITING_PICKUP: { label: 'Filled — Awaiting Pickup', tone: 'success' },
  PARTIAL_SHIP: { label: 'Partial Ship', tone: 'accent' },
  SHIPPED: { label: 'Shipped', tone: 'success' },
  CLOSED: { label: 'Closed', tone: 'neutral' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
}
```

- [ ] **Step 2: Add the RBAC group**

In `packages/shared/src/rbac/catalogue.ts`, append to `PERMISSION_GROUPS`:

```ts
  {
    resource: 'oor',
    items: [
      { key: 'oor:read', label: 'View open order report', description: 'See open PO lines, their shortage trees, and the collaboration history' },
      { key: 'oor:edit_status', label: 'Override line status', description: 'Set a line status manually, with a reason recorded in the audit trail' },
      { key: 'oor:edit_tree', label: 'Edit shortage tree', description: 'Update on-hand quantities, ETAs, shortage reasons and manufacturing comments' },
      { key: 'oor:comment', label: 'Comment on lines', description: 'Add comments, notes, meeting updates and emails to a line' },
      { key: 'oor:import', label: 'Import reports', description: 'Upload an open order or shortage report file' },
      { key: 'oor:export', label: 'Export reports', description: 'Download the report as Excel' },
      { key: 'oor:admin', label: 'Administer OOR', description: 'Delete imports and edit content authored by others' },
    ],
  },
```

Grant `oor:read`/`oor:comment` to MEMBER and above, the edit and import keys to OPS_MANAGER and ADMIN, and `oor:admin` to ADMIN, following the role grants already expressed in that file.

- [ ] **Step 3: Add the Prisma models**

Append to `packages/prisma/prisma/schema.prisma`. Note `orgId` on every root record, cuid ids, camelCase fields, and the indexes the spec calls for translated to Prisma form.

```prisma
model OorReportRun {
  id                String     @id @default(cuid())
  orgId             String
  brandId           String?
  reportType        String     // customer_open_order | open_order_shortage
  reportLabel       String
  asOfDate          DateTime?
  sourceFilename    String
  sourceFileHash    String
  sourceAdapter     String     @default("excel")
  importedById      String?
  importedAt        DateTime   @default(now())
  rowCount          Int        @default(0)
  parseWarningCount Int        @default(0)
  parseWarnings     Json       @default("[]")
  status            String     @default("importing") // importing | ready | failed
  notes             String?
  lines             OorLine[]

  @@unique([orgId, sourceFileHash])
  @@index([orgId, importedAt(sort: Desc)])
}

model OorLine {
  id                   String             @id @default(cuid())
  orgId                String
  brandId              String?
  reportRunId          String?
  reportRun            OorReportRun?      @relation(fields: [reportRunId], references: [id])
  customerPoNumber     String?
  channelTag           String?
  salesOrderNumber     String?
  itemNumber           String?
  custPartNumber       String?
  description          String?
  qtyOrdered           Decimal?           @db.Decimal(18, 4)
  qtyOrderedRaw        String?
  qtyRemaining         Decimal?           @db.Decimal(18, 4)
  unitPrice            Decimal?           @db.Decimal(18, 4)
  valueSource          Decimal?           @db.Decimal(18, 4)
  valueComputed        Decimal?           @db.Decimal(18, 4)
  valueMismatch        Boolean            @default(false)
  orderDate            DateTime?
  shipDate             DateTime?
  origRequiredDate     DateTime?
  requiredDeliveryDate DateTime?
  workOrderNumber      String?
  jobNumber            String?
  fulfillmentType      String             @default("INTERNAL")
  cmCode               String?
  jobStatus            String?
  lineStatus           String             @default("OPEN")
  statusSource         String             @default("derived") // derived | manual
  statusOverrideReason String?
  riskLevel            String             @default("on_track")
  ownerId              String?
  isOpen               Boolean            @default(true)
  closedAt             DateTime?
  externalIds          Json               @default("{}")
  rawRow               Json               @default("{}")
  parseWarnings        Json               @default("[]")
  createdAt            DateTime           @default(now())
  updatedAt            DateTime           @updatedAt
  createdById          String?
  updatedById          String?
  nodes                OorShortageNode[]
  comments             OorComment[]
  notes                OorNote[]
  meetingUpdates       OorMeetingUpdate[]

  @@unique([orgId, brandId, customerPoNumber, salesOrderNumber, itemNumber])
  @@index([orgId, brandId, isOpen, requiredDeliveryDate])
  @@index([orgId, fulfillmentType, jobStatus])
  @@index([reportRunId])
}

model OorShortageNode {
  id               String            @id @default(cuid())
  oorLineId        String
  oorLine          OorLine           @relation(fields: [oorLineId], references: [id], onDelete: Cascade)
  parentNodeId     String?
  parentNode       OorShortageNode?  @relation("NodeChildren", fields: [parentNodeId], references: [id])
  children         OorShortageNode[] @relation("NodeChildren")
  level            Int
  jobNumber        String?
  partNumber       String?
  description      String?
  materialClass    String            @default("OTHER")
  componentType    String?
  qtyNeeded        Decimal?          @db.Decimal(18, 4)
  uom              String?
  qtyOnHand        Decimal?          @db.Decimal(18, 4)
  onHandLocation   String?
  customerProvided Boolean           @default(false)
  mfgComment       String?
  shortageReason   String            @default("NONE")
  etaDate          DateTime?
  etaConfidence    String            @default("unknown")
  nodeStatus       String            @default("OPEN")
  sortIndex        Int               @default(0)
  rawRow           Json              @default("{}")
  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt
  comments         OorComment[]

  @@index([oorLineId, level, sortIndex])
  @@index([parentNodeId])
}

model OorComment {
  id              String           @id @default(cuid())
  oorLineId       String
  oorLine         OorLine          @relation(fields: [oorLineId], references: [id], onDelete: Cascade)
  shortageNodeId  String?
  shortageNode    OorShortageNode? @relation(fields: [shortageNodeId], references: [id])
  body            String
  entryDate       DateTime?
  authorId        String?
  authorInitials  String?
  source          String           @default("app") // app | imported_legacy | email | meeting
  isPinned        Boolean          @default(false)
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt
  editedAt        DateTime?
  deletedAt       DateTime?

  @@index([oorLineId, createdAt(sort: Desc)])
  @@index([shortageNodeId])
}

model OorNote {
  id          String    @id @default(cuid())
  oorLineId   String
  oorLine     OorLine   @relation(fields: [oorLineId], references: [id], onDelete: Cascade)
  title       String
  body        String
  category    String?
  isPinned    Boolean   @default(false)
  authorId    String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  deletedAt   DateTime?

  @@index([oorLineId, createdAt(sort: Desc)])
}

model OorMeetingUpdate {
  id           String    @id @default(cuid())
  oorLineId    String
  oorLine      OorLine   @relation(fields: [oorLineId], references: [id], onDelete: Cascade)
  meetingDate  DateTime
  meetingTitle String?
  attendees    Json      @default("[]")
  decision     String?
  nextAction   String?
  ownerId      String?
  dueDate      DateTime?
  status       String    @default("open") // open | done | carried_over
  body         String?
  authorId     String?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  deletedAt    DateTime?

  @@index([oorLineId, meetingDate(sort: Desc)])
  @@index([status, dueDate])
}
```

- [ ] **Step 4: Check the diff before pushing it**

Run:
```bash
cd /Users/ahmadgeorge/Nexus-Collab/packages/prisma && npx prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script | head -60
```
Expected: only `CREATE TABLE` statements for the six new models plus their indexes, and the known pre-existing `TransitionSku` drift. If it proposes dropping anything else, stop and report.

- [ ] **Step 5: Push the schema and regenerate the client**

```bash
cd /Users/ahmadgeorge/Nexus-Collab/packages/prisma && npx prisma db push && npx prisma generate
```

- [ ] **Step 6: Write the boot-ensure test**

```ts
// apps/api/src/services/oor/bootstrap.test.ts
import { describe, it, expect, vi } from 'vitest'
import { ensureOorModule, OOR_MODULE_TYPE } from './bootstrap'

describe('ensureOorModule', () => {
  it('creates the module once and is idempotent on a second boot', async () => {
    const findFirst = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: 'mod_1', type: OOR_MODULE_TYPE })
    const create = vi.fn().mockResolvedValue({ id: 'mod_1' })
    const prisma: any = {
      department: { findFirst: vi.fn().mockResolvedValue({ id: 'dept_ops' }) },
      departmentModule: { findFirst, create },
    }
    expect(await ensureOorModule(prisma)).toBe('mod_1')
    expect(await ensureOorModule(prisma)).toBe('mod_1')
    expect(create).toHaveBeenCalledTimes(1)
  })
  it('no-ops without an Operations department rather than inventing one', async () => {
    const prisma: any = {
      department: { findFirst: vi.fn().mockResolvedValue(null) },
      departmentModule: { findFirst: vi.fn(), create: vi.fn() },
    }
    expect(await ensureOorModule(prisma)).toBeNull()
  })
})
```

- [ ] **Step 7: Run it, watch it fail, implement `bootstrap.ts`, run it again**

Run: `pnpm --filter @nexus/api exec vitest run src/services/oor/bootstrap.test.ts`
`ensureOorModule` finds the Operations department by the same lookup `ensureDepartmentStructure` uses, finds-or-creates a `DepartmentModule` with `type: 'OPEN_ORDER_REPORT'`, `name: 'Open Order Report'`, and returns its id. Then add the call to `start()` in `apps/api/src/index.ts` immediately after `await ensureDepartmentStructure(prisma)`.
Expected: PASS, 2 tests.

- [ ] **Step 8: Boot the API and confirm the ensure runs clean**

Run: `cd /Users/ahmadgeorge/Nexus-Collab && set -a && source .env && set +a && pnpm --filter @nexus/api dev`
Expected: startup log shows the OOR module ensured, no error, API listening on 3000.

- [ ] **Step 9: Commit**

```bash
git add packages/prisma/prisma/schema.prisma packages/shared/src apps/api/src/services/oor apps/api/src/index.ts
git commit -m "feat(oor): schema, shared status vocabulary, RBAC permissions and boot ensure"
```

---

### Task 6: Import run — hashing, idempotency, and upsert that never touches user content

**Files:**
- Create: `apps/api/src/services/oor/importRun.ts`
- Create: `apps/api/src/services/oor/erpSourceAdapter.ts`
- Test: `apps/api/src/services/oor/importRun.test.ts`

**Interfaces:**
- Consumes: `SourceAdapter`, `ParsedReport` (Task 1), models (Task 5).
- Produces: `runImport(prisma, adapter: SourceAdapter, input: SourceInput & { importedById: string | null }): Promise<{ runId: string; created: number; updated: number; warnings: ParseWarning[]; duplicateOfRunId?: string }>`; `class ErpSourceAdapter implements SourceAdapter`.

- [ ] **Step 1: Write the failing test**

Cover, with a real Postgres-backed Prisma client against the local `nexus` database: (a) importing the AcneFree fixture creates 51 `OorLine` rows and one `OorReportRun` with `status: 'ready'`; (b) importing the same buffer twice returns `duplicateOfRunId` and creates no second run; (c) a line that already carries a comment, a note, a meeting update and an `Attachment` email keeps all four after a re-import that changes its `qtyRemaining`; (d) a re-import refreshes report-sourced fields (`qtyRemaining`, `requiredDeliveryDate`) but leaves `lineStatus` alone when `statusSource === 'manual'`; (e) importing the AMBI fixture creates 7 lines and 113 nodes, and re-importing replaces the node tree wholesale while preserving node-attached comments by `(jobNumber, partNumber, level)`.

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm --filter @nexus/api exec vitest run src/services/oor/importRun.test.ts`

- [ ] **Step 3: Implement `runImport`**

`sourceFileHash` is `sha256` of the buffer. Look up `OorReportRun` by `(orgId, sourceFileHash)` first and return early with `duplicateOfRunId` if found. Create the run as `status: 'importing'`, then upsert each line on `(orgId, brandId, customerPoNumber, salesOrderNumber, itemNumber)`. **Report-sourced fields only**: quantities, prices, dates, work order, job number, fulfillment, raw row, parse warnings. Never write `lineStatus` when `statusSource === 'manual'`; never touch `ownerId`, comments, notes, meeting updates, or attachments. Legacy comments are inserted only when no comment with the same `(entryDate, body)` already exists, so re-import does not duplicate the thread. Shortage nodes are deleted and recreated per line (they carry no user-authored fields except `mfgComment`, `qtyOnHand`, `etaDate`, `shortageReason` — carry those forward by matching `(level, jobNumber, partNumber)` before delete). Finish by setting `status: 'ready'`, `rowCount`, `parseWarningCount`, `parseWarnings`.

- [ ] **Step 4: Run and watch it pass**

Run: `pnpm --filter @nexus/api exec vitest run src/services/oor/importRun.test.ts`

- [ ] **Step 5: Implement `ErpSourceAdapter`**

Wrap the existing `mapErpOpenOrder` from `apps/api/src/lib/erpOpenOrders.ts` into `ParsedLine[]`, setting `externalIds: { erpPoId }` and `fulfillmentType: 'CONTRACT_MFG'` where a manufacturer is present. No new ERP calls in this task — the adapter takes already-fetched `ErpOpenOrder[]`. This proves the seam works and is what Task 17 switches the old Open Orders mode onto.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/oor
git commit -m "feat(oor): idempotent import runs that never overwrite user-authored content"
```

---

### Task 7: Status and risk derivation

**Files:**
- Create: `apps/api/src/services/oor/deriveStatus.ts`
- Test: `apps/api/src/services/oor/deriveStatus.test.ts`

**Interfaces:**
- Consumes: `OorLineStatus`, `OorRiskLevel` (Task 5).
- Produces: `deriveLineStatus(input: DeriveInput): OorLineStatus`; `deriveRiskLevel(input: DeriveInput, today: Date): OorRiskLevel`; `interface DeriveInput { qtyRemaining: number | null; manualStatus: OorLineStatus | null; nodes: { level: number; materialClass: string; componentType: string | null; qtyNeeded: number | null; qtyOnHand: number | null; customerProvided: boolean; nodeStatus: string; etaDate: Date | null }[]; requiredDeliveryDate: Date | null }`.

- [ ] **Step 1: Write the failing test**

One test per rule, in precedence order: manual override wins over everything; an unresolved `customerProvided` node yields `AWAITING_CUSTOMER_APPROVAL` even when a raw material is also short; a short `COMPONENT` whose `componentType` is a label type yields `AWAITING_ARTWORK`; any other short `COMPONENT` yields `AWAITING_COMPONENT`; a short `RAW_MATERIAL` yields `SHORT_MATERIAL`; nothing short with nodes present yields `IN_PRODUCTION`; no nodes at all yields `OPEN`. Then risk: unknown blocker ETA → `critical`; blocker ETA after the required date → `critical`; required date within 14 days → `at_risk`; otherwise `on_track`. Pass `today` explicitly — never read the clock inside the function.

- [ ] **Step 2: Run, fail, implement as a single pure function, run, pass**

Run: `pnpm --filter @nexus/api exec vitest run src/services/oor/deriveStatus.test.ts`

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/oor/deriveStatus.ts apps/api/src/services/oor/deriveStatus.test.ts
git commit -m "feat(oor): pure status and risk derivation"
```

---

### Task 8: Lines API

**Files:**
- Create: `apps/api/src/routes/oor.ts`
- Modify: `apps/api/src/index.ts` (mount `oorRoutes` at `/api/operations/oor`)
- Test: `apps/api/src/routes/oor.lines.test.ts`

**Interfaces:**
- Produces: `GET /lines`, `GET /lines/:id`, `GET /lines/:id/tree`, `PATCH /lines/:id`, `PATCH /nodes/:id`, `POST /imports`, `GET /imports/:id`.

- [ ] **Step 1: Write the failing integration test**

Assert: filtering by `status[]`, `risk[]`, `fulfillment_type`, `cm_code`, `search` (across PO, SO, item, description), `required_before`, `has_shortage`; pagination returns `{ rows, total, page, pageSize }` and `total` reflects the filter, not the page; sorting by each sortable column both directions; `PATCH /lines/:id` with a status override writes an `AuditLog` row with `entityType: 'oor_line'` and `changes: { lineStatus: { from, to } }` and sets `statusSource: 'manual'`; a status override without a reason is rejected 422; `PATCH /nodes/:id` writes its own audit row; every route without `oor:read` is 403.

- [ ] **Step 2: Run, fail, implement, run, pass**

Zod schemas for every query and body, mirroring `members.schema.ts`. `requirePermission('oor:read')` on reads, `oor:edit_status` / `oor:edit_tree` on the PATCHes, `oor:import` on the import. Every list query is a single Prisma query with `skip`/`take` and a parallel `count` — never fetch-then-filter in Node. `POST /imports` uses multer memoryStorage with `UPLOAD_MAX_BYTES` exactly as `inventoryImport.ts` does, then calls `runImport` with `ExcelSourceAdapter`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/oor.ts apps/api/src/routes/oor.lines.test.ts apps/api/src/index.ts
git commit -m "feat(oor): lines, tree, import and status-override endpoints"
```

---

### Task 9: Collaboration API

**Files:**
- Modify: `apps/api/src/routes/oor.ts`
- Create: `apps/api/src/services/oor/activityFeed.ts`
- Test: `apps/api/src/routes/oor.collab.test.ts`, `apps/api/src/services/oor/activityFeed.test.ts`

**Interfaces:**
- Produces: comments/notes/meeting-updates CRUD, `POST /lines/:id/emails`, `GET /lines/:id/emails/:emailId`, `GET /lines/:id/activity`; `buildActivityFeed(parts): ActivityEntry[]` where `ActivityEntry = { kind: 'comment' | 'note' | 'meeting' | 'email' | 'status'; at: Date; actor: string | null; summary: string; payload: unknown }`.

- [ ] **Step 1: Write the failing tests**

Comments: create, list newest-first paginated, edit within a 15-minute window by the author only, soft delete sets `deletedAt` and the row disappears from the list but remains countable by an `oor:admin` query. Emails: posting raw pasted text parses `From:`/`To:`/`Subject:`/`Date:` headers when present and stores an `Attachment` with `attachableType: 'oor_line'`, `type: 'email'`; uploading a `.eml` parses headers, body and attachment count; both increment the line's activity counts. Meeting updates: create with owner and due date; an overdue open next-action is returned by the list endpoint's `overdue: true` flag. Activity: merges all five kinds into one reverse-chronological list and filters by kind.

- [ ] **Step 2: Run, fail, implement, run, pass**

`mailparser` is not currently an API dependency — parse `.eml` with it (`pnpm --filter @nexus/api add mailparser@^3.9.14`) or hand-parse headers if you prefer no new dependency; if you add it, say so in the commit message. `buildActivityFeed` is pure and takes already-fetched arrays so it can be unit-tested without a database.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/oor.ts apps/api/src/services/oor apps/api/package.json pnpm-lock.yaml
git commit -m "feat(oor): comments, notes, meeting updates, emails and the merged activity feed"
```

---

### Task 10: The Purchase Order Tracking tab shell

**Files:**
- Modify: `apps/web/src/app/routes/departments/ops.tsx` (add `poTracking` to `OpsTab`, `TABS`, `MODULE_TYPE_BY_TAB`, and the render switch)
- Create: `apps/web/src/components/ops/poTracking/PoTrackingTab.tsx`
- Create: `apps/web/src/components/ops/poTracking/oor/useOorQueries.ts`
- Create: `apps/web/src/components/ops/poTracking/oor/OorStatCards.tsx`
- Modify: `apps/web/index.html` (add the JetBrains Mono font link beside the existing font links)
- Modify: `apps/web/src/styles/design-system.css` (add `--font-mono: 'JetBrains Mono', ui-monospace, monospace`)

**Interfaces:**
- Consumes: the endpoints from Tasks 8–9.
- Produces: `useOorLines(params)`, `useOorLine(id)`, `useOorTree(id)`, `useOorMutations()` hooks; `<PoTrackingTab departmentId moduleId />` rendering a sub-tab strip whose first entry is Open Order Report.

- [ ] **Step 1: Add the tab**

`TABS` gains `{ key: 'poTracking', label: 'Purchase Order Tracking', icon: ClipboardCheck }` placed immediately after `production`. `MODULE_TYPE_BY_TAB` gains `poTracking: 'OPEN_ORDER_REPORT'`. The render switch at `ops.tsx:1515` gains a `poTracking` branch.

- [ ] **Step 2: Build the stat cards as filter chips**

Five cards — Open Lines, Open Value, Lines Short, Critical, Awaiting Customer Approval — each reading its number from the list endpoint's summary block (add `summary` to `GET /lines` in Task 8 if it is not there; it must be computed in SQL, not from the page). Clicking a card toggles the corresponding filter and shows an active outline in `--accent-secondary`.

- [ ] **Step 3: Verify in the running app**

Run the web dev server, open Operations, confirm the new tab appears between Production Tracking and Brand Transition and renders the cards with real counts from an imported fixture.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src apps/web/index.html
git commit -m "feat(oor): Purchase Order Tracking tab shell with summary filter chips"
```

---

### Task 11: The Excel-parity grid

**Files:**
- Create: `apps/web/src/components/ops/poTracking/oor/OorGrid.tsx`
- Create: `apps/web/src/components/ops/poTracking/oor/oorColumns.tsx`
- Create: `apps/web/src/components/ops/poTracking/oor/oorFormat.ts`
- Test: `apps/web/src/components/ops/poTracking/oor/oorFormat.test.ts`

**Interfaces:**
- Consumes: `useOorLines` (Task 10).
- Produces: `<OorGrid reportType onOpenLine />`; `formatCurrency`, `formatQty`, `formatQtyNeed`, `formatShortDate` matching the workbook number formats (`$#,##0.00`, `#,##0`, `#,##0.0` with negatives in parentheses, `mm-dd-yy`).

- [ ] **Step 1: Unit-test the formatters first** — they are pure and they are where Excel parity actually lives. Assert `formatQtyNeed(-12.5) === '(12.5)'` and `formatShortDate(new Date('2026-08-24')) === '08-24-26'`.

- [ ] **Step 2: Build the grid on TanStack Table 8** (already a dependency): sticky header, sticky first column, per-column filter inputs in a second header row mirroring the source autofilter, multi-column sort, column resize/reorder/hide with layout persisted per user in `UserPreference`, keyboard navigation (arrow keys move focus, `Enter` opens the modal, `Space` toggles expansion), density toggle, and range-copy as TSV via a `copy` handler on the grid container. Identifiers and figures use `var(--font-mono)`.

- [ ] **Step 3: Column sets** — `oorColumns.tsx` exports `CUSTOMER_OPEN_ORDER_COLUMNS` and `SHORTAGE_COLUMNS` with the spec's labels verbatim, plus the two app-only trailing columns Status and Activity.

- [ ] **Step 4: Verify against the fixture in the browser, then commit**

```bash
git add apps/web/src/components/ops/poTracking
git commit -m "feat(oor): Excel-parity data grid with persisted per-user layout"
```

---

### Task 12: Inline shortage tree

**Files:**
- Create: `apps/web/src/components/ops/poTracking/oor/ShortageTree.tsx`
- Modify: `apps/web/src/components/ops/poTracking/oor/OorGrid.tsx`

- [ ] **Step 1:** Chevron in the first column for every line, not only `CONTRACT_MFG` ones; a line with no nodes expands to an empty state rather than hiding the affordance. `CONTRACT_MFG` lines additionally render `Contract Manufacture — {cmCode}` and an *Active* badge when `jobStatus === 'ACT'`.
- [ ] **Step 2:** Fetch the tree on first expand only (`useOorTree`, `enabled: isExpanded`), cache per line, persist expansion state in session storage.
- [ ] **Step 3:** Level 1 indents one step, level 2 two. Each row shows part, description, QTY Need, UOM, on-hand, ETA, `CP?` badge, shortage reason and the wrapped `mfgComment` — wrapped, never truncated to one line. Short rows accent `--danger`; customer-provided `--warning`.
- [ ] **Step 4:** Chevron rotation and height transition in CSS, both disabled under `prefers-reduced-motion`.
- [ ] **Step 5: Commit** — `git commit -m "feat(oor): inline shortage tree with lazy per-line loading"`

---

### Task 13: Modal shell, Overview, Production Tracker

**Files:**
- Create: `apps/web/src/components/ops/poTracking/oor/OorModal.tsx`, `tabs/Overview.tsx`, `tabs/ProductionTracker.tsx`
- Modify: `apps/web/src/app/App routes` — add `/operations/po-tracking/oor/:lineId`

- [ ] **Step 1:** Modal at 90vw / max 1400px, focus-trapped, `Esc` closes, deep-linked at `/operations/po-tracking/oor/:lineId` so the URL survives a paste into Slack.
- [ ] **Step 2:** Header — PO + channel tag, item + description, brand, inline-editable status pill (override requires a reason), risk badge, required date with days-remaining countdown, owner, and actions Export line / Copy link / Print.
- [ ] **Step 3:** Overview — every source field in a two-column definition grid plus the derived ones (`valueComputed`, mismatch flag, days to required, worst blocker ETA). Inline edits are optimistic with rollback on failure and a toast carrying undo.
- [ ] **Step 4:** Production Tracker — the Format B column set as an editable grid over the tree; inline-edit `qtyOnHand`, `etaDate`, `shortageReason`, `nodeStatus`, `mfgComment`; a row-level resolve toggle; and a stage strip Bulk → Components → Fill → QC → Pack → Ready → Shipped with the current stage lit and blockers listed beneath. Every edit writes audit and appears in Activity.
- [ ] **Step 5: Commit** — `git commit -m "feat(oor): line modal with overview and editable production tracker"`

> **CHECKPOINT — stop here and show Ahmad the running modal.** This is the spec's step-5 gate.

---

### Task 14: Collaboration tabs

**Files:**
- Create: `tabs/Comments.tsx`, `tabs/Notes.tsx`, `tabs/MeetingUpdates.tsx`, `tabs/Emails.tsx`, `tabs/Activity.tsx`, `ThreadComposer.tsx`

- [ ] **Step 1:** `ThreadComposer` is built once and takes a field schema, so all four authoring tabs feel identical.
- [ ] **Step 2:** Comments — threaded, newest first, `@mention` with notification, markdown, pin, edit window, soft delete. Imported legacy comments show their original date and initials with an "imported" marker. The composer prefills `MM.DD.YYYY - ` and appends the author's initials on save, so exported files stay readable to whoever is still working out of Excel.
- [ ] **Step 3:** Notes — titled, categorised, pinnable, visually distinct from comments.
- [ ] **Step 4:** Meeting Updates — date, title, attendees, decision, next action, owner, due date, status. An overdue open next-action raises a badge on the grid row.
- [ ] **Step 5:** Emails — paste raw text, upload `.eml`, or pull by message id from the connected mailbox via the existing `microsoftGraph` integration. Rendered as a readable thread with downloadable attachments.
- [ ] **Step 6:** Activity — merged, filterable, reverse-chronological, including status events from `AuditLog`.
- [ ] **Step 7: Commit** — `git commit -m "feat(oor): comments, notes, meeting updates, emails and activity tabs"`

---

### Task 15: Export and round-trip

**Files:**
- Create: `apps/api/src/services/oor/exportReport.ts`
- Test: `apps/api/src/services/oor/exportReport.test.ts`
- Modify: `apps/api/src/routes/oor.ts` (`GET /exports`)

- [ ] **Step 1: Write the round-trip test first.** Import the AcneFree fixture, export it, re-import the exported file, assert zero net changes to every report-sourced field across all 51 lines. Repeat for the AMBI fixture including tree shape (7 / 33 / 80) and parent assignment.
- [ ] **Step 2: Implement with exceljs** — Format B keeps the merged title in `A1`, header on row 2, autofilter on the header row, frozen header, Arial 10, `Mfg Comment` wrapped at width 95, `Description` 57, level description 129, `Unit Price` `$#,##0.00`, `Qty Due` `#,##0`, `QTY Need` `#,##0.0;(#,##0.0)`, dates `mm-dd-yy`. Format A reproduces its own header row and the `Customer:` line above it.
- [ ] **Step 3:** `?includeAppendix=true` adds the collaboration sheet; `?includeStatus=true` adds the Status column. Both default off so the default file stays drop-in compatible with what people already forward to the CM.
- [ ] **Step 4: Run the round-trip test, then commit** — `git commit -m "feat(oor): Excel export with layout parity and a round-trip guarantee"`

---

### Task 16: States, accessibility, and retiring the old Open Orders mode

**Files:**
- Modify: grid, modal, tab shell; `apps/web/src/components/ops/production/OpenOrdersView.tsx`; `ops.tsx`

- [ ] **Step 1:** Skeleton rows on load — never a spinner over the grid. Empty, error and no-permission states for every list.
- [ ] **Step 2:** Keyboard pass over grid and modal; focus visible throughout; `aria-expanded` on tree chevrons; the modal labelled by its heading.
- [ ] **Step 3:** `prefers-reduced-motion` audit — every transition added in Tasks 11–13 has a no-op branch.
- [ ] **Step 4:** Point the Production Tracking tab's "Open Orders" mode at the new tab with a one-line notice, per conflict #2. **Do not delete `OpenOrdersView.tsx` in this task** — leave it in place for one release so a rollback is a single-line change.
- [ ] **Step 5: Run the full suite and typecheck**

```bash
cd /Users/ahmadgeorge/Nexus-Collab && pnpm --filter @nexus/api exec vitest run && pnpm typecheck
```
Expected: all tests pass; typecheck reports 0 errors (the baseline on main is clean as of PR #101, so any error is yours).

- [ ] **Step 6: Commit and open the PR**

```bash
git add -A && git commit -m "feat(oor): loading, empty and error states, a11y pass, and Open Orders redirect"
gh pr create --base main --title "feat(oor): Open Order Report in Operations → Purchase Order Tracking" --body "..."
```

---

## Self-Review

**Spec coverage.** §2 both formats → Tasks 2–4, 11, 15. §3 data model → Task 5 (10 tables resolved to 6; `oor_status_event` → `AuditLog`, `oor_email`/`oor_email_attachment` → `Attachment`, both recorded in "Spec vs repo"). §4 vocabulary and derivation → Tasks 5, 7. §5 ingestion → Tasks 1–4, 6; the `SourceAdapter` seam is Task 1 and gets its second implementation in Task 6. §6 API → Tasks 8–9. §7 frontend → Tasks 10–14. §8 export → Task 15. §9 permissions and audit → Task 5 (catalogue), Tasks 8–9 (enforcement). §10 tests → written inside each task. §11 build order → Tasks 1–16 in order, with the spec's two checkpoints after Task 4 and Task 13.

**Known gaps, stated rather than hidden.** Two spec items are deliberately deferred and need a ruling: the "Add from meeting" calendar prefill in §7.3 tab 5 depends on a calendar connector — `microsoftGraph.ts` exists but no calendar read is wired, so Task 14 ships manual entry and the prefill is a follow-up. And §5.8's live EDI/SPS adapter is scoped here only as the interface plus the ERP implementation, not an EDI one.

**Type consistency.** `ParsedLine`/`ParsedNode`/`ParseWarning` are defined once in Task 1 and referenced unchanged in Tasks 2, 3, 4, 6. `OorLineStatus` is defined in Task 5 and consumed in Task 7 and the web tasks from the same shared package. `runImport` and `deriveLineStatus` signatures appear identically in their producing and consuming tasks.
