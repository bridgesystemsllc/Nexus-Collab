# Enhanced Open-Order Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the KareEve ERP's "Open Order Intelligence" PO-tracking view into Nexus's existing Production Tracking module (keeping all production fields) and sync PO status + notes bidirectionally over the existing `ERP_KAREVE_SYNC` integration.

**Architecture:** Additive JSON fields on the existing `ProductionOrder` (no DB migration). A new inbound ERP feed (`fetchErpOpenOrders` + `syncErpOpenOrders`) upserts PO data onto production orders without clobbering Nexus-only fields; a new outbound feed (`openOrders` + `mapOpenOrderForErp`) pushes status/note changes back. The UI enhances `ProductionModule.tsx` with an ERP-style KPI bar, manufacturer-grouped Open-Order table, filters, CSV export, and Refresh.

**Tech Stack:** React 18 + Vite, TanStack Query, lucide-react (web); Express + Prisma 5 + PostgreSQL (api); `tsx` for scripts. Records stored as JSON in `ModuleItem.data`.

## Global Constraints

- **No DB migration** — all new fields live in `ModuleItem.data` (JSON blob). Do not touch `schema.prisma`.
- **No test framework exists** — verify pure logic with standalone `tsx` assertion scripts under `apps/api/scripts/checks/` (run `npx tsx <file>`, exit non-zero on failure). Verify UI manually against the ERP screenshots. Do NOT add vitest/jest.
- **Config-gated ERP I/O** — real data only when `getErpConfig()` reports `configured`; otherwise synthetic feed (inbound) / dry-run (outbound). Never fake a real send. Mirror the exact pattern in `apps/api/src/lib/erpClient.ts` and `erpPush.ts`.
- **PO Status and Production Status are separate fields** — ERP sync only ever reads/writes `poStatus`. Never modify the existing `status` (production) enum or its values.
- **Nexus-only fields are never clobbered by inbound sync.** Notes are append-only (union by note `id`).
- **Every PR is based on `main`, never stacked.** PRs are sequential: each is branched off `main` only after the previous PR is merged. Branch names: `feat/oot-<n>-<slug>`.
- **Commit trailer:** end every commit message with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Currency/number formatting** uses the existing `formatCurrency` / `toLocaleString` helpers in `productionData.ts`.

---

## File Structure

**PR 1 — Data model + types + mappers**
- Modify: `apps/web/src/components/ops/production/productionData.ts` — add `PoStatus`, `ALL_PO_STATUSES`, `PO_STATUS_COLORS`, new `ProductionOrder` fields, `EMPTY_PRODUCTION_ORDER` defaults, `isOverdue()` + `getOpenOrderKPIs()` helpers.
- Create: `apps/api/src/lib/erpOpenOrders.ts` — `ErpOpenOrder` type + `mapErpOpenOrder` (inbound raw→typed) + `mapOpenOrderForErp` (Nexus item.data→ERP payload) + `mergeOpenOrderIntoData` (merge semantics). Pure functions, no I/O — shared by later PRs.
- Create: `apps/api/scripts/checks/openOrders.check.ts` — assertion script for the pure functions.

**PR 2 — Inbound sync**
- Modify: `apps/api/src/lib/erpClient.ts` — add `fetchErpOpenOrders` + synthetic feed.
- Modify: `apps/api/src/lib/erpSync.ts` — add `syncErpOpenOrders`.
- Modify: `apps/api/src/lib/erpRouting.ts` — register `openOrders` inbound feed (target `PRODUCTION_TRACKING`).
- Modify: `apps/api/src/routes/integrations.ts` (or the file exposing sync triggers) — wire `openOrders` into the sync orchestrator + add a refresh endpoint.
- Create: `apps/api/scripts/checks/openOrdersSync.check.ts`.

**PR 3 — Enhanced UI**
- Create: `apps/web/src/components/ops/production/OpenOrderTable.tsx` — manufacturer-grouped ERP-style table (extracted; `ProductionModule.tsx` is already ~1,600 lines).
- Create: `apps/web/src/components/ops/production/OpenOrderKPIs.tsx` — the 5-card KPI bar.
- Create: `apps/web/src/components/ops/production/openOrderCsv.ts` — CSV export helper.
- Modify: `apps/web/src/components/ops/production/ProductionModule.tsx` — mount the KPI bar + Open-Order view toggle, filters, Refresh, Export CSV.
- Modify: `apps/web/src/components/ops/production/ProductionOrderDrawer.tsx` — add PO Status + Urgency editors.

**PR 4 — Outbound sync**
- Modify: `apps/api/src/lib/erpRouting.ts` — register `openOrders` in `ERP_OUTBOUND_FEEDS`.
- Modify: `apps/api/src/lib/erpPush.ts` — register `openOrders` mapper in `MAPPERS`.
- Modify: `apps/api/src/routes/integrations.ts` (or drawer-facing route) — push-on-edit endpoint for a single PO.
- Modify: `apps/web/src/components/ops/production/ProductionOrderDrawer.tsx` — call the push endpoint after a PO-status change or note add.
- Create: `apps/api/scripts/checks/openOrdersPush.check.ts`.

---

# PR 1 — Data Model + Types + Mappers

Branch: `feat/oot-1-data-model` off `main`.

### Task 1.1: Add PO-status types, constants, and fields to `productionData.ts`

**Files:**
- Modify: `apps/web/src/components/ops/production/productionData.ts`

**Interfaces:**
- Produces (consumed by PR3 UI + PR1 Task 1.2 conceptually mirrored in api):
  - `type PoStatus = 'Draft' | 'Sent to Vendor' | 'Acknowledged' | 'In Production' | 'Partially Received' | 'Received' | 'Closed' | 'Cancelled'`
  - `ALL_PO_STATUSES: PoStatus[]`, `PO_STATUS_COLORS: Record<string,string>`
  - New `ProductionOrder` fields: `poStatus: PoStatus`, `urgency: 'Normal' | 'Urgent'`, `qtyReceived: number`, `deliveryDue: string`, `eta: string`, `lineCount: number`, `erpPoId: string`, `erpLastSyncAt: string`
  - `isOverdue(o: ProductionOrder): boolean`
  - `getOpenOrderKPIs(orders: ProductionOrder[]): { openOrders: number; totalLines: number; unitsRemaining: number; unitsReceived: number; overdue: number }`

- [ ] **Step 1: Add the `PoStatus` type and constants**

In `productionData.ts`, after the `ProductionStatus` type (line ~12) add:

