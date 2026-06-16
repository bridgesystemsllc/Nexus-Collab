---
name: ERP brand name resolution
description: Why the KarEve ERP brand name is mapped from a static brandId table, not fetched.
---
The KarEve Sync ERP product records expose brand only as a numeric `brandId`
(values 1-5), never a name. There is NO `/brands` (or `/brand`, `/manufacturers`,
etc.) endpoint — they all return the SPA's index.html — and `?include=brand` /
`?expand=brand` do not add a name. So the brand name cannot be fetched at runtime.

**Decision:** a curated `brandId -> name` map lives in erpClient.ts and is used by
mapErpRecord (after the `brand`/`brandName` alias fallbacks). Confirmed mapping by
grouping the live catalog by brandId and matching product lines:
1 Carol's Daughter, 2 Baxter of California, 3 AcneFree, 4 Ambi, 5 Dermablend.

**Why:** the plan assumed a fetchable brand list; none exists. Static map is the
only viable source of brand names.

**How to apply:** if brands come through blank again, first check whether the ERP
added/renumbered brand ids (group products by brandId) and update the map.
