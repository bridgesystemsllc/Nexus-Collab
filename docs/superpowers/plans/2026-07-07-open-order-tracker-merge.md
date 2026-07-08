# Open-Order / Production Tracker Merge + ERP Sync — Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax.
> Spec: `docs/superpowers/specs/2026-07-07-open-order-tracker-merge-design.md`.

**Goal:** Add an "Open Orders" view mode to the Production Tracking module (manufacturer → PO →
line-items hierarchy, matching the KarEve ERP) backed by a new `OPEN_ORDERS` module and a new
bidirectional `openOrders` ERP feed — inbound read-sync live now, outbound write-back built but dark.

**Architecture:** Reuse the existing ERP-sync machinery (identical pattern to the working `skus` /
`inventory` / `cm` feeds). Open Orders are stored as `ModuleItem`s in a dedicated `OPEN_ORDERS`
`DepartmentModule` (separate from flat production-board items). The Nexus UI adds a third view mode
inside `ProductionModule` fed by the `OPEN_ORDERS` module's items passed down from `ops.tsx`.

**Tech Stack:** TypeScript, Express + Prisma (apps/api), React + Vite (apps/web), pnpm workspaces.

## Global Constraints

- No test framework exists in apps/api. Verify each backend task with `pnpm --filter @nexus/api build`
  (tsc typecheck) plus a standalone `npx tsx` check script for pure logic.
- Split ownership on merge: ERP owns `poStatus, urgency, qtyOrdered, qtyReceived, qtyRemaining,
  orderDate, deliveryDue, eta, lines`; Nexus owns `nexusFields`; `notes` are append-only union.
- Config-gating: inbound throws when configured-but-failing (never writes synthetic over real data),
  returns synthetic when unconfigured. Outbound dry-runs when unconfigured (never fakes a send).
- Outbound `openOrders` feed defaults `enabled: false` (dark until ERP write endpoint exists).
- Match precedence for upsert: `erpPoId` → `poNumber`.
- Follow existing code idioms exactly (comment density, defensive `str()/num()` helpers, `source:
  'ERP_KAREVE'`, `lastSyncedAt`/`erpLastSyncAt` stamps).

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `apps/api/src/lib/erpOpenOrders.ts` | Create | Pure fns: types, `mapErpOpenOrder`, `mergeOpenOrderIntoData`, `mapOpenOrderForErp` |
| `apps/api/src/lib/erpClient.ts` | Modify | `fetchErpOpenOrders` + synthetic PO feed |
| `apps/api/src/lib/erpRouting.ts` | Modify | `openOrders` in `ERP_FEEDS` + `IMPLEMENTED_FEED_KEYS` + `ERP_OUTBOUND_FEEDS` |
| `apps/api/src/lib/erpSync.ts` | Modify | `ensureOpenOrdersModule`, `syncErpOpenOrders`, `FEED_SYNCS` entry |
| `apps/api/src/lib/erpPush.ts` | Modify | `mapOpenOrderForErp` in `MAPPERS` |
| `apps/api/src/routes/integrations.ts` | Modify | `POST /erp/refresh-open-orders`, `POST /erp/push-open-order/:itemId` |
| `apps/api/scripts/checks/openOrders.check.ts` | Create | tsx assertions for map/merge/mapForErp |
| `apps/web/src/app/routes/departments/ops.tsx` | Modify | Pass `OPEN_ORDERS` items + moduleId to `ProductionTab` |
| `apps/web/src/components/ops/production/ProductionModule.tsx` | Modify | Third view mode + `OpenOrdersView` + edit drawer + refresh |
| `apps/web/src/components/ops/production/openOrderData.ts` | Create | Open-order types + grouping/KPI helpers (web) |
| `packages/prisma/prisma/seed.ts` | Modify | Seed an `OPEN_ORDERS` module in Operations |

---

## Task 1: Pure open-order logic (`erpOpenOrders.ts`) + feed catalog

