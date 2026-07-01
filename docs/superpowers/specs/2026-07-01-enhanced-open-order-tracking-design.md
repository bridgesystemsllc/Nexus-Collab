# Enhanced Open-Order Tracking — Nexus ⇄ KareEve ERP Sync

**Date:** 2026-07-01
**Status:** Approved design (pending spec review)
**Module:** Operations → Production Tracking

## 1. Goal

Merge the KareEve ERP's "Open Order Intelligence" purchase-order tracking view into
Nexus's existing Production Tracking module, producing **one enhanced Open-Order
Tracking experience** that keeps every existing production field while adding the
ERP's PO-lifecycle view, KPIs, and columns. Status changes and notes sync
**bidirectionally** between Nexus and the KareEve ERP over the existing
`ERP_KAREVE_SYNC` integration.

## 2. Background & Current State

### Nexus Production Tracking (today)
- Production-centric records stored as a JSON blob in `ModuleItem.data`
  (`packages/prisma/prisma/schema.prisma` — `ModuleItem`), so **additive fields
  require no DB migration**.
- Fields: brand, cm, customerPo, salesOrder, work orders, item/description,
  qtyOrdered/Remaining/Produced/Skids, unitPrice/orderValue, dates
  (order/ship/original/requestedDel/promised), leadTime, productionLine,
  bulkFormula, batchSize, kRequired, rmStatus, compStatus, week fields,
  `status` (7 production statuses), progressPct, cowork fields, isEmergency,
  `notes[]`, `components[]`.
- UI: `apps/web/src/components/ops/production/` — `ProductionModule.tsx`
  (board + table + KPI bar + filters), `ProductionOrderDrawer.tsx` (detail,
  notes, tasks, delivery-date history), `productionData.ts` (types/constants/
  helpers), `OpenOrderImport.tsx` (Excel import).

### KareEve ERP "Open Order Intelligence" (target, from screenshots)
- PO-centric. KPI cards: **Open Orders, Total Lines, Units Remaining,
  Units Received, Overdue**.
- Manufacturer-grouped table (Paklab, Twincraft, Glenmark, Cosmax...) with a
  per-group Units-Remaining rollup.
- Columns: PO Number (+ order date), **PO Status** (Sent to Vendor,
  Acknowledged), **Urgency** (Normal/Urgent), Order Date, **Delivery Due**,
  **Lines**, Qty Ordered, **Qty Received**, Qty Remaining, **ETA** (with green
  check or red **Overdue** badge), Actions.
- Search PO/manufacturer, status filter, manufacturer filter, Export CSV,
  Refresh, "Last sync: N min ago".

### The sync channel already exists
Nexus already has a config-gated `ERP_KAREVE_SYNC` integration:
- Inbound (`apps/api/src/lib/erpClient.ts` + `erpSync.ts`): pulls inventory,
  SKUs, components, pricing, CMs. Real data when credentials are configured,
  otherwise a clearly-labelled **synthetic dev feed**.
- Outbound (`apps/api/src/lib/erpPush.ts` + `erpRouting.ts`): a feed registry
  (`ERP_OUTBOUND_FEEDS`) with per-feed mappers pushes components, BOMs, finance
  to configurable ERP paths. Unconfigured → **dry run** (never fakes a send).

This design **extends the same proven pattern** to carry open-order status +
notes both ways. No new plumbing is invented.

## 3. Chosen Approach

**Approach A — Enhance the existing Production Tracking module** into one unified
view: the ERP-style Open-Order table + KPIs become the primary lens, and all
production detail is retained in the drawer. Same underlying records, ERP-synced.

Rejected: (B) a separate Open-Order sub-tab linked to production orders — two
things to keep in sync; (C) full record-model unification replacing the ERP
concept — largest blast radius and migration risk.

### Status model: keep both, side by side
The ERP's **PO lifecycle status** and Nexus's **production status** coexist as two
distinct fields/badges. ERP sync only ever reads/writes **PO Status**; the
production status stays Nexus-internal. Nothing is lost on either side.

- **PO Status** (synced): `Draft`, `Sent to Vendor`, `Acknowledged`,
  `In Production`, `Partially Received`, `Received`, `Closed`, `Cancelled`.
- **Production Status** (Nexus-only, unchanged): the existing 7 values.

## 4. Data Model (additive — no migration)

Add to the `ProductionOrder` interface in `productionData.ts` (stored in
`ModuleItem.data`):

| Field | Type | Purpose |
|---|---|---|
| `poStatus` | `PoStatus` | ERP-synced PO lifecycle status (new enum above) |
| `urgency` | `'Normal' \| 'Urgent'` | Urgency badge (reconcile with existing `coworkPriority`/`isEmergency`) |
| `qtyReceived` | `number` | Units received per ERP receipts (complements `qtyProduced`) |
| `deliveryDue` | `string` (date) | ERP delivery-due date |
| `eta` | `string` (date) | Explicit ETA (distinct from shipDate/promisedDate) |
| `lineCount` | `number` | SKU line items on the PO |
| `erpPoId` | `string` | Stable ERP PO identifier for reconciliation/matching |
| `erpLastSyncAt` | `string` (ISO) | Per-record last sync timestamp (conflict resolution) |

New constants: `ALL_PO_STATUSES`, `PO_STATUS_COLORS`. Overdue is **derived**, not
stored: `eta` (or `deliveryDue`) `< today` AND `poStatus` not in
{`Received`,`Closed`,`Cancelled`}.

