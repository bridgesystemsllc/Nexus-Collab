---
name: ERP PO-file imports live in /orders
description: Where the KarEve ERP actually keeps purchase orders and how NEXUS finds them
---

The ERP's dedicated `/open-orders` feed publishes only a couple of records and `/purchase-orders` is empty. Real purchase orders (imported via "Purchase Order file" upload in the ERP) live in the general `/orders` list (32k+ sales orders, newest-first) tagged with notes containing "Imported from Purchase Order file".

**Constraints discovered:**
- Server-side filters on `/orders` are IGNORED (total unchanged) except `?status=` works. Client-side filtering is required.
- Page size caps at 100. The list is sorted newest-first, so recent PO imports sit in the first pages.
- `/orders/:id` returns full line items (`items[]` with sku/name/quantity/picked/packed); the list rows have no items.
- The ERP throttles bursts of detail fetches — keep concurrency low (~3) and retry with backoff; even then occasional fetches fail during a sync.

**Why:** NEXUS open-orders sync merges the dedicated feed + a newest-N-pages scan of `/orders`; header-only fallback records (no lines, zero qty) must never overwrite previously captured lines/quantities (merge guards against this).

**How to apply:** If POs seem "missing" from Open Orders, they may be older than the scan window (newest ~1000 orders). Already-synced POs are never deleted — only their live updates stop once they age out. Deep backfill = temporarily raise the page cap.
