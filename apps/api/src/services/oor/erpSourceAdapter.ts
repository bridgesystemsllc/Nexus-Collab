// ─── ERP source adapter ─────────────────────────────────────
// The second implementation of SourceAdapter, and the reason the seam exists.
//
// Nexus already syncs open orders from the KarEve ERP (lib/erpOpenOrders.ts):
// the ERP owns the PO lifecycle, Nexus owns everything under `nexusFields`.
// Before the OOR, that feed had its own store and its own view, which meant the
// Operations tab could give two different answers to "what is open". Routing it
// through the same adapter interface as the file drop puts both sources into
// one table, so the answer is singular no matter where the data came from.
//
// A PO from the ERP has lines but no shortage tree — the ERP does not model
// bulk and raw materials — so those lines arrive with an empty node list and
// derive to OPEN or CLOSED rather than to a shortage status. That is correct:
// absence of a tree is not absence of a shortage, and inventing nodes to fill
// the gap would manufacture confidence the source never had.

import type { ErpOpenOrder } from '../../lib/erpOpenOrders'
import type { ParsedLine, ParsedReport, SourceAdapter, SourceInput } from './sourceAdapter'

const toDate = (v: string): Date | null => {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/** ERP PO statuses that mean the line is done. */
const CLOSED_ERP_STATUSES = new Set(['received', 'closed', 'cancelled', 'canceled'])

export function erpOrderToLines(order: ErpOpenOrder): ParsedLine[] {
  const orderDate = toDate(order.orderDate)
  const deliveryDue = toDate(order.deliveryDue)
  const closed = CLOSED_ERP_STATUSES.has(order.poStatus.toLowerCase())

  // One OOR line per PO line, because the OOR's unit of work is the line, not
  // the purchase order. A PO with four SKUs is four things that can be short.
  if (order.lines.length === 0) {
    return [buildLine(order, null, orderDate, deliveryDue, closed)]
  }
  return order.lines.map((line) => buildLine(order, line, orderDate, deliveryDue, closed))
}

function buildLine(
  order: ErpOpenOrder,
  line: ErpOpenOrder['lines'][number] | null,
  orderDate: Date | null,
  deliveryDue: Date | null,
  closed: boolean,
): ParsedLine {
  const qtyOrdered = line ? line.qtyOrdered : order.qtyOrdered
  const qtyReceived = line ? line.qtyReceived : order.qtyReceived
  const qtyRemaining = closed ? 0 : Math.max(qtyOrdered - qtyReceived, 0)
  const unitPrice = line ? line.unitPrice : null

  return {
    customerPoNumber: order.poNumber || null,
    channelTag: null,
    salesOrderNumber: null,
    itemNumber: line ? line.sku || null : null,
    custPartNumber: null,
    description: line ? line.description || null : null,
    qtyOrdered,
    qtyOrderedRaw: null,
    qtyRemaining,
    unitPrice,
    valueSource: null,
    valueComputed: unitPrice === null ? null : qtyRemaining * unitPrice,
    valueMismatch: false,
    orderDate,
    shipDate: null,
    origRequiredDate: null,
    requiredDeliveryDate: deliveryDue,
    workOrderNumber: null,
    jobNumber: null,
    // A manufacturer on the PO is a contract manufacturer building it.
    fulfillmentType: order.manufacturer && order.manufacturer !== 'Unassigned' ? 'CONTRACT_MFG' : 'INTERNAL',
    cmCode: order.manufacturer && order.manufacturer !== 'Unassigned' ? order.manufacturer : null,
    jobStatus: null,
    comments: [],
    nodes: [],
    rawRow: { ...order, lines: undefined } as unknown as Record<string, unknown>,
    externalIds: { erpPoId: order.erpPoId },
  }
}

/**
 * Takes orders already fetched by erpClient rather than fetching them itself,
 * so the mapping stays pure and the network call keeps living in one place.
 */
export class ErpSourceAdapter implements SourceAdapter {
  readonly key = 'erp'

  constructor(private readonly orders: ErpOpenOrder[]) {}

  async load(_input: SourceInput): Promise<ParsedReport> {
    return {
      reportType: 'customer_open_order',
      reportLabel: 'KarEve ERP open orders',
      asOfDate: null,
      lines: this.orders.flatMap(erpOrderToLines),
      warnings: [],
    }
  }
}