**Files:**
- Create: `apps/api/src/lib/erpOpenOrders.ts`
- Modify: `apps/api/src/lib/erpRouting.ts` (ERP_FEEDS ~L27, IMPLEMENTED_FEED_KEYS L63, ERP_OUTBOUND_FEEDS ~L173)
- Create: `apps/api/scripts/checks/openOrders.check.ts`

**Interfaces produced:**
```ts
interface ErpOpenOrderLine { lineNo: number; sku: string; description: string; qtyOrdered: number; qtyReceived: number; unitPrice: number }
interface ErpOpenOrder {
  erpPoId: string; poNumber: string; manufacturer: string; poStatus: string
  urgency: 'Normal' | 'Urgent'; orderDate: string; deliveryDue: string; eta: string
  qtyOrdered: number; qtyReceived: number; qtyRemaining: number
  lines: ErpOpenOrderLine[]; notes: string; source: 'ERP_KAREVE'
}
function mapErpOpenOrder(raw: Record<string, any>): ErpOpenOrder
function mergeOpenOrderIntoData(existing: Record<string, any>, erp: ErpOpenOrder, now: string): Record<string, any>
function mapOpenOrderForErp(data: Record<string, any> | null | undefined): Record<string, any>
```

- [ ] **Step 1 — Write `erpOpenOrders.ts`.** Mirror the removed file's structure (reconstructed from
  git PR #63 diff) but with a real `lines[]` array instead of a bare `lineCount`, and Nexus-owned
  data grouped under `nexusFields`. Key behavior:
  - `mapErpOpenOrder`: defensive field aliasing (`poNumber ?? poNo ?? purchaseOrder ?? po`,
    `manufacturer ?? vendor ?? vendorName ?? cm`, etc.); map each raw line via aliases
    (`lineNo/line`, `sku/itemCode`, `qtyOrdered/quantityOrdered`, `unitPrice/price`); derive
    `qtyRemaining = max(qtyOrdered - qtyReceived, 0)` when not supplied; header `qtyOrdered/
    qtyReceived` fall back to the sum of line quantities; `urgency` normalizes to `'Urgent'` iff
    raw is "urgent", else `'Normal'`.
  - `mergeOpenOrderIntoData`: ERP overwrites `poStatus, urgency, qtyOrdered, qtyReceived,
    qtyRemaining, orderDate, deliveryDue, eta, lines, manufacturer`; keep `erpPoId`/`poNumber`;
    preserve `existing.nexusFields` untouched; `notes` append-only union keyed by rendered text;
    stamp `erpLastSyncAt = now`, `source: 'ERP_KAREVE'`.
  - `mapOpenOrderForErp`: emit only ERP-owned fields + flattened notes string (never Nexus internals).
- [ ] **Step 2 — Catalog entries in `erpRouting.ts`.** Add to `ERP_FEEDS`:
  `{ key: 'openOrders', label: 'Open Orders / Purchase Orders', defaultModuleType: 'OPEN_ORDERS',
  description: 'Purchase-order lifecycle: status, urgency, qty received, delivery due, ETA, line items.' }`.
  Add `'openOrders'` to `IMPLEMENTED_FEED_KEYS`. Add to `ERP_OUTBOUND_FEEDS`:
  `{ key: 'openOrders', label: 'Open Orders / PO Status', sourceModuleType: 'OPEN_ORDERS',
  defaultPath: '/open-orders', description: 'Push PO status, urgency, qty received, ETA, notes back to the ERP.' }`.
  (Outbound stays `enabled:false` by default via `defaultOutboundEntry` — no change needed there.)
- [ ] **Step 3 — Check script.** `openOrders.check.ts`: assert (a) `mapErpOpenOrder` maps a raw
  Paklab-shaped record incl. lines and derived `qtyRemaining`; (b) `mergeOpenOrderIntoData`
  overwrites ERP fields, preserves a seeded `nexusFields.isEmergency`, and appends a new note
  without dropping an existing one; (c) `mapOpenOrderForErp` omits `nexusFields`. `console.log`
  a pass line per assertion; `process.exit(1)` on mismatch.
