# Open-Order / Production Tracker Merge + ERP Sync — Design

**Date:** 2026-07-07
**Status:** Approved (design phase)
**Author:** Ahmad George + Claude

## Problem

The KarEve ERP (AmbiSyncOperations-V2, a separate Replit app) has an **Open Order Tracking**
screen: purchase orders grouped by manufacturer, each PO expandable into its per-SKU line
items, with status pills, urgency chips, order/delivery dates, and qty ordered/received/
remaining. Nexus Operations has a **Production Tracking** module, but it is a *flat* model —
one production order per row, grouped only by Contract Manufacturer, with no PO→line-item
hierarchy and no live tie to the ERP's PO lifecycle.

Ahmad wants the two merged into one experience inside Nexus: the Production Tracker should
gain the ERP's grouped Open-Order look **and** sync with the ERP so a PO edited in one place
reflects in the other.

## Goals

1. Add an **Open Orders** view mode to the Nexus Production Tracking module that mirrors the
   ERP's manufacturer → PO → line-items hierarchy.
2. Sync Open-Order / PO data between Nexus and the ERP with clear field ownership.
3. Ship the read path (ERP → Nexus) live now; build the write-back path (Nexus → ERP) but
   keep it dark until the ERP exposes write endpoints.

## Non-Goals

- Building the ERP-side write endpoints (that is separate work on AmbiSyncOperations-V2).
- Replacing or removing the existing Board / Table production views — they stay untouched.
- A background scheduler / interval auto-sync (manual refresh + full-sync ride only; auto is a
  clean follow-up).

## Key Decisions (from brainstorming)

| Decision | Choice |
|----------|--------|
| Sync channel | ERP is **read-only today**; write-back built but dark. Phased: read now, write later. |
| View structure | **New "Open Orders" view mode** with manufacturer → PO → line-items hierarchy. Board/Table untouched. |
| Data model | Each PO is **its own record** with embedded `lines[]`, stored in a dedicated `OPEN_ORDERS` module (separate from flat production-board items). |
| Conflict rule | **Split ownership.** ERP owns PO-lifecycle fields; Nexus owns the fields it adds; notes are append-only union. |

## Relationship to PR #63

PR #63 ("Remove standalone Open Order Tracking") is **merged** — `main` no longer contains the
earlier half-baked `openOrders` code (`erpOpenOrders.ts`, `syncErpOpenOrders`, the old routes,
`OpenOrderView.tsx`, etc.). This feature is a clean rebuild on top of that removal. The genuinely
reusable ideas from the old code (the split-ownership merge strategy and the ERP payload mappers)
are reconstructed here from git history rather than restored wholesale, because the data model
now carries real `lines[]` instead of a bare `lineCount`.

## Architecture

The feature reuses the existing ERP-sync machinery (the same pattern as the working `skus`,
`inventory`, and `cm` feeds), so it plugs into infrastructure that already exists.

### Data model

Open Orders are stored as `ModuleItem`s in a **dedicated `OPEN_ORDERS` `DepartmentModule`**,
kept separate from the flat production-board items so the Board/Table views never encounter a
mixed record shape.

`ModuleItem.data` for an Open-Order PO:

```
{
  erpPoId,          // ERP's stable internal ID — primary bidirectional match key
  poNumber,         // e.g. "P06222026" — secondary match key
  manufacturer,     // "Paklab", "Twincraft", … — grouping key
  poStatus,         // "Sent to Vendor" | "Acknowledged" | "In Production" | …
  urgency,          // "Normal" | "Urgent"
  orderDate,
  deliveryDue,
  eta,
  qtyOrdered,       // header aggregate
  qtyReceived,      // header aggregate
  qtyRemaining,     // derived: max(qtyOrdered - qtyReceived, 0)
  lines: [
    { lineNo, sku, description, qtyOrdered, qtyReceived, unitPrice }
  ],
  notes: [ { id, noteDate, noteText, createdBy, createdAt } ],   // append-only
  nexusFields: { /* internal flags, cowork, internal notes — Nexus-owned */ },
  erpLastSyncAt
}
```

`ModuleItem.status` is denormalized to `poStatus` (matching how other feeds mirror status).

### Sync engine

New `openOrders` feed, following the existing feed contract in `erpRouting.ts` /
`erpSync.ts` / `erpClient.ts` / `erpPush.ts`.

**Inbound (ERP → Nexus) — live now:**

- `ERP_FEEDS` gains `{ key: 'openOrders', defaultModuleType: 'OPEN_ORDERS', … }`, added to the
  implemented/default-enabled set.
- `fetchErpOpenOrders(prisma, erpPath?)` in `erpClient.ts`: tries `/open-orders` →
  `/purchase-orders` → `/pos`; returns a **labelled synthetic dev feed** (Paklab/Twincraft/
  Glenmark/Cosmax POs with real line items) when the ERP is unconfigured, so the whole feature
  is testable before the real ERP endpoint is confirmed. Throws (never writes sample data over
  real POs) when configured-but-failing.
- `mapErpOpenOrder(raw)` normalizes varied ERP field shapes into the typed record above,
  including mapping each raw line into `lines[]`.