```typescript
export type PoStatus =
  | 'Draft'
  | 'Sent to Vendor'
  | 'Acknowledged'
  | 'In Production'
  | 'Partially Received'
  | 'Received'
  | 'Closed'
  | 'Cancelled'
```

After `ALL_STATUSES` (line ~111) add:

```typescript
export const ALL_PO_STATUSES: PoStatus[] = [
  'Draft',
  'Sent to Vendor',
  'Acknowledged',
  'In Production',
  'Partially Received',
  'Received',
  'Closed',
  'Cancelled',
]

export const PO_STATUS_COLORS: Record<string, string> = {
  Draft: '#8E8E93',
  'Sent to Vendor': '#0A84FF',
  Acknowledged: '#5E5CE6',
  'In Production': '#7C3AED',
  'Partially Received': '#FF9F0A',
  Received: '#32D74B',
  Closed: '#6E6E73',
  Cancelled: '#FF453A',
}
```

- [ ] **Step 2: Add the new fields to the `ProductionOrder` interface**

In the `ProductionOrder` interface, before `notes: ProductionNote[]` (line ~63) add:

```typescript
  // ─── ERP Open-Order (PO lifecycle) — synced with KareEve ERP ───
  poStatus: PoStatus
  urgency: 'Normal' | 'Urgent'
  qtyReceived: number
  deliveryDue: string
  eta: string
  lineCount: number
  erpPoId: string
  erpLastSyncAt: string
```

- [ ] **Step 3: Add defaults to `EMPTY_PRODUCTION_ORDER`**

In `EMPTY_PRODUCTION_ORDER`, before `notes: [] as ProductionNote[]` add:

```typescript
  poStatus: 'Draft' as PoStatus,
  urgency: 'Normal' as 'Normal' | 'Urgent',
  qtyReceived: 0,
  deliveryDue: '',
  eta: '',
  lineCount: 0,
  erpPoId: '',
  erpLastSyncAt: '',
```

- [ ] **Step 4: Add `isOverdue` and `getOpenOrderKPIs` helpers**

At the end of the Helpers section (after `getKPIs`, line ~361) add:

```typescript
/**
 * A PO is overdue when its ETA (or delivery-due date) is in the past AND it
 * has not reached a terminal received/closed/cancelled state. Overdue is
 * DERIVED, never stored.
 */
export function isOverdue(o: Pick<ProductionOrder, 'eta' | 'deliveryDue' | 'poStatus'>): boolean {
  const terminal: PoStatus[] = ['Received', 'Closed', 'Cancelled']
  if (terminal.includes(o.poStatus)) return false
  const raw = o.eta || o.deliveryDue
  if (!raw) return false
  const due = new Date(raw)
  if (isNaN(due.getTime())) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return due.getTime() < today.getTime()
}

/**
 * ERP-parity KPI cards: Open Orders, Total Lines, Units Remaining,
 * Units Received, Overdue. "Open" excludes terminal PO statuses.
 */
export function getOpenOrderKPIs(orders: ProductionOrder[]) {
  const open = orders.filter(
    (o) => !['Received', 'Closed', 'Cancelled'].includes(o.poStatus),
  )
  return {
    openOrders: open.length,
    totalLines: open.reduce((s, o) => s + (o.lineCount || 0), 0),
    unitsRemaining: open.reduce((s, o) => s + (o.qtyRemaining || 0), 0),
    unitsReceived: orders.reduce((s, o) => s + (o.qtyReceived || 0), 0),
    overdue: open.filter((o) => isOverdue(o)).length,
  }
}
```

- [ ] **Step 5: Type-check the web package**

