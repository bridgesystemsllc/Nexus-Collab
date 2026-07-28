---
name: ERP purchase-order sync scope
description: Which ERP feeds NEXUS Open Orders syncs from, the newer snake_case API shape, and the live-vs-dev URL gotcha
---

## Scope (user decision)
Sync Open Orders ONLY from the ERP's Purchase Order module (`/purchase-orders`) and Open Order module (`/open-orders`). Never scan the ~32k general `/orders` list — a scan was built then rejected/removed July 2026.

## Newer ERP API shape (July 2026 ERP update)
- `/open-orders` list returns headers only in snake_case: `po_number`, `vendor_name`, `order_date`, `expected_delivery_date`, `urgency`, enum statuses like `SENT_TO_VENDOR`, `line_count`, empty `skus`, ids prefixed `apo-<uuid>`.
- Line items live at `/purchase-orders/<uuid>` (strip the `apo-` prefix) under `line_items` with `line_number`, `item_sku`, `item_description`, `ordered_quantity`, `received_quantity`, `unit_price`.
- `mapErpOpenOrder`/`mapErpOpenOrderLine` accept both camelCase and snake_case; enum statuses are humanized ("Sent to Vendor"). fetchErpOpenOrders does throttled (batch 5), best-effort detail fetches for header-only records.
- The `/purchase-orders` LIST endpoint 500s on the ERP side (detail by id works). The open-order fetch tolerates one module failing.

## Live vs dev URL
The connection must point at `https://dashboard.kareve.com` (live). If it points at the ERP's temporary `*.replit.dev` dev URL, syncs 502 whenever that workspace is asleep. **How to fix:** decrypt integration config with encryption.ts helpers, change `apiUrl`, re-encrypt, update the row — never re-run /connect with partial creds (it re-encrypts the whole blob).

## Trigger
The real sync endpoint is `POST /api/v1/integrations/erp/refresh-open-orders`. `POST /api/v1/ai/actions/sync-erp` is a stub that only bumps counters — do not use it to test syncing.