- `syncErpOpenOrders(prisma, targetModuleId?, erpPath?)` in `erpSync.ts`: pulls PO records,
  matches existing Nexus records by `erpPoId` → falls back to `poNumber`, merges via
  `mergeOpenOrderIntoData()`, creates unseen POs fresh. Registered in the `FEED_SYNCS` map so it
  rides the full `syncErp()` orchestration.

**Merge — split ownership (`mergeOpenOrderIntoData`):**

- ERP **overwrites**: `poStatus`, `urgency`, `qtyOrdered`, `qtyReceived`, `qtyRemaining`,
  `orderDate`, `deliveryDue`, `eta`, `lines`.
- Nexus **preserved untouched**: everything in `nexusFields`.
- `notes`: append-only union — ERP notes not already present (by rendered text) are appended;
  existing Nexus notes never removed.
- `erpLastSyncAt` stamped on every merge.

**Outbound (Nexus → ERP) — built but dark:**

- `ERP_OUTBOUND_FEEDS` gains `{ key: 'openOrders', sourceModuleType: 'OPEN_ORDERS',
  defaultPath: '/open-orders', … }` with `enabled: false` by default.
- `mapOpenOrderForErp(data)` emits only ERP-owned fields + flattened notes.
- Wired into the push machinery but config-gated: `pushToErp` already dry-runs (returns
  `{ dryRun: true, sent: 0 }`) when the ERP is unconfigured, so nothing is ever faked. When the
  ERP write endpoint is ready, flip `enabled: true` — no code change.

**Triggers:**

- `POST /erp/refresh-open-orders` — the Refresh button in the Open-Orders view (pulls + upserts
  independently of the full sync).
- `POST /erp/push-open-order/:itemId` — fired from the PO edit drawer after a status/urgency/
  note change; dry-runs until write-back is live.
- Full `syncErp()` also runs the `openOrders` inbound feed.

### UI — the "Open Orders" view mode

Added to `ProductionModule.tsx` as a third toggle beside Board / Table. Renders the ERP layout,
restyled with `ahmad-design-skill` so it reads as native Nexus:

- **KPI strip:** Active POs · SKU line items · To-be-received · Received-to-date · Past-expected-
  delivery.
- **Filter bar:** search (PO number / manufacturer), status filter, manufacturer filter.
- **Collapsible manufacturer groups** with header count + units-remaining total
  (`Paklab · 13 POs · 933,000 remaining`).
- **PO rows:** status pill, urgency chip, order date, delivery due, lines count, qty ordered /
  received / remaining, ETA, expand caret, row action (open edit drawer).
- **Expanded line items:** the per-SKU `lines[]` with qty ordered / received / unit price.
- **Edit drawer:** edit `poStatus` / `urgency` / notes (the write-back fields). On save →
  PATCH the ModuleItem, then `POST /erp/push-open-order/:itemId` (dry-run until live).

## Data flow

```
ERP /open-orders ──GET──▶ fetchErpOpenOrders ──▶ mapErpOpenOrder ──▶ syncErpOpenOrders
                                                                          │
                                                    mergeOpenOrderIntoData (split ownership)
                                                                          │
                                                                   upsert ModuleItem
                                                                          │
                                            OPEN_ORDERS module items ◀────┘
                                                     │
                              Open Orders view (group by manufacturer → PO → lines)
                                                     │
                                 edit poStatus/urgency/notes in drawer
                                                     │
                       PATCH ModuleItem ──▶ POST /erp/push-open-order (dry-run until ERP write live)
                                                     │
                                        mapOpenOrderForErp ──▶ pushToErp ──▶ ERP (when enabled)
```

## Error handling

- Inbound: configured-but-failing ERP fetch throws so the orchestrator isolates the feed
  (never overwrites real POs with synthetic data). Unconfigured → labelled synthetic feed.
- Outbound: config-gated dry-run; never fabricates a send.
- Merge: match precedence `erpPoId` → `poNumber`; unmatched ERP POs created, never dropped.
  Notes append-only so no history is lost on either side.

## Testing

- `mapErpOpenOrder` / `mergeOpenOrderIntoData` / `mapOpenOrderForErp` are pure functions —
  unit-checkable in isolation (varied ERP field shapes, split-ownership preservation, append-only
  notes, unmatched-PO creation).
- Inbound sync verified end-to-end against the synthetic feed (no ERP required).
- Outbound push verified in dry-run mode (asserts `dryRun: true`, correct mapped payload, no
  network send).
- UI verified against the synthetic feed: grouping, expand, filters, KPI math, drawer edit →
  PATCH round-trip.

## Delivery

Single PR based on `main`, built in verifiable layers:

1. `OPEN_ORDERS` module type + data model + feed catalog entries.
2. Inbound: `fetchErpOpenOrders`, `mapErpOpenOrder`, `mergeOpenOrderIntoData`, `syncErpOpenOrders`
   (test against synthetic feed).
3. Outbound (dark): `mapOpenOrderForErp` + push wiring, config-gated.
4. UI: Open Orders view mode + edit drawer.
5. Routes: `/erp/refresh-open-orders`, `/erp/push-open-order/:itemId`; wire Refresh + drawer.

Full two-way sync goes live later with a one-flag flip once the ERP write endpoint exists.
