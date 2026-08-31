import type { Prisma, PrismaClient } from '@prisma/client'
import type { OorLineStatus } from '@nexus/shared'
import { isLineOpen } from './deriveStatus'

type Db = PrismaClient | Prisma.TransactionClient

export interface StoredOpenOrder {
  moduleItemId: string
  data: Record<string, any>
}

export interface ErpLineSyncResult {
  created: number
  updated: number
  closed: number
}

export class ScopedModuleItemNotFoundError extends Error {
  constructor() {
    super('SCOPED_MODULE_ITEM_NOT_FOUND')
    this.name = 'ScopedModuleItemNotFoundError'
  }
}

export class OpenOrderEditForbiddenError extends Error {
  constructor() {
    super('OPEN_ORDER_EDIT_FORBIDDEN')
    this.name = 'OpenOrderEditForbiddenError'
  }
}

const closedPoStatuses = new Set([
  'received',
  'shipped',
  'closed',
  'cancelled',
  'canceled',
  'complete',
  'completed',
])

const text = (value: unknown): string => value === null || value === undefined ? '' : String(value).trim()
const number = (value: unknown): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}
const normalized = (value: unknown): string => text(value).toLocaleLowerCase()
const date = (value: unknown): Date | null => {
  const valueText = text(value)
  if (!valueText) return null
  const parsed = new Date(valueText)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}
const decimal = (value: number): Prisma.Decimal => value as unknown as Prisma.Decimal
const lineKey = (po: string, sku: string) => `${normalized(po)}::${normalized(sku)}`

/**
 * Projects ERP-backed PO line items into OOR rows. ERP owns identity,
 * quantities and required dates; imports may enrich those rows with sales-order
 * detail and shortage trees; people own manual statuses and collaboration data.
 */
