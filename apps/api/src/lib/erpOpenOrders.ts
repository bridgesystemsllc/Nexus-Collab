// ─── ERP Open-Order (Purchase Order) mapping ────────────────
// Shared pure functions for the open-order two-way sync. No I/O here so they
// can be unit-checked in isolation. The inbound client (erpClient) and the
// outbound push (erpPush) both build on these.

/** A raw open-order / purchase-order record from the ERP, normalized. */
export interface ErpOpenOrder {
  poNumber: string
  erpPoId: string
  manufacturer: string
  poStatus: string
  urgency: 'Normal' | 'Urgent'
  orderDate: string
  deliveryDue: string
  eta: string
  qtyOrdered: number
  qtyReceived: number
  qtyRemaining: number
  lineCount: number
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

/** Map a raw ERP PO record (field shape varies) into a typed ErpOpenOrder. */
export function mapErpOpenOrder(raw: Record<string, any>): ErpOpenOrder {
  const qtyOrdered = n(raw.qtyOrdered ?? raw.quantityOrdered ?? raw.orderedQty ?? raw.quantity)
  const qtyReceived = n(raw.qtyReceived ?? raw.quantityReceived ?? raw.receivedQty)
  const qtyRemaining =
    raw.qtyRemaining != null || raw.quantityRemaining != null
      ? n(raw.qtyRemaining ?? raw.quantityRemaining)
      : Math.max(qtyOrdered - qtyReceived, 0)
  const urgencyRaw = s(raw.urgency ?? raw.priority).toLowerCase()
  return {
    poNumber: s(raw.poNumber ?? raw.poNo ?? raw.purchaseOrder ?? raw.customerPo ?? raw.po),
    erpPoId: s(raw.erpPoId ?? raw.id ?? raw.poId ?? raw.poNumber ?? raw.poNo),
    manufacturer: s(raw.manufacturer ?? raw.vendor ?? raw.vendorName ?? raw.cm ?? raw.supplier),
    poStatus: s(raw.poStatus ?? raw.status ?? 'Sent to Vendor') || 'Sent to Vendor',
    urgency: urgencyRaw === 'urgent' ? 'Urgent' : 'Normal',
    orderDate: s(raw.orderDate ?? raw.createdAt ?? raw.poDate),
    deliveryDue: s(raw.deliveryDue ?? raw.dueDate ?? raw.requestedDelivery ?? raw.deliveryDate),
    eta: s(raw.eta ?? raw.expectedDelivery ?? raw.promisedDate ?? raw.deliveryDue),
    qtyOrdered,
    qtyReceived,
    qtyRemaining,
    lineCount: n(
      raw.lineCount ?? raw.lines ?? raw.lineItems ?? (Array.isArray(raw.items) ? raw.items.length : 0),
    ),
    notes: s(raw.notes ?? raw.comments ?? raw.note),
    source: 'ERP_KAREVE',
  }
}

/**
 * Map a PRODUCTION_TRACKING item.data blob to the ERP open-order payload for
 * OUTBOUND push. Only the ERP-owned PO fields (+ notes) are emitted — Nexus
 * production internals are never sent. Notes are flattened to the ERP's
 * date-prefixed comment string the OOR importer already understands.
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
  return {
    poNumber: s(d.poNumber ?? d.customerPo),
    erpPoId: s(d.erpPoId),
    poStatus: s(d.poStatus) || 'Draft',
    urgency: s(d.urgency) === 'Urgent' ? 'Urgent' : 'Normal',
    qtyReceived: n(d.qtyReceived),
    eta: s(d.eta),
    notes,
  }
}

/**
 * Merge an inbound ErpOpenOrder onto an existing production item.data. ERP owns
 * the PO fields (poStatus, urgency, quantities, dates, lineCount) and overwrites
 * them; every Nexus-only production field is preserved untouched. Notes are
 * append-only: ERP notes not already present (by rendered text) are appended.
 */
export function mergeOpenOrderIntoData(
  existing: Record<string, any>,
  erp: ErpOpenOrder,
  now: string,
): Record<string, any> {
  const merged: Record<string, any> = { ...existing }
  merged.erpPoId = erp.erpPoId || existing.erpPoId || ''
  // Live production items key on `poNumber`; keep `customerPo` as an alias so
  // both the live UI and the legacy shape resolve the PO.
  merged.poNumber = existing.poNumber || erp.poNumber
  merged.customerPo = existing.customerPo || erp.poNumber
  merged.cm = existing.cm || erp.manufacturer
  merged.poStatus = erp.poStatus
  merged.urgency = erp.urgency
  // Ordered qty: the live UI reads `qty`; keep `qtyOrdered` as an alias.
  merged.qty = erp.qtyOrdered || existing.qty || 0
  merged.qtyOrdered = erp.qtyOrdered
  merged.qtyReceived = erp.qtyReceived
  merged.qtyRemaining = erp.qtyRemaining
  merged.deliveryDue = erp.deliveryDue
  merged.orderDate = erp.orderDate || existing.orderDate || ''
  merged.eta = erp.eta || existing.eta || ''
  merged.lineCount = erp.lineCount
  merged.erpLastSyncAt = now

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