- [ ] **Step 4 — Verify.** `npx tsx apps/api/scripts/checks/openOrders.check.ts` → all pass;
  `pnpm --filter @nexus/api build` → no type errors.
- [ ] **Step 5 — Commit** `feat(erp): open-order pure logic + feed catalog entries`.

---

## Task 2: Inbound fetch + synthetic feed (`erpClient.ts`)

**Files:** Modify `apps/api/src/lib/erpClient.ts` (add near the CM section, end of file)

**Interfaces produced:** `fetchErpOpenOrders(prisma: PrismaClient, path?: string): Promise<ErpOpenOrder[]>`

- [ ] **Step 1 — Synthetic feed.** Add `SYNTHETIC_ERP_OPEN_ORDERS` (Paklab / Twincraft / Glenmark /
  Cosmax POs from the ERP screenshots, each with a real `lines[]`), and `syntheticOpenOrders():
  ErpOpenOrder[]` mapping them via `mapErpOpenOrder`. Timestamps computed at call time.
- [ ] **Step 2 — Fetcher.** Add `fetchErpOpenOrders(prisma, path?)`: unconfigured →
  `syntheticOpenOrders()`; configured → `fetchErpRecords(apiUrl, apiKey,
  candidatePaths(path, '/open-orders', '/purchase-orders', '/pos'),
  ['openOrders','open_orders','purchaseOrders','pos','orders'])`, map via `mapErpOpenOrder`,
  `.filter(r => r.poNumber)`; throw if zero usable records. Import `mapErpOpenOrder` +
  `type ErpOpenOrder` from `./erpOpenOrders`.
- [ ] **Step 3 — Verify.** `pnpm --filter @nexus/api build`; extend the check script to call
  `fetchErpOpenOrders(fakePrisma)` with an unconfigured stub and assert it returns the synthetic set.
- [ ] **Step 4 — Commit** `feat(erp): fetchErpOpenOrders + synthetic PO feed`.

---

## Task 3: Inbound sync + auto-provision module (`erpSync.ts`)

**Files:** Modify `apps/api/src/lib/erpSync.ts` (imports L2-9, FEED_SYNCS L128-144, append fns)

**Interfaces produced:**
```ts
function ensureOpenOrdersModule(prisma): Promise<DepartmentModule | null>
function syncErpOpenOrders(prisma, targetModuleId?, erpPath?): Promise<ErpSyncResult>
```

- [ ] **Step 1 — `ensureOpenOrdersModule`.** Find first `OPEN_ORDERS` module; if none, find the first
  `PRODUCTION_TRACKING` module (Operations always has one) and create an `OPEN_ORDERS` module in the
  same `departmentId` (`name: 'Open Orders', sortOrder: 6`). Return it (or null if no Ops dept found).
  This guarantees the feature works on the live DB without re-seeding.
- [ ] **Step 2 — `syncErpOpenOrders`.** Resolve module: explicit `targetModuleId` →
  `findUnique`; else `ensureOpenOrdersModule`. Load existing items, index by `erpPoId` then
  `poNumber`. `fetchErpOpenOrders(prisma, erpPath)`. For each ERP PO: match by `erpPoId` →
  `poNumber`; if matched, `mergeOpenOrderIntoData(existing.data, erp, now)` → update (status =
  `data.poStatus`); else merge onto a fresh `{ poNumber, manufacturer, nexusFields:{}, notes:[] }`
  → create. Return `{recordsProcessed, created, updated}`. Import `fetchErpOpenOrders` (erpClient),
  `mergeOpenOrderIntoData` (erpOpenOrders).
- [ ] **Step 3 — Register.** Add to `FEED_SYNCS`: `openOrders: (prisma, moduleId, erpPath) =>
  syncErpOpenOrders(prisma, moduleId, erpPath ?? undefined)`.
- [ ] **Step 4 — Verify.** `pnpm --filter @nexus/api build`.
- [ ] **Step 5 — Commit** `feat(erp): syncErpOpenOrders inbound feed + auto-provision module`.

---