export async function reconcileErpOpenOrderLines(
  prisma: Db,
  orgId: string,
  moduleId: string,
  orders: StoredOpenOrder[],
  now = new Date(),
  options: { closeUntouched?: boolean } = {},
): Promise<ErpLineSyncResult> {
  const mappings = await prisma.oorManufacturerMapping.findMany({
    where: { orgId },
    select: { erpManufacturerNameNormalized: true, cmCode: true },
  })
  const cmByManufacturer = new Map(
    mappings.map((mapping) => [mapping.erpManufacturerNameNormalized, mapping.cmCode]),
  )

  // PO + SKU is only safe as a fallback link when that pair occurs once in the
  // ERP payload. Repeated SKUs are kept separate by their ERP line number.
  const pairCounts = new Map<string, number>()
  for (const order of orders) {
    const po = text(order.data.poNumber ?? order.data.customerPo)
    const lines = Array.isArray(order.data.lines) ? order.data.lines : []
    for (const line of lines) {
      const key = lineKey(po, text(line?.sku))
      pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1)
    }
  }

  let created = 0
  let updated = 0
  const touchedIds: string[] = []

  for (const order of orders) {
    const data = order.data ?? {}
    const poNumber = text(data.poNumber ?? data.customerPo)
    const erpPoId = text(data.erpPoId) || poNumber
    const manufacturer = text(data.manufacturer)
    const mappedCmCode = cmByManufacturer.get(normalized(manufacturer)) ?? null
    const poClosed = closedPoStatuses.has(normalized(data.poStatus))
    const lines = Array.isArray(data.lines) ? data.lines : []

    for (let index = 0; index < lines.length; index++) {
      const sourceLine = lines[index] ?? {}
      const erpLineNumber = number(sourceLine.lineNo) || index + 1
      const itemNumber = text(sourceLine.sku) || `LINE-${erpLineNumber}`
      const qtyOrdered = number(sourceLine.qtyOrdered)
      const qtyReceived = number(sourceLine.qtyReceived)
      const qtyRemaining = Math.max(qtyOrdered - qtyReceived, 0)
      const operationallyOpen = !poClosed && qtyRemaining > 0

      let existing = await prisma.oorLine.findUnique({
        where: {
          orgId_productionOrderItemId_erpLineNumber: {
            orgId,
            productionOrderItemId: order.moduleItemId,
            erpLineNumber,
          },
        },
      })

      // Attach a pre-existing imported row only when PO + SKU identifies one
      // row on both sides. Ambiguous repeated SKUs are deliberately not guessed.
      if (!existing && pairCounts.get(lineKey(poNumber, itemNumber)) === 1) {
        const candidates = await prisma.oorLine.findMany({
          where: {
            orgId,
            productionOrderItemId: null,
            customerPoNumber: { equals: poNumber, mode: 'insensitive' },
            itemNumber: { equals: itemNumber, mode: 'insensitive' },
          },
          take: 2,
        })
        if (candidates.length === 1) existing = candidates[0]
      }

      const existingStatus = existing?.lineStatus as OorLineStatus | undefined
      const manualStatus = existing?.statusSource === 'manual' ? existingStatus : undefined
      const lineStatus: OorLineStatus =
        manualStatus ??
        (operationallyOpen
          ? existingStatus && existingStatus !== 'CLOSED' && existingStatus !== 'SHIPPED' && existingStatus !== 'CANCELLED'
            ? existingStatus
            : 'OPEN'
          : 'CLOSED')
      const open = operationallyOpen && isLineOpen(qtyRemaining, lineStatus)
      const unitPrice = number(sourceLine.unitPrice)
      const existingExternalIds =
        existing?.externalIds && typeof existing.externalIds === 'object' && !Array.isArray(existing.externalIds)
          ? existing.externalIds as Record<string, unknown>
          : {}
      const existingRaw =
        existing?.rawRow && typeof existing.rawRow === 'object' && !Array.isArray(existing.rawRow)
          ? existing.rawRow as Record<string, unknown>
          : {}

      const fields = {
        productionOrderItemId: order.moduleItemId,
        erpPoId,
        erpLineNumber,
        erpManufacturerName: manufacturer || null,
        customerPoNumber: poNumber || null,
        itemNumber,
        description: text(sourceLine.description) || existing?.description || null,
        qtyOrdered: decimal(qtyOrdered),
        qtyOrderedRaw: null,
        qtyRemaining: decimal(qtyRemaining),
        unitPrice: decimal(unitPrice),
        valueComputed: decimal(qtyRemaining * unitPrice),
        orderDate: date(data.orderDate),
        requiredDeliveryDate: date(data.deliveryDue),
        fulfillmentType: manufacturer ? 'CONTRACT_MFG' : existing?.fulfillmentType ?? 'INTERNAL',
        cmCode: mappedCmCode ?? existing?.cmCode ?? null,
        jobStatus: operationallyOpen ? 'ACT' : 'CLOSED',
        lineStatus,
        isOpen: open,
        closedAt: open ? null : existing?.closedAt ?? now,
        externalIds: {
          ...existingExternalIds,
          erpPoId,
          erpLineNumber: String(erpLineNumber),
          productionOrderItemId: order.moduleItemId,
        } as Prisma.InputJsonValue,
        rawRow: {
          ...existingRaw,
          erp: {
            poStatus: text(data.poStatus),
            urgency: text(data.urgency),
            manufacturer,
            qtyReceived,
            eta: text(data.eta),
            syncedAt: text(data.erpLastSyncAt) || now.toISOString(),
          },
        } as Prisma.InputJsonValue,
      }

      if (existing) {
        const row = await prisma.oorLine.update({
          where: { id: existing.id },
          data: fields,
          select: { id: true },
        })
        touchedIds.push(row.id)
        updated++
      } else {
        // The compound identity makes concurrent reconciliation requests
        // idempotent too, not just repeated sequential requests.
        const row = await prisma.oorLine.upsert({
          where: {
            orgId_productionOrderItemId_erpLineNumber: {
              orgId,
              productionOrderItemId: order.moduleItemId,
              erpLineNumber,
            },
          },
          update: fields,
          create: {
            ...fields,
            orgId,
            statusSource: 'derived',
            riskLevel: 'on_track',
          },
          select: { id: true },
        })
        touchedIds.push(row.id)
        created++
      }
    }
  }

  if (options.closeUntouched === false) return { created, updated, closed: 0 }

  const linkedWhere: Prisma.OorLineWhereInput = {
    orgId,
    productionOrderItem: { moduleId },
    isOpen: true,
    ...(touchedIds.length > 0 ? { id: { notIn: touchedIds } } : {}),
  }
  const [derivedClosed, manualClosed] = await Promise.all([
    prisma.oorLine.updateMany({
      where: { ...linkedWhere, statusSource: 'derived' },
      data: { isOpen: false, lineStatus: 'CLOSED', jobStatus: 'CLOSED', closedAt: now },
    }),
    prisma.oorLine.updateMany({
      where: { ...linkedWhere, statusSource: 'manual' },
      data: { isOpen: false, jobStatus: 'CLOSED', closedAt: now },
    }),
  ])

  return { created, updated, closed: derivedClosed.count + manualClosed.count }
}