Run: `cd /Users/ahmadgeorge/Nexus-Collab && pnpm --filter @nexus/web exec tsc --noEmit`
Expected: no new errors referencing `productionData.ts`. (Pre-existing unrelated errors, if any, are acceptable — compare against a baseline run on `main`.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/ops/production/productionData.ts
git commit -m "feat(production): add PO-lifecycle fields, statuses, and open-order KPIs

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 1.2: Create the shared ERP open-order mappers (api)

**Files:**
- Create: `apps/api/src/lib/erpOpenOrders.ts`
- Create: `apps/api/scripts/checks/openOrders.check.ts`

**Interfaces:**
- Produces (consumed by PR2 + PR4):
  - `interface ErpOpenOrder { poNumber: string; erpPoId: string; manufacturer: string; poStatus: string; urgency: 'Normal' | 'Urgent'; orderDate: string; deliveryDue: string; eta: string; qtyOrdered: number; qtyReceived: number; qtyRemaining: number; lineCount: number; notes: string; source: 'ERP_KAREVE' }`
  - `mapErpOpenOrder(raw: Record<string, any>): ErpOpenOrder`
  - `mapOpenOrderForErp(data: Record<string, any> | null | undefined): Record<string, any>`
  - `mergeOpenOrderIntoData(existing: Record<string, any>, erp: ErpOpenOrder, now: string): Record<string, any>`

- [ ] **Step 1: Write the mapper module**

Create `apps/api/src/lib/erpOpenOrders.ts`:

```typescript
// ─── ERP Open-Order (Purchase Order) mapping ────────────────
// Shared pure functions for the open-order two-way sync. No I/O here so they
// can be unit-checked in isolation. The inbound client (erpClient) and the
// outbound push (erpPush) both build on these.

/** A raw open-order / purchase-order record from the ERP, normalized. */
export interface ErpOpenOrder {
  poNumber: string
  erpPoId: string
  manufacturer: string
  poStatus: string
  urgency: 'Normal' | 'Urgent'
  orderDate: string
  deliveryDue: string
  eta: string
  qtyOrdered: number
  qtyReceived: number
  qtyRemaining: number
  lineCount: number
  notes: string
  source: 'ERP_KAREVE'
}

function s(v: unknown): string {
  return v === null || v === undefined ? '' : String(v).trim()
}
function n(v: unknown): number {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

/** Map a raw ERP PO record (field shape varies) into a typed ErpOpenOrder. */
export function mapErpOpenOrder(raw: Record<string, any>): ErpOpenOrder {
  const qtyOrdered = n(raw.qtyOrdered ?? raw.quantityOrdered ?? raw.orderedQty ?? raw.quantity)
  const qtyReceived = n(raw.qtyReceived ?? raw.quantityReceived ?? raw.receivedQty)
  const qtyRemaining =
    raw.qtyRemaining != null || raw.quantityRemaining != null
      ? n(raw.qtyRemaining ?? raw.quantityRemaining)
      : Math.max(qtyOrdered - qtyReceived, 0)
  const urgencyRaw = s(raw.urgency ?? raw.priority).toLowerCase()
  return {
    poNumber: s(raw.poNumber ?? raw.poNo ?? raw.purchaseOrder ?? raw.customerPo ?? raw.po),
    erpPoId: s(raw.erpPoId ?? raw.id ?? raw.poId ?? raw.poNumber ?? raw.poNo),
    manufacturer: s(raw.manufacturer ?? raw.vendor ?? raw.vendorName ?? raw.cm ?? raw.supplier),
    poStatus: s(raw.poStatus ?? raw.status ?? 'Sent to Vendor') || 'Sent to Vendor',
    urgency: urgencyRaw === 'urgent' ? 'Urgent' : 'Normal',
    orderDate: s(raw.orderDate ?? raw.createdAt ?? raw.poDate),
    deliveryDue: s(raw.deliveryDue ?? raw.dueDate ?? raw.requestedDelivery ?? raw.deliveryDate),
    eta: s(raw.eta ?? raw.expectedDelivery ?? raw.promisedDate ?? raw.deliveryDue),
    qtyOrdered,
    qtyReceived,
    qtyRemaining,
    lineCount: n(raw.lineCount ?? raw.lines ?? raw.lineItems ?? (Array.isArray(raw.items) ? raw.items.length : 0)),
    notes: s(raw.notes ?? raw.comments ?? raw.note),
    source: 'ERP_KAREVE',
  }
}

/**
 * Map a PRODUCTION_TRACKING item.data blob to the ERP open-order payload for
 * OUTBOUND push. Only the ERP-owned PO fields (+ notes) are emitted — Nexus
 * production internals are never sent. Notes are flattened to the ERP's
 * date-prefixed comment string the OOR importer already understands.
 */
export function mapOpenOrderForErp(data: Record<string, any> | null | undefined): Record<string, any> {
  const d = data ?? {}
  const notesArr = Array.isArray(d.notes) ? d.notes : []
  const notes = notesArr
    .map((note: any) => {
      const date = s(note?.noteDate ?? note?.date)
      const text = s(note?.noteText ?? note?.text)
      return date ? `${date} ${text}` : text
    })
    .filter(Boolean)
    .join(' ')
  return {
    poNumber: s(d.customerPo ?? d.poNumber),
    erpPoId: s(d.erpPoId),
    poStatus: s(d.poStatus) || 'Draft',
    urgency: s(d.urgency) === 'Urgent' ? 'Urgent' : 'Normal',
    qtyReceived: n(d.qtyReceived),
    eta: s(d.eta),
    notes,
  }
}

/**
 * Merge an inbound ErpOpenOrder onto an existing production item.data. ERP owns
 * the PO fields (poStatus/urgency/qty*/dates/lineCount) and overwrites them;
 * every Nexus-only production field is preserved untouched. Notes are
 * append-only: ERP notes not already present (by rendered text) are appended.
 */
export function mergeOpenOrderIntoData(
  existing: Record<string, any>,
  erp: ErpOpenOrder,
  now: string,
): Record<string, any> {
  const merged: Record<string, any> = { ...existing }
  merged.erpPoId = erp.erpPoId || existing.erpPoId || ''
  merged.customerPo = existing.customerPo || erp.poNumber
  merged.cm = existing.cm || erp.manufacturer
  merged.poStatus = erp.poStatus
  merged.urgency = erp.urgency
  merged.qtyOrdered = erp.qtyOrdered
  merged.qtyReceived = erp.qtyReceived
  merged.qtyRemaining = erp.qtyRemaining
  merged.deliveryDue = erp.deliveryDue
  merged.eta = erp.eta
  merged.lineCount = erp.lineCount
  merged.erpLastSyncAt = now

  // Notes: append-only union. Existing rendered texts guard against dupes.
  const existingNotes = Array.isArray(existing.notes) ? existing.notes : []
  const rendered = new Set(
    existingNotes.map((x: any) => s(x?.noteText ?? x?.text)).filter(Boolean),
  )
  if (erp.notes && !rendered.has(erp.notes)) {
    merged.notes = [
      ...existingNotes,
      {
        id: `erp-note-${erp.erpPoId || erp.poNumber}-${now}`,
        noteDate: '',
        noteText: erp.notes,
        createdBy: 'KareEve ERP',
        createdAt: now,
      },
    ]
  } else {
    merged.notes = existingNotes
  }
  return merged
}
```

(The `s` and `n` helpers are defined once near the top of the file; `mergeOpenOrderIntoData` reuses `s`. Do not redefine them.)

- [ ] **Step 2: Write the assertion check script**

Create `apps/api/scripts/checks/openOrders.check.ts`:

```typescript
import assert from 'node:assert'
import { mapErpOpenOrder, mapOpenOrderForErp, mergeOpenOrderIntoData } from '../../src/lib/erpOpenOrders'

// mapErpOpenOrder: derives qtyRemaining and normalizes urgency
const m = mapErpOpenOrder({
  poNumber: 'P06222026', vendor: 'Paklab', status: 'Sent to Vendor',
  priority: 'urgent', qtyOrdered: 100000, qtyReceived: 25000, lines: 2,
  orderDate: '2026-06-21', deliveryDue: '2026-11-29',
})
assert.equal(m.qtyRemaining, 75000, 'qtyRemaining derived')
assert.equal(m.urgency, 'Urgent', 'urgency normalized')
assert.equal(m.manufacturer, 'Paklab', 'manufacturer from vendor')
assert.equal(m.lineCount, 2, 'lineCount from lines')

// mapOpenOrderForErp: only PO fields + flattened notes, no production internals
const payload = mapOpenOrderForErp({
  customerPo: 'P05282026', erpPoId: 'e1', poStatus: 'Acknowledged', urgency: 'Normal',
  qtyReceived: 5000, eta: '2026-12-14', bulkFormula: 'BF-1022',
  notes: [{ noteDate: '3.10', noteText: 'RM delayed' }],
})
assert.equal(payload.poStatus, 'Acknowledged')
assert.equal(payload.notes, '3.10 RM delayed', 'notes flattened')
assert.ok(!('bulkFormula' in payload), 'production internals not sent')

// mergeOpenOrderIntoData: ERP owns PO fields, Nexus fields preserved, notes append-only
const existing = {
  customerPo: 'P05282026', bulkFormula: 'BF-1022', status: 'In Production',
  poStatus: 'Sent to Vendor', qtyReceived: 0,
  notes: [{ id: 'n1', noteText: 'internal note' }],
}
const erp = mapErpOpenOrder({ poNumber: 'P05282026', erpPoId: 'e1', status: 'Acknowledged', qtyOrdered: 100000, qtyReceived: 40000, notes: 'ERP: partial receipt' })
const merged = mergeOpenOrderIntoData(existing, erp, '2026-07-01T00:00:00.000Z')
assert.equal(merged.poStatus, 'Acknowledged', 'ERP overwrote poStatus')
assert.equal(merged.qtyReceived, 40000, 'ERP overwrote qtyReceived')
assert.equal(merged.bulkFormula, 'BF-1022', 'Nexus-only field preserved')
assert.equal(merged.status, 'In Production', 'production status untouched')
assert.equal(merged.notes.length, 2, 'ERP note appended')
assert.equal(merged.notes[1].createdBy, 'KareEve ERP')

// idempotency: re-merging the same ERP note does not duplicate
const merged2 = mergeOpenOrderIntoData(merged, erp, '2026-07-01T01:00:00.000Z')
assert.equal(merged2.notes.length, 2, 'no duplicate ERP note on re-sync')

console.log('openOrders.check: all assertions passed')
```

- [ ] **Step 3: Run the check and verify it passes**

Run: `cd /Users/ahmadgeorge/Nexus-Collab && npx tsx apps/api/scripts/checks/openOrders.check.ts`
Expected: `openOrders.check: all assertions passed` and exit code 0.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/lib/erpOpenOrders.ts apps/api/scripts/checks/openOrders.check.ts
git commit -m "feat(erp): shared open-order mappers + merge semantics with checks

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 1.3: Open PR 1

- [ ] **Step 1: Push and open the PR**

```bash
git push -u origin feat/oot-1-data-model
gh pr create --base main --title "OOT PR 1: data model + open-order mappers" \
  --body "First of 4 PRs implementing enhanced open-order tracking (spec: docs/superpowers/specs/2026-07-01-enhanced-open-order-tracking-design.md). Adds PO-lifecycle fields/statuses/KPIs to productionData.ts and the shared ERP open-order mappers + merge semantics with a tsx check. No DB migration; no runtime wiring yet.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

# PR 2 — Inbound Sync (ERP → Nexus)

Branch: `feat/oot-2-inbound-sync` off `main` **after PR 1 is merged**.

### Task 2.1: Add `fetchErpOpenOrders` + synthetic feed to `erpClient.ts`

**Files:**
- Modify: `apps/api/src/lib/erpClient.ts`

**Interfaces:**
- Consumes: `ErpOpenOrder`, `mapErpOpenOrder` from `./erpOpenOrders`; existing `getErpConfig`, `fetchErpRecords`, `candidatePaths`.
- Produces: `fetchErpOpenOrders(prisma: PrismaClient, path?: string): Promise<ErpOpenOrder[]>`

- [ ] **Step 1: Import the shared mapper**

At the top of `erpClient.ts`, add:

```typescript
import { mapErpOpenOrder, type ErpOpenOrder } from './erpOpenOrders'
```

- [ ] **Step 2: Add the synthetic feed + fetch function**

At the end of `erpClient.ts` add:

```typescript
// ─── Open Orders / Purchase Orders ──────────────────────────
// Mirrors the ERP "Open Order Intelligence" data. Synthetic dev feed reflects
// the manufacturers seen in the ERP UI (Paklab, Twincraft, Glenmark, Cosmax).
const SYNTHETIC_ERP_OPEN_ORDERS: Array<Record<string, any>> = [
  { poNumber: 'P06222026', erpPoId: 'PL-1', vendor: 'Paklab', status: 'Sent to Vendor', urgency: 'Normal', orderDate: '2026-06-21', deliveryDue: '2026-11-29', eta: '2026-11-29', qtyOrdered: 100000, qtyReceived: 0, lines: 2 },
  { poNumber: 'PK03172026', erpPoId: 'PL-2', vendor: 'Paklab', status: 'Acknowledged', urgency: 'Normal', orderDate: '2026-03-15', deliveryDue: '2026-09-14', eta: '2026-09-14', qtyOrdered: 200000, qtyReceived: 0, lines: 5 },
  { poNumber: 'P03132026', erpPoId: 'PL-3', vendor: 'Paklab', status: 'Sent to Vendor', urgency: 'Urgent', orderDate: '2026-03-12', deliveryDue: '2026-06-25', eta: '2026-06-25', qtyOrdered: 10000, qtyReceived: 0, lines: 2 },
  { poNumber: 'TW-88010', erpPoId: 'TW-1', vendor: 'Twincraft', status: 'Acknowledged', urgency: 'Normal', orderDate: '2026-05-01', deliveryDue: '2026-10-10', eta: '2026-10-10', qtyOrdered: 300000, qtyReceived: 50000, lines: 3 },
  { poNumber: 'GL-4402', erpPoId: 'GL-1', vendor: 'Glenmark', status: 'In Production', urgency: 'Normal', orderDate: '2026-04-18', deliveryDue: '2026-09-30', eta: '2026-09-30', qtyOrdered: 170400, qtyReceived: 0, lines: 3 },
  { poNumber: 'CX-7781', erpPoId: 'CX-1', vendor: 'Cosmax', status: 'Sent to Vendor', urgency: 'Normal', orderDate: '2026-06-02', deliveryDue: '2026-12-01', eta: '2026-12-01', qtyOrdered: 50000, qtyReceived: 0, lines: 1 },
]

function syntheticOpenOrders(): ErpOpenOrder[] {
  return SYNTHETIC_ERP_OPEN_ORDERS.map(mapErpOpenOrder)
}

/**
 * Fetch open-order / purchase-order data from the ERP. Real feed when
 * configured (trying `path` then `/open-orders` then `/purchase-orders` then
 * `/pos`), otherwise a labelled synthetic dev feed. Throws on configured-but-
 * failing so the sync orchestrator isolates the feed instead of writing sample
 * data over real POs.
 */
export async function fetchErpOpenOrders(
  prisma: PrismaClient,
  path?: string,
): Promise<ErpOpenOrder[]> {
  const { apiUrl, apiKey, configured } = await getErpConfig(prisma)
  if (!configured || !apiUrl || !apiKey) return syntheticOpenOrders()
  const records = await fetchErpRecords(
    apiUrl,
    apiKey,
    candidatePaths(path, '/open-orders', '/purchase-orders', '/pos'),
    ['openOrders', 'open_orders', 'purchaseOrders', 'pos', 'orders'],
  )
  const mapped = records.map(mapErpOpenOrder).filter((r) => r.poNumber)
  if (mapped.length === 0) throw new Error('ERP returned no usable open-order records')
  return mapped
}
```

- [ ] **Step 3: Type-check the api package**

Run: `cd /Users/ahmadgeorge/Nexus-Collab && pnpm --filter @nexus/api exec tsc --noEmit`
Expected: no new errors in `erpClient.ts`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/lib/erpClient.ts
git commit -m "feat(erp): fetchErpOpenOrders inbound feed with synthetic dev data

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 2.2: Add `syncErpOpenOrders` to `erpSync.ts`

**Files:**
- Modify: `apps/api/src/lib/erpSync.ts`
- Create: `apps/api/scripts/checks/openOrdersSync.check.ts`

**Interfaces:**
- Consumes: `fetchErpOpenOrders` (erpClient), `mergeOpenOrderIntoData` (erpOpenOrders), existing `ErpSyncResult`.
- Produces: `syncErpOpenOrders(prisma: PrismaClient, targetModuleId?: string, erpPath?: string): Promise<ErpSyncResult>`

- [ ] **Step 1: Add imports**

Extend the `erpClient` import in `erpSync.ts` with `fetchErpOpenOrders`, and add:

```typescript
import { mergeOpenOrderIntoData } from './erpOpenOrders'
```

- [ ] **Step 2: Add the sync function**

At the end of `erpSync.ts` add:

```typescript
/**
 * Pull the ERP open-order feed and upsert it into the PRODUCTION_TRACKING
 * module. Matches on erpPoId first, then customerPo. ERP owns the PO fields;
 * mergeOpenOrderIntoData preserves every Nexus-only production field and unions
 * notes append-only. New POs seen only in the ERP are created as fresh items.
 */
export async function syncErpOpenOrders(
  prisma: PrismaClient,
  targetModuleId?: string,
  erpPath?: string,
): Promise<ErpSyncResult> {
  const mod = targetModuleId
    ? await prisma.departmentModule.findUnique({ where: { id: targetModuleId } })
    : await prisma.departmentModule.findFirst({ where: { type: 'PRODUCTION_TRACKING' } })
  if (!mod) return { recordsProcessed: 0, created: 0, updated: 0 }

  const existing = await prisma.moduleItem.findMany({ where: { moduleId: mod.id } })
  const byErpId = new Map<string, (typeof existing)[number]>()
  const byPo = new Map<string, (typeof existing)[number]>()
  for (const item of existing) {
    const d = (item.data as any) ?? {}
    if (d.erpPoId) byErpId.set(String(d.erpPoId), item)
    if (d.customerPo) byPo.set(String(d.customerPo), item)
  }

  const records = await fetchErpOpenOrders(prisma, erpPath)
  const now = new Date().toISOString()
  let created = 0
  let updated = 0

  for (const erp of records) {
    const match =
      (erp.erpPoId && byErpId.get(erp.erpPoId)) || (erp.poNumber && byPo.get(erp.poNumber)) || null
    if (match) {
      const data = mergeOpenOrderIntoData((match.data as any) ?? {}, erp, now)
      await prisma.moduleItem.update({
        where: { id: match.id },
        data: { data, status: data.poStatus },
      })
      updated++
    } else {
      const data = mergeOpenOrderIntoData(
        { customerPo: erp.poNumber, cm: erp.manufacturer, notes: [] },
        erp,
        now,
      )
      await prisma.moduleItem.create({
        data: { moduleId: mod.id, data, status: data.poStatus, sortOrder: 0 },
      })
      created++
    }
  }

  return { recordsProcessed: records.length, created, updated }
}
```

- [ ] **Step 3: Write a merge-focused check (pure, no DB)**

Create `apps/api/scripts/checks/openOrdersSync.check.ts`:

```typescript
import assert from 'node:assert'
import { mapErpOpenOrder, mergeOpenOrderIntoData } from '../../src/lib/erpOpenOrders'

// Simulate an update-in-place: existing production item gains ERP PO fields
// without losing production internals, and status mirrors poStatus.
const existing = { customerPo: 'PK03172026', batchSize: '6000 units', status: 'Awaiting Materials', notes: [] }
const erp = mapErpOpenOrder({ poNumber: 'PK03172026', erpPoId: 'PL-2', status: 'Acknowledged', qtyOrdered: 200000, qtyReceived: 0, lines: 5 })
const data = mergeOpenOrderIntoData(existing, erp, '2026-07-01T00:00:00.000Z')
assert.equal(data.poStatus, 'Acknowledged')
assert.equal(data.lineCount, 5)
assert.equal(data.batchSize, '6000 units', 'production field preserved')
console.log('openOrdersSync.check: all assertions passed')
```

- [ ] **Step 4: Run the check**

Run: `cd /Users/ahmadgeorge/Nexus-Collab && npx tsx apps/api/scripts/checks/openOrdersSync.check.ts`
Expected: `openOrdersSync.check: all assertions passed`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/erpSync.ts apps/api/scripts/checks/openOrdersSync.check.ts
git commit -m "feat(erp): syncErpOpenOrders upsert into production tracking

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 2.3: Register the inbound feed + refresh endpoint

**Files:**
- Modify: `apps/api/src/lib/erpRouting.ts`
- Modify: `apps/api/src/routes/integrations.ts` (the file that runs the sync orchestrator — confirm by grep before editing)

**Interfaces:**
- Consumes: `ERP_FEEDS`, `syncErpOpenOrders`.
- Produces: an `openOrders` entry in `ERP_FEEDS` (targeting `PRODUCTION_TRACKING`) and a route `POST /integrations/erp/refresh-open-orders` returning `ErpSyncResult`.

- [ ] **Step 1: Register the feed in the catalog**

In `erpRouting.ts`, add to `ERP_FEEDS` (after `cm`):

```typescript
  {
    key: 'openOrders',
    label: 'Open Orders / Purchase Orders',
    defaultModuleType: 'PRODUCTION_TRACKING',
    description: 'Purchase-order lifecycle: status, urgency, qty received, delivery due, ETA.',
  },
```

And add `'openOrders'` to `IMPLEMENTED_FEED_KEYS`:

```typescript
const IMPLEMENTED_FEED_KEYS = new Set(['skus', 'inventory', 'cm', 'openOrders'])
```

- [ ] **Step 2: Locate the sync orchestrator**

Run: `cd /Users/ahmadgeorge/Nexus-Collab && grep -rn "syncErpInventory\|syncErpSkuPipeline\|resolveTargetModule" apps/api/src/routes apps/api/src/lib | grep -v erpSync.ts`
Expected: identifies the orchestrator switch (likely in `integrations.ts` or a `syncErp` function). Read that file's sync dispatch before Step 3.

- [ ] **Step 3: Wire `openOrders` into the orchestrator**

In the orchestrator's per-feed dispatch (where `skus`/`inventory`/`cm` map to their sync functions), add the `openOrders` case calling `syncErpOpenOrders(prisma, targetModuleId, erpPath)`, mirroring the existing cases exactly (same `resolveTargetModule` + per-feed try/catch isolation).

- [ ] **Step 4: Add the refresh endpoint**

In `integrations.ts`, alongside the other ERP routes, add:

```typescript
// Manual refresh of the open-order feed from the Production Tracking UI.
router.post('/erp/refresh-open-orders', async (req, res) => {
  try {
    const result = await syncErpOpenOrders(prisma)
    res.json({ ok: true, ...result })
  } catch (err) {
    res.status(502).json({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
})
```

(Import `syncErpOpenOrders` from `../lib/erpSync`. Match the router/prisma access pattern already used in the file.)

- [ ] **Step 5: Type-check + smoke-run the API**

Run: `cd /Users/ahmadgeorge/Nexus-Collab && pnpm --filter @nexus/api exec tsc --noEmit`
Expected: clean. Then, if a local DB is available, `pnpm dev:api` and `curl -XPOST localhost:PORT/integrations/erp/refresh-open-orders` returns `{ ok: true, created: N, ... }` (synthetic feed). If no DB, note it as manual-verify-on-Replit.

- [ ] **Step 6: Commit + open PR 2**

```bash
git add apps/api/src/lib/erpRouting.ts apps/api/src/routes/integrations.ts
git commit -m "feat(erp): register open-order feed + refresh endpoint

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push -u origin feat/oot-2-inbound-sync
gh pr create --base main --title "OOT PR 2: inbound open-order sync" --body "Second of 4 PRs. Adds fetchErpOpenOrders + syncErpOpenOrders (upsert into Production Tracking, Nexus fields preserved, notes append-only), registers the openOrders inbound feed, and a refresh endpoint.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

# PR 3 — Enhanced UI

Branch: `feat/oot-3-ui` off `main` **after PR 2 is merged**.

> Before starting, READ `ProductionModule.tsx` and `ProductionOrderDrawer.tsx` in full — they are large and set the styling conventions (design tokens `var(--accent)` etc., status color maps, table markup). Match them exactly and apply the `ahmad-design-skill` premium standard.

### Task 3.1: CSV export helper

**Files:**
- Create: `apps/web/src/components/ops/production/openOrderCsv.ts`

**Interfaces:**
- Produces: `openOrdersToCsv(orders: ProductionOrder[]): string`, `downloadOpenOrdersCsv(orders: ProductionOrder[]): void`

- [ ] **Step 1: Write the helper**

Create `apps/web/src/components/ops/production/openOrderCsv.ts`:

```typescript
import type { ProductionOrder } from './productionData'
import { isOverdue } from './productionData'

const COLUMNS: Array<[string, (o: ProductionOrder) => string | number]> = [
  ['PO Number', (o) => o.customerPo],
  ['Manufacturer', (o) => o.cm],
  ['PO Status', (o) => o.poStatus],
  ['Urgency', (o) => o.urgency],
  ['Order Date', (o) => o.orderDate],
  ['Delivery Due', (o) => o.deliveryDue],
  ['Lines', (o) => o.lineCount],
  ['Qty Ordered', (o) => o.qtyOrdered],
  ['Qty Received', (o) => o.qtyReceived],
  ['Qty Remaining', (o) => o.qtyRemaining],
  ['ETA', (o) => o.eta],
  ['Overdue', (o) => (isOverdue(o) ? 'YES' : '')],
]

function escapeCsv(v: string | number): string {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function openOrdersToCsv(orders: ProductionOrder[]): string {
  const header = COLUMNS.map(([h]) => h).join(',')
  const rows = orders.map((o) => COLUMNS.map(([, get]) => escapeCsv(get(o))).join(','))
  return [header, ...rows].join('\n')
}

export function downloadOpenOrdersCsv(orders: ProductionOrder[]): void {
  const blob = new Blob([openOrdersToCsv(orders)], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'open-orders.csv'
  a.click()
  URL.revokeObjectURL(url)
}
```

- [ ] **Step 2: Type-check**

Run: `cd /Users/ahmadgeorge/Nexus-Collab && pnpm --filter @nexus/web exec tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/ops/production/openOrderCsv.ts
git commit -m "feat(production): open-order CSV export helper

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 3.2: KPI bar component

**Files:**
- Create: `apps/web/src/components/ops/production/OpenOrderKPIs.tsx`

**Interfaces:**
- Consumes: `getOpenOrderKPIs`, `ProductionOrder`.
- Produces: `export default function OpenOrderKPIs({ orders }: { orders: ProductionOrder[] })`

- [ ] **Step 1: Write the component** (match the card markup/tokens already used in `ProductionModule.tsx`'s KPI bar)

Create `apps/web/src/components/ops/production/OpenOrderKPIs.tsx`:

```tsx
import { Package, TrendingUp, CheckCircle2, AlertTriangle } from 'lucide-react'
import { getOpenOrderKPIs, type ProductionOrder } from './productionData'

export default function OpenOrderKPIs({ orders }: { orders: ProductionOrder[] }) {
  const k = getOpenOrderKPIs(orders)
  const cards = [
    { label: 'Open Orders', value: k.openOrders.toLocaleString(), icon: Package, sub: 'Active purchase orders' },
    { label: 'Total Lines', value: k.totalLines.toLocaleString(), icon: TrendingUp, sub: 'SKU line items' },
    { label: 'Units Remaining', value: k.unitsRemaining.toLocaleString(), icon: Package, sub: 'To be received' },
    { label: 'Units Received', value: k.unitsReceived.toLocaleString(), icon: CheckCircle2, sub: 'Received to date' },
    { label: 'Overdue', value: k.overdue.toLocaleString(), icon: AlertTriangle, sub: 'Past expected delivery', danger: true },
  ]
  return (
    <div className="oot-kpi-grid">
      {cards.map((c) => (
        <div key={c.label} className="oot-kpi-card">
          <div className="oot-kpi-head">
            <span className="oot-kpi-label">{c.label}</span>
            <c.icon size={16} className={c.danger ? 'oot-kpi-icon-danger' : 'oot-kpi-icon'} />
          </div>
          <div className={c.danger ? 'oot-kpi-value oot-kpi-value-danger' : 'oot-kpi-value'}>{c.value}</div>
          <div className="oot-kpi-sub">{c.sub}</div>
        </div>
      ))}
    </div>
  )
}
```

Add matching CSS to the production module's stylesheet (find where `ProductionModule.tsx` imports its CSS; reuse existing card tokens — grid of 5, rounded 16px, subtle border `var(--border)`, danger color `#FF453A`). Keep visual parity with the ERP screenshot.

- [ ] **Step 2: Type-check + commit**

Run: `pnpm --filter @nexus/web exec tsc --noEmit` → clean.

```bash
git add apps/web/src/components/ops/production/OpenOrderKPIs.tsx
git commit -m "feat(production): ERP-parity open-order KPI bar

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 3.3: Open-Order table component

**Files:**
- Create: `apps/web/src/components/ops/production/OpenOrderTable.tsx`

**Interfaces:**
- Consumes: `ProductionOrder`, `groupByCM`, `isOverdue`, `PO_STATUS_COLORS`, `formatDate`.
- Produces: `export default function OpenOrderTable({ orders, onOpen }: { orders: ProductionOrder[]; onOpen: (o: ProductionOrder) => void })`

- [ ] **Step 1: Write the component**

Create `apps/web/src/components/ops/production/OpenOrderTable.tsx`. Requirements (match `ProductionModule.tsx` table markup/tokens):
- Group rows by manufacturer via `groupByCM(orders)`; render a collapsible group header per manufacturer showing the group's summed `qtyRemaining` on the right (mirror the screenshot's "Units Remaining 933,000").
- Each expanded group renders a table with columns: PO Number (with `orderDate` beneath), PO Status (pill colored via `PO_STATUS_COLORS`), Urgency (pill), Order Date, Delivery Due, Lines, Qty Ordered, Qty Received, Qty Remaining, ETA (green check when on-time; red `Overdue` badge when `isOverdue(o)`), Actions (eye button → `onOpen(o)`).
- Use `formatDate` for dates and `.toLocaleString()` for quantities.
- `useState` for per-group expand/collapse (default expanded).

Representative row cell for status + ETA:

```tsx
<span className="oot-pill" style={{ background: `${PO_STATUS_COLORS[o.poStatus]}22`, color: PO_STATUS_COLORS[o.poStatus] }}>
  {o.poStatus}
</span>
...
{isOverdue(o)
  ? <span className="oot-eta-overdue">⚠ {formatDate(o.eta || o.deliveryDue)}<em>Overdue</em></span>
  : <span className="oot-eta-ok">✓ {formatDate(o.eta || o.deliveryDue)}</span>}
```

- [ ] **Step 2: Type-check + commit**

Run: `pnpm --filter @nexus/web exec tsc --noEmit` → clean.

```bash
git add apps/web/src/components/ops/production/OpenOrderTable.tsx
git commit -m "feat(production): manufacturer-grouped open-order table

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 3.4: Mount KPI bar, view toggle, filters, Refresh, Export in `ProductionModule.tsx`

**Files:**
- Modify: `apps/web/src/components/ops/production/ProductionModule.tsx`

**Interfaces:**
- Consumes: `OpenOrderKPIs`, `OpenOrderTable`, `downloadOpenOrdersCsv`, `ALL_PO_STATUSES`, existing query client.

- [ ] **Step 1: Add imports** for the three new components/helpers and `ALL_PO_STATUSES`.

- [ ] **Step 2: Add an "Open Orders" view** alongside the existing board/table toggle. When active, render `<OpenOrderKPIs orders={orders} />` then the filter row (reuse existing search input; add a PO-status `<select>` populated from `ALL_PO_STATUSES` and a manufacturer `<select>` from the distinct `cm` values) then `<OpenOrderTable orders={filtered} onOpen={openDrawer} />`.

- [ ] **Step 3: Add Export CSV + Refresh buttons** in the module header for the Open-Order view:
  - Export → `downloadOpenOrdersCsv(filtered)`.
  - Refresh → `await fetch('/integrations/erp/refresh-open-orders', { method: 'POST' })` then `queryClient.invalidateQueries()` for the production module items query. Use the existing fetch/base-URL helper the module already uses for API calls (grep for how it fetches items).

- [ ] **Step 4: Manual verification**

Run: `cd /Users/ahmadgeorge/Nexus-Collab && pnpm dev` (or `pnpm dev:web`), open Operations → Production Tracking → Open Orders. Verify against the ERP screenshots: 5 KPI cards, manufacturer groups with Units-Remaining rollups, PO-status/urgency pills, ETA/Overdue badges, working search + status + manufacturer filters, Export downloads a CSV, Refresh repopulates from the synthetic feed. Use the `verify` skill / `/run` if helpful.

- [ ] **Step 5: Commit + open PR 3**

```bash
git add apps/web/src/components/ops/production/ProductionModule.tsx
git commit -m "feat(production): open-order view — KPIs, grouped table, filters, CSV, refresh

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push -u origin feat/oot-3-ui
gh pr create --base main --title "OOT PR 3: enhanced open-order UI" --body "Third of 4 PRs. Adds the ERP-parity Open-Order view to Production Tracking: KPI bar, manufacturer-grouped table, filters, CSV export, and Refresh (calls the PR2 inbound sync). Production detail retained in the drawer.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

### Task 3.5: PO Status + Urgency editors in the drawer

**Files:**
- Modify: `apps/web/src/components/ops/production/ProductionOrderDrawer.tsx`

- [ ] **Step 1:** Add a "PO Status" `<select>` (options `ALL_PO_STATUSES`) and an "Urgency" `<select>` (`Normal`/`Urgent`) to the drawer, wired to the existing PATCH-on-change flow the drawer already uses for other fields (grep the drawer for its update handler). Keep the existing Production Status control unchanged and visually distinct (label them "PO Status" vs "Production Status"). Commit with the same trailer. (This lands in PR 3.)

---

# PR 4 — Outbound Sync (Nexus → ERP)

Branch: `feat/oot-4-outbound-sync` off `main` **after PR 3 is merged**.

### Task 4.1: Register the outbound feed + mapper

**Files:**
- Modify: `apps/api/src/lib/erpRouting.ts`
- Modify: `apps/api/src/lib/erpPush.ts`

**Interfaces:**
- Consumes: `mapOpenOrderForErp` (erpOpenOrders), `ERP_OUTBOUND_FEEDS`, `MAPPERS`.

- [ ] **Step 1: Register the outbound feed**

In `erpRouting.ts`, add to `ERP_OUTBOUND_FEEDS`:

```typescript
  {
    key: 'openOrders',
    label: 'Open Orders / PO Status',
    sourceModuleType: 'PRODUCTION_TRACKING',
    defaultPath: '/open-orders',
    description: 'Push PO status, urgency, qty received, ETA, and notes back to the ERP.',
  },
```

- [ ] **Step 2: Register the mapper**

In `erpPush.ts`, import and register:

```typescript
import { mapOpenOrderForErp } from './erpOpenOrders'
```

Add to `MAPPERS`:

```typescript
  openOrders: mapOpenOrderForErp,
```

- [ ] **Step 3: Add a push-shape check**

Create `apps/api/scripts/checks/openOrdersPush.check.ts`:

```typescript
import assert from 'node:assert'
import { mapOpenOrderForErp } from '../../src/lib/erpOpenOrders'
const p = mapOpenOrderForErp({ customerPo: 'P1', poStatus: 'Acknowledged', urgency: 'Urgent', qtyReceived: 10, eta: '2026-12-14', notes: [{ noteDate: '3.10', noteText: 'ok' }], bulkFormula: 'BF-1' })
assert.equal(p.poStatus, 'Acknowledged'); assert.equal(p.urgency, 'Urgent'); assert.equal(p.notes, '3.10 ok'); assert.ok(!('bulkFormula' in p))
console.log('openOrdersPush.check: all assertions passed')
```

Run: `cd /Users/ahmadgeorge/Nexus-Collab && npx tsx apps/api/scripts/checks/openOrdersPush.check.ts` → passes.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/lib/erpRouting.ts apps/api/src/lib/erpPush.ts apps/api/scripts/checks/openOrdersPush.check.ts
git commit -m "feat(erp): register openOrders outbound feed + mapper

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 4.2: Push-on-edit endpoint + drawer wiring

**Files:**
- Modify: `apps/api/src/routes/integrations.ts`
- Modify: `apps/web/src/components/ops/production/ProductionOrderDrawer.tsx`

**Interfaces:**
- Consumes: `pushToErp` (erpPush), `mapOpenOrderForErp` (erpOpenOrders), `getOutbound`.
- Produces: route `POST /integrations/erp/push-open-order/:itemId`.

- [ ] **Step 1: Add the single-item push endpoint**

In `integrations.ts`:

```typescript
// Push a single production item's PO status/notes to the ERP (fired from the
// drawer on a PO-status change or note add). Dry-run when ERP unconfigured.
router.post('/erp/push-open-order/:itemId', async (req, res) => {
  try {
    const item = await prisma.moduleItem.findUnique({ where: { id: req.params.itemId } })
    if (!item) return res.status(404).json({ ok: false, error: 'item not found' })
    const integration = await prisma.integration.findFirst({ where: { type: 'ERP_KAREVE_SYNC' } })
    const path = getOutbound(integration).openOrders?.erpPath || '/open-orders'
    const result = await pushToErp(prisma, path, [mapOpenOrderForErp(item.data as any)])
    res.json({ ok: true, ...result })
  } catch (err) {
    res.status(502).json({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
})
```

Import `pushToErp` from `../lib/erpPush`, `mapOpenOrderForErp` from `../lib/erpOpenOrders`, `getOutbound` from `../lib/erpRouting`.

- [ ] **Step 2: Fire the push from the drawer**

In `ProductionOrderDrawer.tsx`, after a successful PATCH that changes `poStatus`, `urgency`, or appends a note, call `fetch('/integrations/erp/push-open-order/' + itemId, { method: 'POST' })` (best-effort; log on failure, do not block the UI). Use the module's existing API base-URL helper.

- [ ] **Step 3: Type-check + manual verify**

Run: `pnpm --filter @nexus/api exec tsc --noEmit` and `pnpm --filter @nexus/web exec tsc --noEmit` → clean.
Manual: change a PO status in the drawer; with ERP unconfigured, the endpoint returns `{ dryRun: true }` and the UI is unaffected. Confirm no console errors.

- [ ] **Step 4: Commit + open PR 4**

```bash
git add apps/api/src/routes/integrations.ts apps/web/src/components/ops/production/ProductionOrderDrawer.tsx
git commit -m "feat(erp): push PO status/notes to ERP on drawer edit

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push -u origin feat/oot-4-outbound-sync
gh pr create --base main --title "OOT PR 4: outbound open-order sync" --body "Last of 4 PRs. Registers the openOrders outbound feed + mapper and pushes PO status/urgency/qtyReceived/ETA/notes back to the ERP when edited in the drawer (dry-run when ERP unconfigured). Completes the two-way sync.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

## Self-Review

**Spec coverage:**
- §4 fields → Task 1.1 ✅ / §2 mappers → Task 1.2 ✅
- §6 inbound → Tasks 2.1–2.3 ✅ / §6 outbound → Tasks 4.1–4.2 ✅
- §5 UI (KPIs, table, filters, CSV, refresh, drawer editors) → Tasks 3.1–3.5 ✅
- §6 merge semantics (Nexus fields preserved, notes append-only) → Task 1.2 + checks ✅
- §7 triggers (refresh, edit push, orchestrator) → Tasks 2.3, 4.2 ✅
- §8 config-gated synthetic/dry-run → Tasks 2.1, 4.1/4.2 ✅
- §10 4 sequential PRs on main → PR sections ✅

**Placeholder scan:** No TBD/TODO. Two intentional "grep/read then edit" steps (locating the sync orchestrator in 2.3; drawer update handler in 3.5/4.2) — these are discovery steps, not placeholders, because the exact host file/handler name must be confirmed in-repo; each specifies precisely what to add.

**Type consistency:** `ErpOpenOrder`, `mapErpOpenOrder`, `mapOpenOrderForErp`, `mergeOpenOrderIntoData`, `ProductionOrder` field names, `PoStatus`, `ALL_PO_STATUSES`, `PO_STATUS_COLORS`, `isOverdue`, `getOpenOrderKPIs`, `syncErpOpenOrders`, `fetchErpOpenOrders` used consistently across all tasks.
