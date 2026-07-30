# Geodis Inventory Import — Design

**Date:** 2026-07-30
**Status:** Approved, ready for implementation

## Problem

Geodis (3PL) holds finished-goods stock that Nexus has no visibility into. Today the
only inventory in Nexus comes from the KarEve ERP sync. Operations needs the Geodis
position visible alongside it, refreshed automatically rather than by hand.

Geodis can email a scheduled inventory report. Nexus should ingest that email, parse
the attached stock file, and update a Geodis inventory module — with no human step in
the normal case.

## Scope

In scope:

- Route inbound Geodis report emails to a deterministic importer.
- Parse `.xlsx` / `.csv` attachments via a configurable column mapping.
- Maintain a Geodis inventory module using full-snapshot semantics.
- Guard against truncated reports destroying stock figures.
- Surface Geodis stock as a subsection of the Operations → Inventory tab.
- Create and renew the Microsoft Graph mail subscription that makes any of this fire.

Out of scope:

- Combined cross-warehouse totals per SKU (each warehouse stays its own row).
- Writing back to Geodis.
- The hardcoded `inventoryAlerts: 3` stub at `apps/web/src/app/routes/dashboard.tsx:621`
  (pre-existing, unrelated).

## Key decisions

| Decision | Choice | Why |
|---|---|---|
| Ingestion | Reuse `AGENT_MAILBOX`, hard-route before the AI executor | Reuses the working webhook; no second mailbox to keep alive |
| Data model | Separate `INVENTORY_HEALTH` module for Geodis | No key collision with the ERP sync, which keys purely on `sku` |
| Parser | Deterministic column mapping, no AI | Stock numbers drive ordering decisions; a silent misread is worse than a loud failure |
| Missing SKUs | Zeroed and flagged, not deleted | Preserves history; "went to zero" is the operationally meaningful signal |
| Safety | Hold import if rows < 70% of last good run | A truncated report would otherwise zero out hundreds of live SKUs |
| UI | Segmented control inside the existing Inventory tab | Matches the "subsection" requirement; reuses table, filters, pagination |

## Architecture

```
Geodis portal (scheduled report)
   │ email + .xlsx attachment
   ▼
AGENT_MAILBOX (M365 mailbox on the Bridge/KarEve tenant)
   │ Graph change notification
   ▼
POST /api/v1/email-agent/webhook                      [exists]
   ▼
processIncomingEmail(messageId)                       [exists — one new branch]
   │
   ├─► feedRouter.matchFeed(email)   [NEW]
   │        │ matched                      │ not matched
   │        ▼                              ▼
   │   runInventoryImport()  [NEW]    Claude parser + executor  [unchanged]
   │        │
   │        ├─ select .xlsx/.csv attachment
   │        ├─ parseSheet  → raw rows
   │        ├─ mapRows     → validated records
   │        ├─ guard       → rows >= 70% of last good run
   │        ├─ snapshot upsert (single transaction)
   │        └─ SyncLog + Pulse + reply email
```

**Safety property:** the feed router runs *before* Claude parsing and returns without
falling through. A matched Geodis email can never reach the autonomous executor. This
is what makes sharing the agent mailbox acceptable, and it is asserted by a test.

## Data model

No schema migration. Existing models cover it.

### Feed configuration — `Integration`

`type: 'GEODIS_INVENTORY_FEED'`, with `config`:

```json
{
  "targetModuleId": "<Geodis INVENTORY_HEALTH module id>",
  "match":     { "fromContains": "geodis.com", "subjectContains": "inventory" },
  "columnMap": { "sku": "Item", "name": "Description", "brand": "Brand",
                 "onHand": "On Hand", "committed": "Allocated", "available": "Available" },
  "guard":     { "minRowRatio": 0.7, "maxBadRowRatio": 0.1 }
}
```

`columnMap` values are matched against sheet headers case-insensitively with
surrounding whitespace trimmed. Every key except `sku` is optional; `available`
falls back to `onHand - committed` when absent.

### Run history — `SyncLog`

One row per import attempt, related to the `Integration`. Statuses:

- `complete` — applied
- `held` — guard tripped, nothing written
- `mapping_error` — headers did not match, nothing written
- `error` — unexpected failure, nothing written

The guard's baseline is `recordsProcessed` from the most recent `complete` run, so no
additional field is needed. The first-ever import has no baseline and is always applied.

### Inventory rows — `ModuleItem`

Geodis rows live in their own `DepartmentModule`:
`{ type: 'INVENTORY_HEALTH', name: 'Geodis Inventory', departmentId: <Operations> }`.

Because it shares the `INVENTORY_HEALTH` type, `everything.tsx` and the AI context in
`apps/api/src/routes/ai.ts` pick these rows up with no change.

```json
{
  "sku": "AMB-1024",
  "name": "Fade Cream 2oz",
  "brand": "Ambi",
  "onHand": 1150,
  "committed": 250,
  "available": 900,
  "warehouse": "GEODIS",
  "source": "GEODIS_FEED",
  "monthlyDemand": null,
  "coverageMonths": null,
  "status": "critical",
  "lastSyncedAt": "2026-07-30T06:02:00.000Z",
  "missingSince": null
}
```

Locally-managed fields (notably `monthlyDemand`) are preserved across imports, matching
the existing `syncErpInventory` behavior.

### Snapshot semantics

Rows are keyed by `sku` within the Geodis module.

