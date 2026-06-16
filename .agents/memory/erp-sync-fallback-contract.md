---
name: ERP feed synthetic-fallback contract
description: When the ERP client may return synthetic data vs. throw, and why fire-and-forget sync work must be crash-proof.
---

# ERP feed fallback contract

The ERP client (`apps/api/src/lib/erpClient.ts`) exposes per-feed fetchers
(skus/inventory/components/pricing/cm). Each returns a labelled SYNTHETIC dev
feed **only when the integration is unconfigured** (no apiUrl/apiKey). When the
integration IS configured, the fetcher uses REAL data only and THROWS on any
failure (unreachable, unauthorized, HTML/non-JSON, or zero usable records).

**Why:** silently falling back to synthetic in configured/live mode overwrites
real operational data (e.g. inventory stock levels ops act on) with fake values
and masks real ERP outages/schema drift. A code review flagged this as blocking.

**How to apply:** the `syncErp` orchestrator wraps each feed in try/catch, so a
thrown feed is isolated + logged, the feed writes nothing, the integration stays
CONNECTED, and the overall sync still completes. Keep new feed fetchers to the
same shape: `if (!configured) return synthetic(); ...throw on failure`.

# ERP base URL + JSON guard

Users paste just the host (no `/api/v1`). `erpBaseCandidates(apiUrl)` tries the
URL as-is then with `/api/v1` appended; `looksLikeJson(ct, body)` rejects a
200-with-HTML (an SPA index.html for an unknown route). Both probing
(`probeErpLive`) and fetching (`fetchErpRecords`) must use these, or an HTML 200
gets mistaken for live data.

# Out-of-band sync must never reject

The `/integrations/:type/sync` handler responds immediately then runs the sync
in `setTimeout(() => void runSync(), 2000)`. `runSync` MUST be fully guarded
(nested try/catch on the failure-recording path) — an unhandled rejection here
crashes the tsx process, the workflow auto-restarts, and the integration is left
stuck at status SYNCING which the UI renders as "Not connected". On failure keep
status CONNECTED (the sync degrades, it doesn't truly disconnect).