## 5. UI

Enhance `ProductionModule.tsx` (and a new `OpenOrderTable.tsx` if the file grows
too large — the module is already ~1,600 lines, so extract the table):

1. **KPI bar** (ERP parity, merged with existing): Open Orders, Total Lines,
   Units Remaining, Units Received, Overdue — alongside existing value/emergency/
   cowork KPIs.
2. **Manufacturer-grouped Open-Order table**: collapsible group headers with a
   Units-Remaining rollup; columns PO# (+order date), PO Status, Urgency,
   Order Date, Delivery Due, Lines, Qty Ordered, Qty Received, Qty Remaining,
   ETA (+ Overdue badge), Actions (open drawer).
3. **Filters**: search PO/manufacturer, PO-status filter, manufacturer filter.
4. **Export CSV** and **Refresh** (Refresh triggers inbound sync).
5. Production detail (batch, formula, RM/comp, tasks, delivery history) stays in
   `ProductionOrderDrawer.tsx`; add PO Status + Urgency editors there.
6. Built to the `ahmad-design-skill` premium standard; reuse existing design
   tokens (`var(--accent)`, status color maps).

## 6. Two-Way Sync

### Inbound (ERP → Nexus)
- `fetchErpOpenOrders(prisma)` in `erpClient.ts` → `ErpOpenOrder[]`
  (poNumber, erpPoId, manufacturer, poStatus, urgency, orderDate, deliveryDue,
  eta, qtyOrdered, qtyReceived, qtyRemaining, lineCount, notes). Config-gated,
  with a synthetic dev feed mirroring the screenshot data (Paklab/Twincraft/
  Glenmark/Cosmax). Reuses `fetchErpRecords` (paging, dual-auth, JSON-shape
  guards). Candidate paths: `/open-orders`, `/purchase-orders`, `/pos`.
- `syncErpOpenOrders(prisma)` in `erpSync.ts` → **upserts** into the
  `PRODUCTION_TRACKING` module items, matching on `erpPoId` (fallback
  `customerPo`). **Merge semantics:** ERP fields (poStatus, urgency, qtyReceived,
  deliveryDue, eta, lineCount, qtyOrdered/Remaining) overwrite; **Nexus-only
  production fields are never clobbered**; notes are **append-only** (union by
  note id). Stamps `erpLastSyncAt`.

### Outbound (Nexus → ERP)
- New outbound feed `openOrders` in `erpRouting.ts` (`ERP_OUTBOUND_FEEDS`) +
  `mapOpenOrderForErp(data)` in `erpPush.ts` emitting
  `{ poNumber, erpPoId, poStatus, urgency, qtyReceived, eta, notes }`.
- On PO-status change or note add in the drawer, push that single item to the
  ERP (targeted), and include it in the batch feed for full sync. Reuses
  `pushToErp` (dual-auth, dry-run when unconfigured).

### Conflict resolution
Last-writer-wins **per field** using `erpLastSyncAt` vs `updatedAt`. Notes are
append-only (union by id) so no note is ever lost regardless of direction.

## 7. Sync Triggers
- **Refresh** button → inbound `syncErpOpenOrders`.
- PO-status / note edit → outbound push of that item.
- The existing scheduled sync orchestrator additionally runs the new inbound
  feed and the `openOrders` outbound feed.

## 8. External Dependency (flagged, non-blocking)
The KareEve ERP must expose: (a) a **GET** for open-orders/POs and (b) a **POST**
accepting PO-status/note writes. The screenshots confirm the ERP already holds
this data ("sourced directly from the PO module"), so this is a matter of
confirming/enabling two endpoints on the ERP side. Until confirmed, dev runs on
the **synthetic feed + dry-run push** — identical to how components/BOMs/finance
already behave. Development is **not blocked**; endpoint paths are config-driven.

## 9. Scope / YAGNI
- No websockets/real-time — reuse the existing manual + scheduled sync pattern.
- No exact ERP endpoint hardcoding — config-driven candidate paths, matching
  `erpClient`'s established convention.
- No new DB tables/migrations — additive JSON fields only.
- No changes to the production-status enum or existing production workflows.

## 10. Delivery Plan (4 sequential PRs, each based on `main`)
1. **Data model + types + mappers**: PO-status enum/colors, new `ProductionOrder`
   fields, `ErpOpenOrder` type, `mapOpenOrderForErp`. (+ this spec)
2. **Inbound sync**: `fetchErpOpenOrders` + synthetic feed, `syncErpOpenOrders`
   merge logic, refresh API endpoint.
3. **Enhanced UI**: KPI bar, Open-Order table (extracted component), filters,
   Export CSV, Refresh, drawer PO-status/urgency editors.
4. **Outbound sync**: `openOrders` feed in `erpRouting`, push-on-edit wiring.

PRs are sequential (each depends on the prior merged to `main`), per the
"base every PR on `main`, never stack" workflow.

## 11. Testing
- Unit: `mapOpenOrderForErp`, `ErpOpenOrder` mapping, overdue derivation, merge
  semantics (Nexus-only fields preserved, notes union), KPI computation.
- Integration: inbound sync upsert against synthetic feed; outbound dry-run push
  shape; refresh endpoint.
- Manual: verify enhanced UI against the ERP screenshots at the premium design
  standard; confirm status/note edits round-trip in dry-run.
