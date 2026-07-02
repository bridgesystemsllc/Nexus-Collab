# Production Tracking + ERP Sync — Plan Roadmap

> **For agentic workers:** This roadmap decomposes the design spec
> (`docs/superpowers/specs/2026-07-02-production-tracking-erp-sync-design.md`) into
> four sequential plans. Each plan produces working, testable software on its own.
> Execute them in dependency order. Each plan file uses checkbox (`- [ ]`) steps and
> should be run with `superpowers:subagent-driven-development`.

**Goal:** Merge the ERP's Open Order Tracking look into the Nexus Production Tracking
module and establish bidirectional sync (status, quantities, delivery dates, notes)
between Nexus and the KarEve Sync ERP, with new ERP POs auto-creating Nexus trackers.

## Repos

- **Nexus** — `/Users/madig/Nexus-Collab` — pnpm monorepo: `apps/api` (Express + Prisma +
  tsx + BullMQ worker), `apps/web` (Vite + React + axios + React Query),
  `packages/prisma`, `packages/shared`.
- **ERP** — `/Users/madig/AmbiSyncOperations-V2` — "KarEve Sync": Express +
  Drizzle + Vitest, React client. Open Order Tracking is backed by
  `advanced_purchase_orders`.

## The four plans

| # | Plan | Repo | Deliverable | Depends on |
|---|------|------|-------------|------------|
| 1 | Nexus foundation: data model + status mapper + read endpoint + Vitest | Nexus | `ProductionOrder`/`ProductionOrderLine` tables, shared status/field mapper (tested), `GET /api/v1/production-orders`, seed data. Existing UI untouched and still working. | — |
| 2 | Nexus UI: merged "cards + ERP density" look + editable detail dialog | Nexus | Summary bar, collapsible manufacturer group cards (Units Remaining), dense table view, editable status/date/qty/notes with per-record sync indicator, all reading from Plan 1's endpoint. | 1 |
| 3 | ERP external surface: webhook events + authed advanced-PO endpoints | ERP | `open_order.*` webhook event types emitted on create/status/qty/date/note change; authed `GET/PATCH /api/v1/production-orders` over `advanced_purchase_orders`; stale catalog test fixed. | — |
| 4 | Nexus sync engine: SDK, webhook receiver, conflict/loop guard, write-back, reconciliation poller | Nexus | ERP SDK client, HMAC-verified `POST /api/v1/webhooks/erp` receiver, inbound apply with last-write-wins + loop guard, outbound write-back on Nexus edits, poller replacing the mock worker, integration toggle wiring. Full bidirectional sync. | 1, 3 (2 for UX polish) |

## Recommended execution order

`1 → 3 → 4 → 2` **or** `1 → 2 → 3 → 4`.

- Plan 1 is the hard dependency for everything.
- Plans 2 (UI) and 3 (ERP) are independent of each other and can be built in parallel
  by separate workers after Plan 1.
- Plan 4 (sync engine) needs Plans 1 and 3 done; it needs Plan 2 only for the
  final per-record sync-status UX (the engine works headless without it).

## Cross-cutting decisions (from the spec, apply to every plan)

- **Conflict rule:** last-write-wins by `lastEditedAt` timestamp, per field.
- **Identity:** `ProductionOrder.erpId` = `advanced_purchase_orders.id` (UUID);
  `poNumber` is unique on both sides and is the human/reconciliation key.
- **Synced fields:** status, unit quantities, delivery dates, notes — nothing else.
- **Notes round-trip** uses the ERP advanced-PO `internal_notes` text field (NOT the
  `production_notes` table, whose `related_id` is an integer incompatible with UUID PO
  ids).
- **Loop prevention:** every applied write stamps `lastEditedSide` + `revisionHash`;
  an inbound event whose hash equals the last-applied hash is ignored.
- **No Prisma enums** — Nexus uses `String` columns with allowed values in comments
  (matches existing schema convention).
- **Rollout:** behind the existing `ERP_KAREVE_SYNC` integration; inbound (read) sync
  enabled before outbound (write-back).

## Status mapping (canonical, used by Plans 1, 2, 4)

ERP `po_status` enum → Nexus display label + color token. Defined once in
`packages/shared/src/productionStatus.ts` (Plan 1, Task 2).

| ERP `po_status` | Nexus label | Color token |
|---|---|---|
| `DRAFT` | Draft | `--text-tertiary` |
| `SUBMITTED` | Submitted | `--info` |
| `PENDING_APPROVAL` | Pending Approval | `--warning` |
| `APPROVED` | Approved | `--info` |
| `SENT_TO_VENDOR` | Sent to Vendor | `--info` |
| `ACKNOWLEDGED` | Acknowledged | `--accent` |
| `IN_PRODUCTION` | In Production | `--accent` |
| `COMPLETE_PRODUCTION` | Production Complete | `--success` |
| `SHIPPED` | Shipped | `--success` |
| `PARTIALLY_RECEIVED` | Partially Received | `--warning` |
| `RECEIVED` | Received | `--success` |
| `CLOSED` | Closed | `--text-tertiary` |
| `CANCELLED` | Cancelled | `--danger` |
| *(unmapped)* | Unknown | `--text-tertiary` |

## Spec coverage matrix

| Spec section | Covered by |
|---|---|
| §2 UI (summary bar, group cards, table, editable dialog) | Plan 2 |
| §3 Nexus data model (`ProductionOrder`/`Line`, sync meta) | Plan 1 |
| §4 ERP→Nexus push (webhooks) | Plan 3 (emit) + Plan 4 (receive) |
| §4 Nexus→ERP write-back | Plan 3 (authed endpoints) + Plan 4 (client) |
| §4 Reconciliation poller | Plan 4 |
| §4 Loop prevention / conflict | Plan 4 (engine), Plan 1 (schema fields + mapper) |
| §4 ERP-side additions (scope, webhook emit, endpoints) | Plan 3 |
| §5 Field & status mapping | Plan 1 (mapper module) |
| §6 Auth (API key + HMAC) | Plan 3 (key/scope) + Plan 4 (HMAC verify) |
| §6 Testing | Each plan adds its own tests (Plan 1 bootstraps Nexus Vitest) |
| §6 Rollout (toggle, read-before-write) | Plan 4 |