## Task 4: Outbound push mapper (`erpPush.ts`)

**Files:** Modify `apps/api/src/lib/erpPush.ts` (imports L3, MAPPERS L117-121)

- [ ] **Step 1 — Wire mapper.** Import `mapOpenOrderForErp` from `./erpOpenOrders`; add
  `openOrders: mapOpenOrderForErp` to `MAPPERS`. (Selection stays gated by `enabled:false`
  outbound default; `loadFeedPayloads` sources the `OPEN_ORDERS` module automatically.)
- [ ] **Step 2 — Verify.** `pnpm --filter @nexus/api build`.
- [ ] **Step 3 — Commit** `feat(erp): wire openOrders outbound mapper (dark by default)`.

---

## Task 5: API routes (`integrations.ts`)

**Files:** Modify `apps/api/src/routes/integrations.ts` (import `syncErpOpenOrders` from erpSync,
`pushToErp` from erpPush, `mapOpenOrderForErp` from erpOpenOrders, `getOutbound` from erpRouting)

- [ ] **Step 1 — Refresh route.** `POST /erp/refresh-open-orders` → `await syncErpOpenOrders(prisma)`
  → `res.json({ ok: true, ...result })`; 502 on error. (Pulls + upserts independently of full sync;
  auto-provisions the module.)
- [ ] **Step 2 — Push-one route.** `POST /erp/push-open-order/:itemId` → load the `ModuleItem`
  (404 if missing); resolve path from `getOutbound(integration).openOrders?.erpPath || '/open-orders'`;
  `await pushToErp(prisma, path, [mapOpenOrderForErp(item.data)])` → `res.json({ ok:true, ...result })`
  (dry-runs until ERP write-back is live); 502 on error.
- [ ] **Step 3 — Verify.** `pnpm --filter @nexus/api build`.
- [ ] **Step 4 — Commit** `feat(erp): refresh-open-orders + push-open-order routes`.

---

## Task 6: Web data helpers (`openOrderData.ts`)

**Files:** Create `apps/web/src/components/ops/production/openOrderData.ts`

**Interfaces produced:**
```ts
interface OpenOrderLine { lineNo:number; sku:string; description:string; qtyOrdered:number; qtyReceived:number; unitPrice:number }
interface OpenOrder { id:string; erpPoId:string; poNumber:string; manufacturer:string; poStatus:string;
  urgency:'Normal'|'Urgent'; orderDate:string; deliveryDue:string; eta:string;
  qtyOrdered:number; qtyReceived:number; qtyRemaining:number; lines:OpenOrderLine[];
  notes:Array<{id:string;noteDate:string;noteText:string;createdBy:string;createdAt:string}>; nexusFields?:Record<string,any> }
function toOpenOrder(item:{id:string;data:any}): OpenOrder            // ModuleItem → OpenOrder
function groupByManufacturer(orders:OpenOrder[]): Array<{manufacturer:string; orders:OpenOrder[]; poCount:number; unitsRemaining:number}>
function openOrderKpis(orders:OpenOrder[]): {activePOs:number; lineItems:number; toReceive:number; received:number; pastDue:number}
const PO_STATUSES: string[]                                          // filter options
```

- [ ] **Step 1 — Write helpers** (pure, no I/O). `toOpenOrder` reads defensively from `item.data`.
  `groupByManufacturer` groups + sorts by manufacturer, sums remaining. `openOrderKpis` computes the
  five KPI-strip numbers (`pastDue` = count with `eta`/`deliveryDue` before today and `qtyRemaining>0`).
- [ ] **Step 2 — Verify.** `pnpm --filter @nexus/web build` (tsc). Commit
  `feat(web): open-order data helpers`.

---

## Task 7: Open Orders view mode (`ProductionModule.tsx` + `ops.tsx`)

> **UI task — invoke `ahmad-design-skill` before writing JSX** (premium Apple/Tesla feel).

**Files:**
- Modify `apps/web/src/components/ops/production/ProductionModule.tsx` (ViewMode L1432,
  ViewSwitcher L1434-1467, state L1472, render branch L1554-1569, component props)
