import assert from 'node:assert'
import { mapErpOpenOrder, mergeOpenOrderIntoData } from '../../src/lib/erpOpenOrders'

// Simulate an update-in-place: existing production item gains ERP PO fields
// without losing production internals, and status mirrors poStatus.
const existing = { customerPo: 'PK03172026', batchSize: '6000 units', status: 'Awaiting Materials', notes: [] }
const erp = mapErpOpenOrder({ poNumber: 'PK03172026', erpPoId: 'PL-2', status: 'Acknowledged', qtyOrdered: 200000, qtyReceived: 0, lines: 5 })
const data = mergeOpenOrderIntoData(existing, erp, '2026-07-01T00:00:00.000Z')
assert.equal(data.poStatus, 'Acknowledged')
assert.equal(data.lineCount, 5)
assert.equal(data.batchSize, '6000 units', 'production field preserved')
console.log('openOrdersSync.check: all assertions passed')
