# Unified Production Tracking + Bidirectional ERP Sync — Design

**Date:** 2026-07-02
**Status:** Approved (design)
**Repos:** `Nexus-Collab` (PLM, Prisma/React) · `AmbiSyncOperations-V2` (ERP "KarEve Sync", Drizzle/React)

## Goal

Merge the ERP's Open Order Tracking look into the Nexus Production Tracking module
(keeping Nexus's dark/purple theme) **and** establish bidirectional sync between the
two systems for **status, unit quantities, delivery dates, and notes**. A new PO
created in the ERP automatically creates a corresponding open-order tracker in Nexus.

## Decisions (locked)

- **Build mode:** UI + sync built together (real synced data from day one).
- **Both repos in scope:** ERP will be modified and redeployed to emit webhooks and
  accept write-backs.
- **UI direction:** "Nexus cards + ERP density" — keep the Nexus card/board hero,
  inject the ERP summary bar, collapsible manufacturer group cards (Units Remaining),
  and a dense table view.
- **Conflict rule:** last-write-wins by timestamp, per field.

## 1. The two systems

- **Nexus** — your PLM. Production Tracking module (`ProductionTab`). Users edit here.
- **ERP** — "KarEve Sync." Open Order Tracking screen, backed by `advancedPurchaseOrders`
  (reads `GET /api/purchase-orders/open`, writes `PATCH /api/advanced-pos/:id`, notes via
  `/api/production-notes/...`). POs originate here.
- ERP is the **origin** of POs. After creation, the four fields sync **both ways**.

> **Critical:** the ERP has two PO tables. The Open Order Tracking UI uses
> **`advancedPurchaseOrders`**, NOT the legacy `purchaseOrders` table that the existing
> `/api/v1/purchase-orders` endpoints target. Sync must target the **advanced** POs; the
> v1/webhook surface will be extended to cover them.

## 2. UI (Nexus — "cards + ERP density")

Enhance `apps/web/src/app/routes/departments/ops.tsx` (`ProductionTab`) and
`apps/web/src/components/ItemDetailDialog.tsx`, keeping the dark/purple glass theme +
Space Grotesk.

- **Summary bar** (new, top): Active POs · SKU line items · Units to receive ·
  Received to date · Past-due — styled as glass KPI cells.
- **Collapsible manufacturer group cards:** header shows CM name · PO count ·
  **Units Remaining**; expands to the existing glass PO cards.
- **Board ⇄ Table toggle:** Board = current cards (enriched). Table = new dense
  ERP-style table (PO#, Status, Urgency, Order Date, Delivery Due, Lines, Qty Ordered,
  Qty Received, Qty Remaining, ETA).
- **Detail dialog:** editable status, delivery date, notes, quantity, with a
  per-record sync indicator (syncing… / synced ✓ / error).
- Status badges mapped to the Nexus palette (see §5).

## 3. Nexus data model (Prisma)

Promote production orders from JSON `ModuleItem.data` blobs to real tables:

- **`ProductionOrder`:** `id`, `erpId` (advancedPurchaseOrder id), `poNumber` (unique),
  `manufacturer`, `brand`, `status`, `urgency`, `orderDate`, `deliveryDue`, `eta`,
  `qtyOrdered`, `qtyReceived`, `qtyRemaining`, `notes`, `progress`, `value`, plus sync
  meta: `lastSyncedAt`, `lastEditedSide` (`NEXUS`|`ERP`), `lastEditedAt`, `syncStatus`,
  `revisionHash`.
- **`ProductionOrderLine`:** `id`, `productionOrderId`, `sku`, `description`,
  `qtyOrdered`, `qtyReceived`, `lineStatus`.
- Keep existing `Integration` / `SyncLog` models for run history.
- A thin adapter keeps the `everything.tsx` unified view working (production records
  read through the new tables).

## 4. Sync architecture

Transport: REST + webhooks over the ERP's existing API-key + webhook-delivery infra
(`webhookSubscriptions` table, `dispatchWebhookEvent` service, `requirePermission`
API-key auth).

- **ERP → Nexus (push):** ERP `dispatchWebhookEvent` fires on PO create / status / qty /
  date / note change → Nexus receives at `POST /api/v1/webhooks/erp` (HMAC-verified).
  Create → new `ProductionOrder`; update → last-write-wins merge.
- **Nexus → ERP (write-back):** on a Nexus edit, Nexus calls ERP `PATCH /api/advanced-pos/:id`
  (status/qty/dates) and `/api/production-notes` (notes) with a `kareve_nxc_prod_…` key.
- **Reconciliation poller (safety net):** the existing 15-min Nexus worker pulls
  `GET /api/purchase-orders/open`, diffs, and heals anything a missed webhook dropped.
- **Loop prevention:** each write stamps `lastEditedSide` + `revisionHash`; echoes whose
  hash matches the last-applied value are ignored.
- **Conflict:** last-write-wins by `lastEditedAt`, per field.

**ERP-side additions:**
- Add an `open_orders:read/write` (advanced-PO) scope to the Nexus API connection.
- Wire `dispatchWebhookEvent` into the advanced-PO create/update and production-notes
  code paths.
- Register Nexus's webhook receiver URL.
- Extend the v1 external surface (or a dedicated open-order endpoint) to cover advanced POs.

## 5. Field & status mapping

| Concept | Nexus | ERP (`advancedPurchaseOrders`) | Sync |
|---|---|---|---|
| Identity | `poNumber` / `erpId` | `poNumber` / `id` | key |
| Status | badge label | enum (`SENT_TO_VENDOR`, `ACKNOWLEDGED`, …) | ↔ via map |
| Quantities | qtyOrdered / Received / Remaining | ordered / received (lines) | ↔ |
| Dates | deliveryDue, eta | requested / promised delivery | ↔ |
| Notes | notes | `production-notes` | ↔ |

A single shared **status-map** module defines ERP-enum ↔ Nexus-label translation,
with a fallback "Unknown" bucket for unmapped values. Exact enum values pinned during
implementation.

## 6. Security, testing, rollout

- **Auth:** scoped API key (ERP side) + HMAC-signed webhooks (both directions); secrets
  in env vars.
- **Testing:** unit tests for the mapper, conflict resolver, and loop-guard; an
  integration test for a full round-trip (ERP create → Nexus appears → Nexus edit → ERP
  reflects) against a seeded ERP.
- **Rollout:** build behind the existing `ERP_KAREVE_SYNC` integration toggle; ship
  read-only sync first, then enable write-back once round-trip tests pass. The
  reconciliation poller makes the system self-healing.

## 7. Known risks

- Two PO tables in the ERP — sync targets **advanced** POs; extend v1/webhooks accordingly.
- Status enum mismatch — mitigated by the shared map + fallback bucket.
- Both apps deploy on Replit — webhooks need public URLs (both are already web-hosted).

## Out of scope (for now)

- Syncing fields beyond status / quantities / delivery dates / notes.
- Shipment reconciliation, receipts, store allocations, EDI fields.
- Real-time collaborative editing (sync is event + poll based, near-real-time).
