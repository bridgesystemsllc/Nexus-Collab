# ERP ↔ Nexus Open-Order Two-Way Sync — ERP-side Spec

**Audience:** the engineer/agent building the **ERP side** (`AmbiSyncOperations-V2`,
the KarEve Sync app). The **Nexus side is already built and live** — this document
is the exact contract Nexus speaks, so implement the ERP endpoints to match it.

**Goal:** a purchase order (PO / "open order") edited in **either** app reflects in the
other. Nexus already **reads** open orders from the ERP; this spec adds the **write-back**
endpoint so Nexus edits (status, urgency, ETA, quantities received, notes) land in the ERP.

---

## 1. How Nexus connects to the ERP

Nexus stores the ERP base URL + API key on its `ERP_KAREVE_SYNC` integration. On every
call it sends **both** auth headers (implement whichever the ERP uses; support either):

```
Authorization: Bearer <apiKey>
X-API-Key: <apiKey>
Content-Type: application/json
Accept: application/json
```

Base URL handling: Nexus tries the URL as configured, then with `/api/v1` appended. Expose
the endpoints below at whatever prefix the API key is scoped to; just tell Nexus the base URL.

All responses must be **JSON** with `Content-Type: application/json` (Nexus rejects HTML/SPA
fallbacks). Timeouts: reads 10s, writes 15s.

---

## 2. READ endpoint (already consumed by Nexus — verify it matches)

Nexus **pulls** open orders on refresh/sync. It tries these paths in order and uses the first
that returns JSON: `GET /open-orders` → `/purchase-orders` → `/pos`.

**Response** — an array (bare array, or wrapped in `{ data: [...] }` / `{ openOrders: [...] }` /
`{ purchaseOrders: [...] }`). Pagination optional: if you return `{ meta: { total } }`, Nexus
walks pages with `?page=N&limit=100`.

Each PO record (Nexus reads these fields; unknown fields are ignored, missing ones defaulted):

```jsonc
{
  "erpPoId": "PL-1",                 // REQUIRED — stable ERP id, the primary match key
  "poNumber": "P06222026",           // REQUIRED — human PO number, secondary match key
  "manufacturer": "Paklab",          // a.k.a. vendor / vendorName / cm
  "poStatus": "Sent to Vendor",      // a.k.a. status
  "urgency": "Normal",               // "Normal" | "Urgent"
  "orderDate": "2026-06-21",         // ISO date (YYYY-MM-DD)
  "deliveryDue": "2026-11-29",
  "eta": "2026-11-29",
  "qtyOrdered": 100000,              // optional — else summed from lines
  "qtyReceived": 0,                  // optional — else summed from lines
  "qtyRemaining": 100000,            // optional — else qtyOrdered - qtyReceived
  "lines": [
    {
      "lineNo": 1,
      "sku": "A2210100",
      "description": "Ambi Even & Clear 10 vertical",
      "qtyOrdered": 25000,
      "qtyReceived": 0,
      "unitPrice": 1.75
    }
  ],
  "notes": "free-text CM/vendor notes"
}
```

Field aliases Nexus accepts (use any): `poNumber|poNo|purchaseOrder|po`,
`manufacturer|vendor|vendorName|cm|supplier`, `poStatus|status`, `urgency|priority`,
`deliveryDue|dueDate|requestedDelivery|deliveryDate`, `eta|expectedDelivery|promisedDate`,
line `sku|itemCode|skuNumber|code`, line `qtyOrdered|quantityOrdered|orderedQty|quantity`,
line `qtyReceived|quantityReceived|receivedQty`, line `unitPrice|price|cost`.

---

## 3. WRITE-BACK endpoint (BUILD THIS)

Nexus **pushes** PO updates back. Implement:

```
POST /open-orders
```

(If you prefer a different path, tell the Nexus admin — it's configurable per-feed; the default
is `/open-orders`.)

**Request body** — a batch, always wrapped in `records`:

