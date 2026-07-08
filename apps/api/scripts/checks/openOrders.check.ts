/**
 * Standalone assertions for the open-order pure logic. No DB / network — run
 * with `npx tsx apps/api/scripts/checks/openOrders.check.ts` from the repo root.
 * Exits non-zero on the first failed assertion.
 */
import {
  mapErpOpenOrder,
  mergeOpenOrderIntoData,
  mapOpenOrderForErp,
} from '../../src/lib/erpOpenOrders'

let failures = 0
function assert(cond: boolean, label: string) {
  if (cond) {
    console.log(`  ✓ ${label}`)
  } else {
    console.error(`  ✗ ${label}`)
    failures++
  }
}

// ─── mapErpOpenOrder ────────────────────────────────────────
console.log('mapErpOpenOrder')
const raw = {
  poNumber: 'P06222026',
  erpPoId: 'PL-1',
  vendor: 'Paklab',
  status: 'Sent to Vendor',
  urgency: 'Normal',
  orderDate: '2026-06-21',
  deliveryDue: '2026-11-29',
  eta: '2026-11-29',
  lines: [
    { lineNo: 1, sku: 'A2210100', description: '10 vertical', qtyOrdered: 25000, qtyReceived: 0, unitPrice: 1.75 },
    { lineNo: 2, sku: 'A2210200', description: '10 AMZ vertical', qtyOrdered: 75000, qtyReceived: 0, unitPrice: 1.75 },
  ],
}
const mapped = mapErpOpenOrder(raw)
assert(mapped.poNumber === 'P06222026', 'poNumber mapped')
assert(mapped.manufacturer === 'Paklab', 'manufacturer aliased from vendor')
assert(mapped.lines.length === 2, 'lines mapped')
assert(mapped.qtyOrdered === 100000, 'header qtyOrdered summed from lines')
assert(mapped.qtyRemaining === 100000, 'qtyRemaining derived (ordered - received)')
assert(mapped.urgency === 'Normal', 'urgency normalized')

// ─── mergeOpenOrderIntoData: split ownership + append-only notes ──
console.log('mergeOpenOrderIntoData')
const existing = {
  poNumber: 'P06222026',
  erpPoId: 'PL-1',
  poStatus: 'Draft',
  nexusFields: { isEmergency: true, coworkNote: 'expedite artwork' },
  notes: [{ id: 'n1', noteDate: '', noteText: 'internal kickoff', createdBy: 'Ahmad', createdAt: '2026-06-20' }],
}
const erp = mapErpOpenOrder({ ...raw, status: 'Acknowledged', notes: 'ERP: vendor confirmed' })
const merged = mergeOpenOrderIntoData(existing, erp, '2026-07-07T00:00:00Z')
assert(merged.poStatus === 'Acknowledged', 'ERP overwrites poStatus')
assert(merged.nexusFields.isEmergency === true, 'nexusFields preserved untouched')
assert(merged.nexusFields.coworkNote === 'expedite artwork', 'nexusFields content intact')
assert(merged.notes.length === 2, 'ERP note appended (append-only union)')
assert(
  merged.notes.some((nt: any) => nt.noteText === 'internal kickoff'),
  'existing Nexus note never dropped',
)
assert(merged.erpLastSyncAt === '2026-07-07T00:00:00Z', 'erpLastSyncAt stamped')
// Idempotency: merging the same ERP note again must not duplicate it.
const merged2 = mergeOpenOrderIntoData(merged, erp, '2026-07-08T00:00:00Z')
assert(merged2.notes.length === 2, 'duplicate ERP note not re-appended')

// ─── mapOpenOrderForErp: never leaks nexusFields ────────────
console.log('mapOpenOrderForErp')
const payload = mapOpenOrderForErp(merged)
assert(!('nexusFields' in payload), 'payload omits nexusFields')
assert(payload.poStatus === 'Acknowledged', 'payload carries ERP-owned poStatus')
assert(Array.isArray(payload.lines), 'payload carries lines')

if (failures) {
  console.error(`\n${failures} assertion(s) failed`)
  process.exit(1)
}
console.log('\nAll open-order checks passed')
