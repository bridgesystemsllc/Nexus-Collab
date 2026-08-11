import { Router, Request, Response } from 'express'
import {
  toProductionOrderDTO,
  groupByManufacturer,
  computeSummary,
  type ProductionOrderRow,
} from '@nexus/shared'
import { prisma } from '../index'

export const productionRoutes = Router()

// Planning dates (orderDate/deliveryDue/eta) are rendered as YYYY-MM-DD;
// sync metadata (lastSyncedAt) keeps a full ISO timestamp — see the GET handler.
function toIso(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null
}

// ─── List production orders (shaped for the ops UI) ─────────
productionRoutes.get('/', async (_req: Request, res: Response) => {
  try {
    const rows = await prisma.productionOrder.findMany({
      orderBy: { orderDate: 'desc' },
      include: { _count: { select: { lines: true } } },
    })

    const dtos = rows.map((r) => {
      const row: ProductionOrderRow = {
        id: r.id,
        erpId: r.erpId,
        poNumber: r.poNumber,
        manufacturer: r.manufacturer,
        brand: r.brand,
        status: r.status,
        urgency: r.urgency,
        orderDate: toIso(r.orderDate),
        deliveryDue: toIso(r.deliveryDue),
        eta: toIso(r.eta),
        qtyOrdered: r.qtyOrdered,
        qtyReceived: r.qtyReceived,
        lineCount: r._count.lines,
        notes: r.notes,
        progress: r.progress,
        value: r.value,
        syncStatus: r.syncStatus,
        lastSyncedAt: r.lastSyncedAt ? r.lastSyncedAt.toISOString() : null,
      }
      return toProductionOrderDTO(row)
    })

    res.json({
      orders: dtos,
      groups: groupByManufacturer(dtos),
      summary: computeSummary(dtos, new Date()),
    })
  } catch (error) {
    console.error('[production] GET / error:', error)
    res.status(500).json({ error: 'Failed to fetch production orders' })
  }
})
