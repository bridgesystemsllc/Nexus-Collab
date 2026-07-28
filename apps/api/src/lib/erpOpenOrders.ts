// ─── ERP Open-Order (Purchase Order) mapping ────────────────
// Shared pure functions for the open-order two-way sync. No I/O here so they
// can be unit-checked in isolation. The inbound client (erpClient) and the
// outbound push (erpPush) both build on these.
//
// Split ownership: the ERP owns the PO-lifecycle fields (poStatus, urgency,
// quantities, dates, eta, lines); Nexus owns everything it adds, kept under a
// single `nexusFields` container so a sync never clobbers it. Notes are
// append-only: an ERP note is added only if its rendered text isn't already
// present, and existing Nexus notes are never removed.

/** A single purchase-order line (per-SKU) within an open order. */
export interface ErpOpenOrderLine {
  lineNo: number
  sku: string
  description: string
  qtyOrdered: number
  qtyReceived: number
  unitPrice: number
}

/** A raw open-order / purchase-order record from the ERP, normalized. */
export interface ErpOpenOrder {
  erpPoId: string
  poNumber: string
  manufacturer: string
  poStatus: string
  urgency: 'Normal' | 'Urgent'
  orderDate: string
  deliveryDue: string
  eta: string
  qtyOrdered: number
  qtyReceived: number
  qtyRemaining: number
  lines: ErpOpenOrderLine[]
  notes: string
  source: 'ERP_KAREVE'
}

