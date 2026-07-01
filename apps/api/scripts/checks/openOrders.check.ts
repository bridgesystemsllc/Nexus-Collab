import assert from 'node:assert'
import { mapErpOpenOrder, mapOpenOrderForErp, mergeOpenOrderIntoData } from '../../src/lib/erpOpenOrders'

// mapErpOpenOrder: derives qtyRemaining and normalizes urgency
const m = mapErpOpenOrder({
  poNumber: 'P06222026', vendor: 'Paklab', status: 'Sent to Vendor',
  priority: 'urgent', qtyOrdered: 100000, qtyReceived: 25000, lines: 2,
  orderDate: '2026-06-21', deliveryDue: '2026-11-29',
})
assert.equal(m.qtyRemaining, 75000, 'qtyRemaining derived')
assert.equal(m.urgency, 'Urgent', 'urgency normalized')
assert.equal(m.manufacturer, 'Paklab', 'manufacturer from vendor')
assert.equal(m.lineCount, 2, 'lineCount from lines')

// mapOpenOrderForErp: only PO fields + flattened notes, no production internals
const payload = mapOpenOrderForErp({
  customerPo: 'P05282026', erpPoId: 'e1', poStatus: 'Acknowledged', urgency: 'Normal',
  qtyReceived: 5000, eta: '2026-12-14', bulkFormula: 'BF-1022',
  notes: [{ noteDate: '3.10', noteText: 'RM delayed' }],
})
assert.equal(payload.poStatus, 'Acknowledged')
assert.equal(payload.notes, '3.10 RM delayed', 'notes flattened')
assert.ok(!('bulkFormula' in payload), 'production internals not sent')

// mergeOpenOrderIntoData: ERP owns PO fields, Nexus fields preserved, notes append-only
const existing = {
  customerPo: 'P05282026', bulkFormula: 'BF-1022', status: 'In Production',
  poStatus: 'Sent to Vendor', qtyReceived: 0,
  notes: [{ id: 'n1', noteText: 'internal note' }],
}
const erp = mapErpOpenOrder({ poNumber: 'P05282026', erpPoId: 'e1', status: 'Acknowledged', qtyOrdered: 100000, qtyReceived: 40000, notes: 'ERP: partial receipt' })
const merged = mergeOpenOrderIntoData(existing, erp, '2026-07-01T00:00:00.000Z')
assert.equal(merged.poStatus, 'Acknowledged', 'ERP overwrote poStatus')
assert.equal(merged.qtyReceived, 40000, 'ERP overwrote qtyReceived')
assert.equal(merged.bulkFormula, 'BF-1022', 'Nexus-only field preserved')
assert.equal(merged.status, 'In Production', 'production status untouched')
assert.equal(merged.notes.length, 2, 'ERP note appended')
assert.equal(merged.notes[1].createdBy, 'KareEve ERP')

// idempotency: re-merging the same ERP note does not duplicate
const merged2 = mergeOpenOrderIntoData(merged, erp, '2026-07-01T01:00:00.000Z')
assert.equal(merged2.notes.length, 2, 'no duplicate ERP note on re-sync')

// live-shape alignment: merge writes poNumber + qty (what the live UI reads)
const live = { poNumber: 'PO-2026-041', product: 'GS Shampoo 11oz', cm: 'ACT Labs', qty: 50000, status: 'Awaiting Materials', progress: 15, eta: '2026-05-15' }
const liveErp = mapErpOpenOrder({ poNumber: 'PO-2026-041', erpPoId: 'x9', status: 'Acknowledged', qtyOrdered: 50000, qtyReceived: 12000, lines: 3, orderDate: '2026-03-01', deliveryDue: '2026-05-15' })
const liveMerged = mergeOpenOrderIntoData(live, liveErp, '2026-07-01T00:00:00.000Z')
assert.equal(liveMerged.poNumber, 'PO-2026-041', 'poNumber preserved for live UI')
assert.equal(liveMerged.qty, 50000, 'qty (live ordered-qty field) set')
assert.equal(liveMerged.qtyReceived, 12000, 'qtyReceived from ERP')
assert.equal(liveMerged.qtyRemaining, 38000, 'qtyRemaining derived')
assert.equal(liveMerged.poStatus, 'Acknowledged', 'poStatus set')
assert.equal(liveMerged.status, 'Awaiting Materials', 'production status untouched')
assert.equal(liveMerged.product, 'GS Shampoo 11oz', 'live product preserved')

console.log('openOrders.check: all assertions passed')