/** Reconciles the OPEN_ORDERS snapshots already stored for one organization. */
export async function reconcileStoredOpenOrders(
  prisma: PrismaClient,
  orgId: string,
  now = new Date(),
): Promise<ErpLineSyncResult> {
  const modules = await prisma.departmentModule.findMany({
    where: { type: 'OPEN_ORDERS', department: { orgId } },
    select: {
      id: true,
      items: { select: { id: true, data: true } },
    },
  })
  const total: ErpLineSyncResult = { created: 0, updated: 0, closed: 0 }
  for (const module of modules) {
    const result = await reconcileErpOpenOrderLines(
      prisma,
      orgId,
      module.id,
      module.items.map((item) => ({
        moduleItemId: item.id,
        data: (item.data as Record<string, any>) ?? {},
      })),
      now,
    )
    total.created += result.created
    total.updated += result.updated
    total.closed += result.closed
  }
  return total
}

/**
 * Updates one module item only when its full department/module/item chain
 * belongs to the acting organization. OPEN_ORDERS updates and OOR projection
 * are committed atomically.
 */
export async function updateModuleItemForOrg(
  prisma: PrismaClient,
  input: {
    orgId: string
    departmentId: string
    moduleId: string
    itemId: string
    canEditOpenOrders: boolean
    patch: { data?: unknown; status?: string | null; sortOrder?: number }
  },
) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.moduleItem.findFirst({
      where: {
        id: input.itemId,
        moduleId: input.moduleId,
        module: {
          departmentId: input.departmentId,
          department: { orgId: input.orgId },
        },
      },
      include: {
        module: {
          include: { department: { select: { orgId: true } } },
        },
      },
    })
    if (!current) throw new ScopedModuleItemNotFoundError()
    if (current.module.type === 'OPEN_ORDERS' && !input.canEditOpenOrders) {
      throw new OpenOrderEditForbiddenError()
    }

    const updated = await tx.moduleItem.update({
      where: { id: current.id },
      data: {
        ...('data' in input.patch ? { data: input.patch.data as Prisma.InputJsonValue } : {}),
        ...('status' in input.patch ? { status: input.patch.status } : {}),
        ...('sortOrder' in input.patch ? { sortOrder: input.patch.sortOrder } : {}),
      },
      include: {
        module: {
          include: { department: { select: { orgId: true } } },
        },
      },
    })
    if (updated.module.type === 'OPEN_ORDERS') {
      await reconcileErpOpenOrderLines(
        tx,
        input.orgId,
        updated.moduleId,
        [{ moduleItemId: updated.id, data: updated.data as Record<string, any> }],
        new Date(),
        { closeUntouched: false },
      )
    }
    return updated
  })
}