```jsonc
{
  "records": [
    {
      "erpPoId": "PL-1",              // primary match key (may be "" if unknown)
      "poNumber": "P06222026",        // secondary match key
      "poStatus": "Acknowledged",     // Nexus-updated lifecycle status
      "urgency": "Urgent",            // "Normal" | "Urgent"
      "qtyReceived": 25000,           // PO-level received total (Nexus-updated)
      "eta": "2026-11-30",            // Nexus-updated ETA (ISO date)
      "lines": [
        { "lineNo": 1, "sku": "A2210100", "qtyReceived": 25000 }
      ],
      "notes": "2026-07-09 Received partial shipment"  // flattened, date-prefixed string
    }
  ]
}
```

Notes:
- One or many records per call. Single-PO edits from the Nexus drawer send exactly one record;
  a bulk push sends every open order.
- `notes` is a single flattened string (Nexus joins its note history into a date-prefixed line).
  **Append** it to the PO's notes/comments on the ERP; do not overwrite existing ERP notes.

**Matching / upsert rule** (apply per record):
1. Match by `erpPoId` when present and non-empty.
2. Else match by `poNumber`.
3. If matched, update the PO. If not matched, **create** a new PO from the record (or reject with
   a clear error if PO creation isn't allowed from Nexus — see error handling).

**Which fields the ERP should accept from Nexus (Nexus-owned on write-back):**
`poStatus`, `urgency`, `eta`, `qtyReceived` (PO-level), per-line `qtyReceived` (by `lineNo`/`sku`),
and appended `notes`. Everything else about the PO stays ERP-owned; ignore fields not listed.

**Response** — 2xx on success. Any 2xx is treated as success by Nexus. Recommended body:

```jsonc
{
  "ok": true,
  "updated": 1,          // count matched + updated
  "created": 0,          // count created (if you allow creation)
  "results": [           // optional per-record detail
    { "erpPoId": "PL-1", "poNumber": "P06222026", "status": "updated" }
  ]
}
```

**Error handling:**
- Auth failure → `401`. Validation failure → `400` with `{ error: "..." }`.
- A record that can't be matched (and creation disallowed) → include it in the response as
  `{ ..., "status": "unmatched" }` with an overall `200`, OR return `422` for the batch — either
  is fine, just be consistent. Nexus logs the response; it does not retry automatically.
- Return JSON, never HTML.

**Idempotency:** the same record may be sent more than once (e.g. Nexus re-saves). Applying the
same values twice must be a no-op — key on `erpPoId`/`poNumber`, don't duplicate notes already
present (dedupe by the rendered note text).

---

## 4. Turning it on in Nexus (after the ERP endpoint exists)

The Nexus outbound `openOrders` feed ships **disabled** (dry-run) so nothing is sent until the
ERP is ready. Once `POST /open-orders` is live on the ERP, a Nexus admin enables it:

- Set the ERP integration's outbound config `openOrders.enabled = true` (and optionally
  `openOrders.erpPath` if the path differs from `/open-orders`).
- No Nexus code change is needed — it's a config flip. Until then, Nexus "Save & Sync" performs a
  **dry run** (maps + reports the payload, sends nothing).

Nexus push entry points (for reference / testing):
- Single PO: `POST /integrations/erp/push-open-order/:itemId` → sends one record.
- Bulk: the outbound push over all `OPEN_ORDERS` items when the feed is enabled.

---

## 5. Acceptance test (end-to-end)

1. In Nexus, open a PO → change status to "Acknowledged", set ETA, add a note → **Save & Sync**.
2. ERP `POST /open-orders` receives `{ records: [ { erpPoId, poStatus:"Acknowledged", eta, notes } ] }`
   and updates the matching PO; the note is appended, not overwritten.
3. In Nexus, click **Refresh from ERP** → the PO reflects the ERP state (round-trip consistent).
4. Re-save the same values → ERP applies them idempotently (no duplicate notes, no dupe PO).

Deliver: `POST /open-orders` implemented per §3, matching Nexus's payload, returning JSON 2xx.
Then tell the Nexus admin the base URL so the outbound feed can be enabled (§4).
