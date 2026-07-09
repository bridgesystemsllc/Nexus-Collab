---
name: ERP purchase-order sync scope
description: Which ERP feeds NEXUS Open Orders syncs from, and the user's explicit scope decision
---

**Rule:** NEXUS Open Orders syncs ONLY from the ERP's two dedicated modules — `/purchase-orders` (Purchase Order module) and `/open-orders` (Open Order module), merged and deduped by poNumber. The general `/orders` sales list must NOT be scanned.

**Why:** A previous fix scanned `/orders` (32k+ sales orders) for records tagged "Imported from Purchase Order file" and imported 38 of them. The user explicitly rejected this (July 2026): only the Purchase Order module and Open Order module should sync; the scanned imports were deleted.

**Context that still holds:**
- `/purchase-orders` currently publishes 0 records and `/open-orders` publishes 2, even though the user sees 20+ POs in their ERP UI — the ERP app isn't exposing its PO module data through its API. Fixing that belongs in the ERP app, not NEXUS.
- Server-side filters on `/orders` are ignored (except `?status=`); page size caps at 100; the ERP throttles bursts of detail fetches.
- `mergeOpenOrderIntoData` guards remain: a header-only inbound record (no lines, zero qty) never wipes previously captured lines/quantities.

**How to apply:** If the user again reports missing POs, check what `/purchase-orders` publishes first — the fix is likely on the ERP side. Do not re-add an `/orders` scan without explicit user approval.