- Modify `apps/web/src/app/routes/departments/ops.tsx` (moduleData L1052-1062, moduleIds L1064-1071,
  ProductionTab mount L1158)

- [ ] **Step 1 — Thread data in `ops.tsx`.** Add `openOrders: find('OPEN_ORDERS')` to `moduleData`,
  `openOrders: moduleByType('OPEN_ORDERS')?.id ?? null` to `moduleIds`, and pass
  `openOrders={moduleData.openOrders}` + `openOrderModuleId={moduleIds.openOrders}` +
  `onRefresh={refetch}` into `<ProductionTab .../>` (thread through to `ProductionModule`).
- [ ] **Step 2 — Extend ProductionModule props + view mode.** `type ViewMode = 'board' | 'table' |
  'openOrders'`. Add `{ key:'openOrders', label:'Open Orders', icon: ShoppingCart }` to ViewSwitcher.
  Accept new props `openOrders: any[]`, `openOrderModuleId: string|null`, `onRefresh?: ()=>void`.
- [ ] **Step 3 — `OpenOrdersView` component.** Render, mapping items via `toOpenOrder`:
  KPI strip (`openOrderKpis`), search + status filter + manufacturer filter, collapsible
  manufacturer groups (`groupByManufacturer`) with header count + units-remaining, PO rows
  (status pill, urgency chip, dates, lines count, qty ordered/received/remaining, ETA, expand
  caret, edit action), expanded per-SKU `lines[]`. A **Refresh from ERP** button →
  `api.post('/integrations/erp/refresh-open-orders')` then `onRefresh?.()`.
- [ ] **Step 4 — Edit drawer.** Edit `poStatus` / `urgency` / add note → PATCH
  `/departments/_/modules/${openOrderModuleId}/items/${id}` with merged data
  (notes append-only; write into `nexusFields` for internal-only edits), then
  `api.post('/integrations/erp/push-open-order/'+id)` (dry-run until live), then `onRefresh?.()`.
- [ ] **Step 5 — Render branch.** Add `view === 'openOrders' ? <OpenOrdersView .../>` to L1554-1569.
- [ ] **Step 6 — Verify.** `pnpm --filter @nexus/web build`; visually confirm against the synthetic
  feed (grouping, expand, filters, KPI math, drawer edit round-trip).
- [ ] **Step 7 — Commit** `feat(web): Open Orders view mode in Production Tracker`.

---

## Task 8: Seed the OPEN_ORDERS module

**Files:** Modify `packages/prisma/prisma/seed.ts` (after `bomMod`, ~L52; bump module count log)

- [ ] **Step 1 — Add module.** `const openOrdersMod = await prisma.departmentModule.create({ data:
  { name: 'Open Orders', type: 'OPEN_ORDERS', departmentId: ops.id, sortOrder: 6 } })`. Update the
  `✅ Modules` count log.
- [ ] **Step 2 — Verify.** `pnpm --filter @nexus/prisma build` (or tsc on seed). Commit
  `feat(db): seed Open Orders module`.

---

## Self-Review

- **Spec coverage:** data model (T1/T6), inbound sync live (T2/T3), outbound dark (T4), routes
  (T5), UI view mode (T7), split-ownership merge (T1), append-only notes (T1), synthetic feed (T2),
  auto-provision so it works on live DB (T3), seed (T8). ✔ All spec sections mapped.
- **Placeholder scan:** none — each task names exact files, functions, and behavior.
- **Type consistency:** `ErpOpenOrder`/`ErpOpenOrderLine` (api) and `OpenOrder`/`OpenOrderLine`
  (web) mirror each other; `mergeOpenOrderIntoData`, `mapErpOpenOrder`, `mapOpenOrderForErp`,
  `syncErpOpenOrders`, `ensureOpenOrdersModule`, `fetchErpOpenOrders` referenced consistently across
  T1-T5. `nexusFields` is the single Nexus-owned container used in both merge (T1) and drawer (T7).