- Present in file → upsert; `missingSince` cleared.
- Absent from file → `onHand`/`committed`/`available` set to `0`, `missingSince` stamped
  with the run timestamp if not already set, status recomputed. The row is never deleted.
- The entire pass runs in one `prisma.$transaction`, so a mid-import failure writes nothing.

## Components

### New

| File | Responsibility |
|---|---|
| `apps/api/src/lib/inventoryStatus.ts` | Shared coverage/status grading, extracted from `erpSync.ts` |
| `apps/api/src/services/inventoryImport/parseSheet.ts` | Buffer + filename → `{ headers, rows }`; xlsx and csv |
| `apps/api/src/services/inventoryImport/mapRows.ts` | Raw rows + `columnMap` → validated records + per-row errors |
| `apps/api/src/services/inventoryImport/importInventorySnapshot.ts` | Guard, transactional snapshot upsert, `SyncLog` |
| `apps/api/src/services/inventoryImport/feedRouter.ts` | Match an inbound email against configured feeds |
| `apps/api/src/services/emailAgent/subscription.ts` | Create / renew the Graph mail subscription |
| `apps/api/src/routes/inventoryImport.ts` | Status, logs, mapping config, manual upload, re-run a held import |

### Modified

| File | Change |
|---|---|
| `apps/api/src/services/emailAgent/processor.ts` | Early feed-router branch, before Claude parsing |
| `apps/api/src/lib/erpSync.ts` | Use the extracted status helpers instead of local copies |
| `apps/api/src/worker.ts` | Repeating subscription-renewal job |
| `apps/web/src/app/routes/departments/ops.tsx` | Warehouse segmented control + import status header |

### Dependencies

Add `exceljs` and `papaparse` to `@nexus/api`.

Deliberately **not** npm's `xlsx`: the registry copy is frozen at 0.18.5 with unpatched
prototype-pollution and ReDoS advisories after SheetJS moved current releases to their
own CDN. Two focused libraries are preferable to one stale one.

Add `vitest` as a dev dependency and define `test` in `apps/api/package.json`. The repo
currently has **no test runner and no tests** — `pnpm test` resolves to `pnpm -r test`
with nothing implementing it. This design depends on tests, so the runner comes with it.

## Microsoft Graph subscription lifecycle

Nothing in the repository currently creates or renews the Graph subscription that drives
`/api/v1/email-agent/webhook`. Microsoft caps mail subscriptions at roughly 4230 minutes
(~3 days). Without renewal this feature works for three days and then stops silently,
with no error anywhere.

`subscription.ts` provides:

- `ensureSubscription()` — find an existing live subscription for the mailbox or create
  one, with `clientState` set to `AGENT_WEBHOOK_SECRET` and a notification URL derived
  the same way `getRedirectUri` derives its base.
- `renewSubscriptions()` — extend anything expiring within 24 hours.

Called on API startup and from a BullMQ repeating job every 12 hours. Both are no-ops
when Graph credentials or `AGENT_MAILBOX` are unset, so local development is unaffected.

## Error handling

| Condition | Behavior |
|---|---|
| No attachment, or none with a supported extension | `SyncLog: error`, reply email, no writes |
| Sheet headers do not satisfy `columnMap` | `SyncLog: mapping_error` recording found vs expected headers, reply email, no writes |
| Row count < `minRowRatio` × last good count | `SyncLog: held`, Pulse + reply email, no writes, re-runnable from the UI |
| Individual unparseable rows | Skipped and collected into `errors`; if they exceed `maxBadRowRatio` the run is `held` instead |
| Duplicate notification for one message | Already prevented by the unique `EmailAgentLog.messageId` |
| Unexpected throw | `SyncLog: error` + Pulse; the transaction guarantees no partial write |

Every non-`complete` outcome notifies through both a Pulse and a reply to the sender, so
a failure is visible without opening the app.

## Testing

Runner: vitest, scoped to `@nexus/api`.

- `parseSheet` — xlsx and csv fixtures, blank trailing rows, quoted csv fields, BOM.
- `mapRows` — case/whitespace-insensitive header matching, missing optional columns,
  `available` fallback arithmetic, non-numeric cells, blank SKUs.
- Guard arithmetic — first run with no baseline, ratio just above and below threshold,
  bad-row ratio breach.
- `importInventorySnapshot` — create, update, zero-out-missing, `missingSince` set once
  and cleared on return, `monthlyDemand` preservation, transactional rollback.
- `feedRouter` — positive and negative matching, and an explicit assertion that a matched
  email never invokes the executor.

Fixtures are derived from a real Geodis export once one is available. Until then the
default `columnMap` is a placeholder tuned to the first real file.

## Delivery

Four PRs, each branched from `main` independently (never stacked).

1. **Foundations** — extract `inventoryStatus.ts`, add `exceljs`/`papaparse`/`vitest`,
   implement `parseSheet` and `mapRows` with tests. No runtime wiring.
2. **Importer** — provision the Geodis module, implement `importInventorySnapshot` with
   the guard and `SyncLog`, expose the manual-upload route. End-to-end usable by
   uploading a file by hand, before any email plumbing exists.
3. **Email automation** — `feedRouter`, the `processor.ts` branch, and Graph subscription
   create/renew plus its worker job.
4. **UI** — Operations tab segmented control, import status header, mapping config.

PR 2 is the first point at which the feature delivers value and can be validated against
a real Geodis file.

## Open item

The default `columnMap` cannot be finalized until a real Geodis report is available. PR 1
ships a documented placeholder mapping; fitting it to the real file is a one-line config
change requiring no code modification.