function s(v: unknown): string {
  return v === null || v === undefined ? '' : String(v).trim()
}
function n(v: unknown): number {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

/** Map a raw ERP PO line (field shape varies) into a typed ErpOpenOrderLine. */
export function mapErpOpenOrderLine(raw: Record<string, any>, index: number): ErpOpenOrderLine {
  const qtyOrdered = n(
    raw.qtyOrdered ?? raw.quantityOrdered ?? raw.orderedQty ?? raw.ordered_quantity ?? raw.quantity,
  )
  const qtyReceived = n(
    raw.qtyReceived ?? raw.quantityReceived ?? raw.receivedQty ?? raw.received_quantity,
  )
  return {
    lineNo: n(raw.lineNo ?? raw.line ?? raw.lineNumber ?? raw.line_number ?? index + 1) || index + 1,
    sku: s(raw.sku ?? raw.itemCode ?? raw.skuNumber ?? raw.item_sku ?? raw.item_id ?? raw.code),
    description: s(
      raw.description ?? raw.itemName ?? raw.item_description ?? raw.name ?? raw.productName,
    ),
    qtyOrdered,
    qtyReceived,
    unitPrice: n(raw.unitPrice ?? raw.price ?? raw.unit_price ?? raw.cost),
  }
}

/** Humanize an ERP enum-style status ("SENT_TO_VENDOR" → "Sent to Vendor"). */
function humanizeStatus(v: string): string {
  if (!v) return v
  if (!/^[A-Z0-9_]+$/.test(v)) return v
  return v
    .toLowerCase()
    .split('_')
    .map((w) => (w === 'to' || w === 'of' ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

/** Map a raw ERP PO record (field shape varies) into a typed ErpOpenOrder. */
export function mapErpOpenOrder(raw: Record<string, any>): ErpOpenOrder {
  const rawLines = Array.isArray(raw.lines)
    ? raw.lines
    : Array.isArray(raw.lineItems)
      ? raw.lineItems
      : Array.isArray(raw.line_items)
        ? raw.line_items
        : Array.isArray(raw.items)
          ? raw.items
          : []
  const lines = rawLines.map((l: Record<string, any>, i: number) => mapErpOpenOrderLine(l, i))

  // Header quantities fall back to the sum of line quantities when the ERP
  // doesn't supply an aggregate at the PO level.
  const lineOrdered = lines.reduce((sum, l) => sum + l.qtyOrdered, 0)
  const lineReceived = lines.reduce((sum, l) => sum + l.qtyReceived, 0)
  const qtyOrdered =
    raw.qtyOrdered != null || raw.quantityOrdered != null
      ? n(raw.qtyOrdered ?? raw.quantityOrdered ?? raw.orderedQty ?? raw.quantity)
      : lineOrdered
  const qtyReceived =
    raw.qtyReceived != null || raw.quantityReceived != null
      ? n(raw.qtyReceived ?? raw.quantityReceived ?? raw.receivedQty)
      : lineReceived
  const qtyRemaining =
    raw.qtyRemaining != null || raw.quantityRemaining != null
      ? n(raw.qtyRemaining ?? raw.quantityRemaining)
      : Math.max(qtyOrdered - qtyReceived, 0)

  const urgencyRaw = s(raw.urgency ?? raw.urgency_level ?? raw.priority).toLowerCase()
  return {
    erpPoId: s(raw.erpPoId ?? raw.id ?? raw.poId ?? raw.poNumber ?? raw.po_number ?? raw.poNo),
    poNumber: s(
      raw.poNumber ?? raw.po_number ?? raw.poNo ?? raw.purchaseOrder ?? raw.customerPo ?? raw.po,
    ),
    manufacturer: s(
      raw.manufacturer ?? raw.vendor ?? raw.vendorName ?? raw.vendor_name ?? raw.cm ?? raw.supplier,
    ),
    poStatus: humanizeStatus(s(raw.poStatus ?? raw.status ?? 'Sent to Vendor')) || 'Sent to Vendor',
    urgency: urgencyRaw === 'urgent' ? 'Urgent' : 'Normal',
    orderDate: s(raw.orderDate ?? raw.order_date ?? raw.createdAt ?? raw.poDate),
    deliveryDue: s(
      raw.deliveryDue ??
        raw.dueDate ??
        raw.requestedDelivery ??
        raw.deliveryDate ??
        raw.expected_delivery_date ??
        raw.requested_delivery_date,
    ),
    eta: s(
      raw.eta ??
        raw.expectedDelivery ??
        raw.promisedDate ??
        raw.expected_delivery_date ??
        raw.deliveryDue,
    ),
    qtyOrdered,
    qtyReceived,
    qtyRemaining,
    lines,
    notes: s(raw.notes ?? raw.comments ?? raw.note),
    source: 'ERP_KAREVE',
  }
}

/**
 * Map an OPEN_ORDERS item.data blob to the ERP open-order payload for OUTBOUND
 * push. Only the ERP-owned PO fields (+ notes) are emitted — Nexus production
 * internals under `nexusFields` are never sent. Notes are flattened to the
 * ERP's date-prefixed comment string the OOR importer already understands.
 */
export function mapOpenOrderForErp(data: Record<string, any> | null | undefined): Record<string, any> {
  const d = data ?? {}
  const notesArr = Array.isArray(d.notes) ? d.notes : []
  const notes =
    notesArr
      .map((note: any) => {
        const date = s(note?.noteDate ?? note?.date)
        const text = s(note?.noteText ?? note?.text)
        return date ? `${date} ${text}` : text
      })
      .filter(Boolean)
      .join(' ') || s(d.cmNotes)
  const lines = Array.isArray(d.lines)
    ? d.lines.map((l: any) => ({
        lineNo: n(l?.lineNo),
        sku: s(l?.sku),
        qtyReceived: n(l?.qtyReceived),
      }))
    : []
  return {
    erpPoId: s(d.erpPoId),
    poNumber: s(d.poNumber ?? d.customerPo),
    poStatus: s(d.poStatus) || 'Draft',
    urgency: s(d.urgency) === 'Urgent' ? 'Urgent' : 'Normal',
    qtyReceived: n(d.qtyReceived),
    eta: s(d.eta),
    lines,
    notes,
  }
}

/**
 * Merge an inbound ErpOpenOrder onto an existing OPEN_ORDERS item.data. ERP owns
 * the PO fields (poStatus, urgency, quantities, dates, eta, lines, manufacturer)
 * and overwrites them; every Nexus-only field lives under `nexusFields` and is
 * preserved untouched. Notes are append-only: ERP notes not already present (by
 * rendered text) are appended.
 */
export function mergeOpenOrderIntoData(
  existing: Record<string, any>,
  erp: ErpOpenOrder,
  now: string,
): Record<string, any> {
  const merged: Record<string, any> = { ...existing }

  // Identity — keep whatever we already have, fill from ERP when blank.
  merged.erpPoId = existing.erpPoId || erp.erpPoId || ''
  merged.poNumber = existing.poNumber || erp.poNumber
  // `customerPo` alias so any legacy/production consumer still resolves the PO.
  merged.customerPo = existing.customerPo || erp.poNumber

  // ERP-owned lifecycle fields — always overwritten.
  merged.manufacturer = erp.manufacturer || existing.manufacturer || ''
  merged.poStatus = erp.poStatus
  merged.urgency = erp.urgency
  merged.orderDate = erp.orderDate || existing.orderDate || ''
  merged.deliveryDue = erp.deliveryDue
  merged.eta = erp.eta || existing.eta || ''
  // ERP owns lines and quantities, but a header-only inbound record (e.g. a
  // failed line-item detail fetch: no lines AND zero quantities) must not wipe
  // the lines/quantities we already captured on an earlier sync.
  const existingLines = Array.isArray(existing.lines) ? existing.lines : []
  const headerOnly =
    erp.lines.length === 0 &&
    existingLines.length > 0 &&
    erp.qtyOrdered === 0 &&
    erp.qtyReceived === 0
  merged.lines = headerOnly ? existingLines : erp.lines
  if (headerOnly) {
    // Keep existing quantities; if those are stale zeros, recompute from the
    // preserved lines so quantities always agree with the line items shown.
    const lineOrdered = existingLines.reduce((sum: number, l: any) => sum + n(l?.qtyOrdered), 0)
    const lineReceived = existingLines.reduce((sum: number, l: any) => sum + n(l?.qtyReceived), 0)
    const ordered = n(existing.qtyOrdered) || lineOrdered
    const received = n(existing.qtyReceived) || lineReceived
    merged.qtyOrdered = ordered
    merged.qtyReceived = received
    merged.qtyRemaining = n(existing.qtyRemaining) || Math.max(ordered - received, 0)
  } else {
    merged.qtyOrdered = erp.qtyOrdered
    merged.qtyReceived = erp.qtyReceived
    merged.qtyRemaining = erp.qtyRemaining
  }
  merged.erpLastSyncAt = now
  merged.source = 'ERP_KAREVE'

  // Nexus-owned container — preserved verbatim (never touched by ERP).
  merged.nexusFields = existing.nexusFields ?? {}

  // Notes: append-only union. Existing rendered texts guard against dupes.
  const existingNotes = Array.isArray(existing.notes) ? existing.notes : []
  const rendered = new Set(
    existingNotes.map((x: any) => s(x?.noteText ?? x?.text)).filter(Boolean),
  )
  if (erp.notes && !rendered.has(erp.notes)) {
    merged.notes = [
      ...existingNotes,
      {
        id: `erp-note-${erp.erpPoId || erp.poNumber}-${now}`,
        noteDate: '',
        noteText: erp.notes,
        createdBy: 'KareEve ERP',
        createdAt: now,
      },
    ]
  } else {
    merged.notes = existingNotes
  }
  return merged
}
