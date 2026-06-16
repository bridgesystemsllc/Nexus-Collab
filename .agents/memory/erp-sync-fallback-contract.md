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

# ERP returns one page at a time — walk all pages

The KarEve ERP wraps lists as `{ success, data, meta:{ page, limit, total } }`
and **caps page size at 100** (asking for more still returns 100). A single
request therefore returns only the first slice. The shared fetch helper must
walk pages via `?page=N&limit=N` using `meta.total` to know when to stop.

**Why:** a one-shot fetch silently truncated the catalog (got ~25–33 of 457).
**How to apply:** keep an upper page-count guard so a bad `total` can't loop
forever; an empty page = legitimate end (break), but a mid-pagination HTTP /
non-JSON error after page 1 succeeded must THROW (don't persist a partial
catalog over real data). The SKU pipeline ingests ACTIVE products only
(`isActive !== false` and status not inactive/discontinued); inventory ingests
all products.

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
