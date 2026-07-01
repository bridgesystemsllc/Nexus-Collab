import assert from 'node:assert'
import { mapOpenOrderForErp } from '../../src/lib/erpOpenOrders'

// Live-shape item.data → ERP payload: only PO fields + flattened notes.
const p = mapOpenOrderForErp({
  poNumber: 'PO-2026-041', poStatus: 'Acknowledged', urgency: 'Urgent',
  qtyReceived: 10, eta: '2026-12-14',
  notes: [{ noteDate: '3.10', noteText: 'ok' }],
  product: 'GS Shampoo 11oz', qty: 50000,
})
assert.equal(p.poNumber, 'PO-2026-041', 'poNumber from live field')
assert.equal(p.poStatus, 'Acknowledged')
assert.equal(p.urgency, 'Urgent')
assert.equal(p.notes, '3.10 ok', 'notes flattened')
assert.ok(!('product' in p), 'production internals not sent')
assert.ok(!('qty' in p), 'qty not sent')

// Falls back to cmNotes when there is no notes array.
const p2 = mapOpenOrderForErp({ poNumber: 'PO-2', poStatus: 'Sent to Vendor', cmNotes: 'CM says delayed' })
assert.equal(p2.notes, 'CM says delayed', 'cmNotes fallback')

console.log('openOrdersPush.check: all assertions passed')
