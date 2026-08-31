// Needs a live database — run with `pnpm --filter @nexus/api test:integration`.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import {
  OpenOrderEditForbiddenError,
  ScopedModuleItemNotFoundError,
  reconcileErpOpenOrderLines,
  reconcileStoredOpenOrders,
  updateModuleItemForOrg,
} from './erpLineSync'
import { runImport } from './importRun'
import type { ParsedReport, SourceAdapter, SourceInput } from './sourceAdapter'
import { retainOrCloseMissingOpenOrders, syncErpOpenOrders } from '../../lib/erpSync'
import { getRouting, resolveTargetModule } from '../../lib/erpRouting'
import express from 'express'
import { createServer } from 'http'
import { integrationRoutes } from '../../routes/integrations'

const prisma = new PrismaClient()
const ORG_ID = 'test_org_erp_oor_sync'
const DEPT_ID = 'test_dept_erp_oor_sync'
const MODULE_ID = 'test_module_erp_oor_sync'
const OTHER_ORG_ID = 'test_org_erp_oor_other'
const OTHER_DEPT_ID = 'test_dept_erp_oor_other'
const OTHER_MODULE_ID = 'test_module_erp_oor_other'

const orderData = (
  lines: Array<{ lineNo: number; sku: string; qtyOrdered: number; qtyReceived: number }>,
  overrides: Record<string, unknown> = {},
) => ({
  erpPoId: 'erp-po-100',
  poNumber: 'PO-100',
  manufacturer: 'Acme Labs',
  poStatus: 'In Production',
  orderDate: '2026-08-01',
  deliveryDue: '2026-09-15',
  eta: '2026-09-10',
  lines: lines.map((line) => ({ ...line, description: `${line.sku} product`, unitPrice: 2.5 })),
  ...overrides,
})

async function wipe() {
  await prisma.integration.deleteMany({ where: { orgId: { in: [ORG_ID, OTHER_ORG_ID] } } })
  await prisma.oorLine.deleteMany({ where: { orgId: ORG_ID } })
  await prisma.oorReportRun.deleteMany({ where: { orgId: ORG_ID } })
  await prisma.oorManufacturerMapping.deleteMany({ where: { orgId: ORG_ID } })
  await prisma.auditLog.deleteMany({ where: { orgId: ORG_ID } })
  await prisma.moduleItem.deleteMany({ where: { moduleId: MODULE_ID } })
  await prisma.departmentModule.deleteMany({ where: { id: MODULE_ID } })
  await prisma.department.deleteMany({ where: { id: DEPT_ID } })
  await prisma.organization.deleteMany({ where: { id: ORG_ID } })
  await prisma.oorLine.deleteMany({ where: { orgId: OTHER_ORG_ID } })
  await prisma.moduleItem.deleteMany({ where: { moduleId: OTHER_MODULE_ID } })
  await prisma.departmentModule.deleteMany({ where: { id: OTHER_MODULE_ID } })
  await prisma.department.deleteMany({ where: { id: OTHER_DEPT_ID } })
  await prisma.organization.deleteMany({ where: { id: OTHER_ORG_ID } })
}

async function resetItems() {
  await prisma.oorLine.deleteMany({ where: { orgId: ORG_ID } })
  await prisma.oorReportRun.deleteMany({ where: { orgId: ORG_ID } })
  await prisma.oorManufacturerMapping.deleteMany({ where: { orgId: ORG_ID } })
  await prisma.moduleItem.deleteMany({ where: { moduleId: MODULE_ID } })
}

beforeAll(async () => {
  await wipe()
  await prisma.organization.create({
    data: { id: ORG_ID, name: 'ERP OOR sync test', slug: ORG_ID, color: '#000000', featureInterests: [] },
  })
  await prisma.department.create({
    data: { id: DEPT_ID, name: 'Operations sync test', orgId: ORG_ID },
  })
  await prisma.departmentModule.create({
    data: { id: MODULE_ID, name: 'Open Orders', type: 'OPEN_ORDERS', departmentId: DEPT_ID },
  })
  await prisma.organization.create({
    data: {
      id: OTHER_ORG_ID,
      name: 'Other ERP OOR sync test',
      slug: OTHER_ORG_ID,
      color: '#000000',
      featureInterests: [],
    },
  })
  await prisma.department.create({
    data: { id: OTHER_DEPT_ID, name: 'Other Operations sync test', orgId: OTHER_ORG_ID },
  })
  await prisma.departmentModule.create({
    data: {
      id: OTHER_MODULE_ID,
      name: 'Other Open Orders',
      type: 'OPEN_ORDERS',
      departmentId: OTHER_DEPT_ID,
    },
  })
})

afterAll(async () => {
  await wipe()
  await prisma.$disconnect()
})

describe('ERP open-order line reconciliation', () => {
  it('creates open report lines once, preserves collaboration, and closes/reopens the same row', async () => {
    await resetItems()
    await prisma.oorManufacturerMapping.create({
      data: {
        orgId: ORG_ID,
        erpManufacturerName: 'Acme Labs',
        erpManufacturerNameNormalized: 'acme labs',
        cmCode: 'ACME',
      },
    })
    const item = await prisma.moduleItem.create({
      data: {
        moduleId: MODULE_ID,
        status: 'In Production',
        data: orderData([{ lineNo: 1, sku: 'SKU-1', qtyOrdered: 10, qtyReceived: 4 }]),
      },
    })

    expect(await reconcileStoredOpenOrders(prisma, ORG_ID)).toEqual({ created: 1, updated: 0, closed: 0 })
    expect(await reconcileStoredOpenOrders(prisma, ORG_ID)).toEqual({ created: 0, updated: 1, closed: 0 })

    const initial = await prisma.oorLine.findFirstOrThrow({ where: { orgId: ORG_ID } })
    expect(initial.productionOrderItemId).toBe(item.id)
    expect(initial.erpLineNumber).toBe(1)
    expect(initial.customerPoNumber).toBe('PO-100')
    expect(initial.itemNumber).toBe('SKU-1')
    expect(initial.cmCode).toBe('ACME')
    expect(Number(initial.qtyRemaining)).toBe(6)
    expect(initial.isOpen).toBe(true)

    await prisma.oorComment.create({
      data: { oorLineId: initial.id, body: 'Keep this operational history.', source: 'app' },
    })
    await prisma.oorLine.update({
      where: { id: initial.id },
      data: { lineStatus: 'ON_HOLD_QC', statusSource: 'manual', statusOverrideReason: 'QA review' },
    })
    await prisma.moduleItem.update({
      where: { id: item.id },
      data: {
        status: 'Received',
        data: orderData(
          [{ lineNo: 1, sku: 'SKU-1', qtyOrdered: 10, qtyReceived: 10 }],
          { poStatus: 'Received' },
        ),
      },
    })
    await reconcileStoredOpenOrders(prisma, ORG_ID)

    const closed = await prisma.oorLine.findUniqueOrThrow({
      where: { id: initial.id },
      include: { comments: true },
    })
    expect(closed.isOpen).toBe(false)
    expect(closed.closedAt).not.toBeNull()
    expect(closed.lineStatus).toBe('ON_HOLD_QC')
    expect(closed.comments).toHaveLength(1)

    await prisma.moduleItem.update({
      where: { id: item.id },
      data: {
        status: 'In Production',
        data: orderData([{ lineNo: 1, sku: 'SKU-1', qtyOrdered: 10, qtyReceived: 7 }]),
      },
    })
    await reconcileStoredOpenOrders(prisma, ORG_ID)
    const reopened = await prisma.oorLine.findUniqueOrThrow({ where: { id: initial.id } })
    expect(reopened.isOpen).toBe(true)
    expect(reopened.closedAt).toBeNull()
    expect(reopened.lineStatus).toBe('ON_HOLD_QC')
    expect(await prisma.oorLine.count({ where: { orgId: ORG_ID } })).toBe(1)
  })

  it('attaches an imported report row to one unambiguous ERP line', async () => {
    await resetItems()
    const item = await prisma.moduleItem.create({
      data: {
        moduleId: MODULE_ID,
        data: orderData([{ lineNo: 3, sku: 'SKU-3', qtyOrdered: 20, qtyReceived: 5 }]),
      },
    })
    await reconcileStoredOpenOrders(prisma, ORG_ID)
    const before = await prisma.oorLine.findFirstOrThrow({ where: { orgId: ORG_ID } })

    const adapter = reportAdapter('one-line', [parsedLine('SKU-3')])
    const result = await runImport(prisma, adapter, {
      buffer: Buffer.from('one-line-import'),
      filename: 'one-line.xlsx',
      orgId: ORG_ID,
      brandId: 'brand-acme',
      importedById: null,
    })

    expect(result.created).toBe(0)
    expect(result.updated).toBe(1)
    const after = await prisma.oorLine.findUniqueOrThrow({ where: { id: before.id } })
    expect(after.productionOrderItemId).toBe(before.productionOrderItemId)
    expect(after.brandId).toBe('brand-acme')
    expect(after.salesOrderNumber).toBe('SO-100')
    expect(await prisma.oorLine.count({ where: { orgId: ORG_ID } })).toBe(1)

    // A later spreadsheet may lag the ERP. It can enrich the linked row, but
    // cannot reopen it or replace ERP-owned quantities/dates/lifecycle fields.
    await prisma.moduleItem.update({
      where: { id: item.id },
      data: {
        status: 'Received',
        data: orderData(
          [{ lineNo: 3, sku: 'SKU-3', qtyOrdered: 20, qtyReceived: 20 }],
          { poStatus: 'Received', deliveryDue: '2026-10-20' },
        ),
      },
    })
    await reconcileStoredOpenOrders(prisma, ORG_ID)
    const erpClosed = await prisma.oorLine.findUniqueOrThrow({ where: { id: before.id } })
    expect(erpClosed.isOpen).toBe(false)
    expect(Number(erpClosed.qtyRemaining)).toBe(0)

    await runImport(prisma, reportAdapter('stale-one-line', [parsedLine('SKU-3')]), {
      buffer: Buffer.from('stale-one-line-import'),
      filename: 'stale-one-line.xlsx',
      orgId: ORG_ID,
      brandId: 'brand-acme',
      importedById: null,
    })
    const afterStaleImport = await prisma.oorLine.findUniqueOrThrow({ where: { id: before.id } })
    expect(afterStaleImport.isOpen).toBe(false)
    expect(afterStaleImport.lineStatus).toBe('CLOSED')
    expect(afterStaleImport.jobStatus).toBe('CLOSED')
    expect(afterStaleImport.closedAt).not.toBeNull()
    expect(Number(afterStaleImport.qtyOrdered)).toBe(20)
    expect(Number(afterStaleImport.qtyRemaining)).toBe(0)
    expect(afterStaleImport.requiredDeliveryDate?.toISOString()).toBe('2026-10-20T00:00:00.000Z')
  })

  it('does not guess when repeated ERP lines share the same PO and SKU', async () => {
    await resetItems()
    await prisma.moduleItem.create({
      data: {
        moduleId: MODULE_ID,
        data: orderData([
          { lineNo: 1, sku: 'SKU-X', qtyOrdered: 5, qtyReceived: 0 },
          { lineNo: 2, sku: 'SKU-X', qtyOrdered: 8, qtyReceived: 0 },
        ]),
      },
    })
    await reconcileStoredOpenOrders(prisma, ORG_ID)

    const result = await runImport(prisma, reportAdapter('ambiguous', [parsedLine('SKU-X')]), {
      buffer: Buffer.from('ambiguous-import'),
      filename: 'ambiguous.xlsx',
      orgId: ORG_ID,
      brandId: 'brand-acme',
      importedById: null,
    })

    expect(result.created).toBe(0)
    expect(result.updated).toBe(0)
    expect(result.warnings.some((warning) => warning.reason.includes('More than one ERP production line'))).toBe(true)
    expect(await prisma.oorLine.count({ where: { orgId: ORG_ID } })).toBe(2)
  })

  it('closes a missing ERP item without closing a manual item in the same module', async () => {
    await resetItems()
    const erpItem = await prisma.moduleItem.create({
      data: {
        moduleId: MODULE_ID,
        status: 'In Production',
        data: {
          ...orderData([{ lineNo: 1, sku: 'ERP-SKU', qtyOrdered: 10, qtyReceived: 0 }]),
          source: 'ERP_KAREVE',
        },
      },
    })
    const manualItem = await prisma.moduleItem.create({
      data: {
        moduleId: MODULE_ID,
        status: 'In Production',
        data: {
          ...orderData(
            [{ lineNo: 1, sku: 'MANUAL-SKU', qtyOrdered: 7, qtyReceived: 0 }],
            { erpPoId: '', poNumber: 'MANUAL-PO', customerPo: 'MANUAL-PO' },
          ),
          source: 'MANUAL',
        },
      },
    })
    await reconcileStoredOpenOrders(prisma, ORG_ID)
    const existing = await prisma.moduleItem.findMany({ where: { moduleId: MODULE_ID } })
    const snapshots = await retainOrCloseMissingOpenOrders(
      prisma,
      existing,
      new Set(),
      new Date('2026-08-30T12:00:00.000Z').toISOString(),
    )
    await reconcileErpOpenOrderLines(prisma, ORG_ID, MODULE_ID, snapshots)

    const [erpAfter, manualAfter, erpLine, manualLine] = await Promise.all([
      prisma.moduleItem.findUniqueOrThrow({ where: { id: erpItem.id } }),
      prisma.moduleItem.findUniqueOrThrow({ where: { id: manualItem.id } }),
      prisma.oorLine.findFirstOrThrow({ where: { productionOrderItemId: erpItem.id } }),
      prisma.oorLine.findFirstOrThrow({ where: { productionOrderItemId: manualItem.id } }),
    ])
    expect(erpAfter.status).toBe('Closed')
    expect(erpLine.isOpen).toBe(false)
    expect(manualAfter.status).toBe('In Production')
    expect(manualLine.isOpen).toBe(true)
  })

  it('rejects cross-organization targets and drawer edits', async () => {
    const otherItem = await prisma.moduleItem.create({
      data: {
        moduleId: OTHER_MODULE_ID,
        status: 'In Production',
        data: orderData([{ lineNo: 1, sku: 'OTHER-SKU', qtyOrdered: 10, qtyReceived: 0 }]),
      },
    })
    const routing = getRouting(null)
    routing.openOrders.targetModuleId = OTHER_MODULE_ID
    const resolved = await resolveTargetModule(prisma, 'openOrders', routing, ORG_ID)
    expect(resolved).toBeNull()

    await expect(syncErpOpenOrders(prisma, OTHER_MODULE_ID, undefined, ORG_ID)).resolves.toEqual({
      recordsProcessed: 0,
      created: 0,
      updated: 0,
    })
    await expect(
      updateModuleItemForOrg(prisma, {
        orgId: ORG_ID,
        departmentId: OTHER_DEPT_ID,
        moduleId: OTHER_MODULE_ID,
        itemId: otherItem.id,
        canEditOpenOrders: true,
        patch: { status: 'Received' },
      }),
    ).rejects.toBeInstanceOf(ScopedModuleItemNotFoundError)
    await expect(
      updateModuleItemForOrg(prisma, {
        orgId: OTHER_ORG_ID,
        departmentId: OTHER_DEPT_ID,
        moduleId: OTHER_MODULE_ID,
        itemId: otherItem.id,
        canEditOpenOrders: false,
        patch: { status: 'Received' },
      }),
    ).rejects.toBeInstanceOf(OpenOrderEditForbiddenError)

    const unchanged = await prisma.moduleItem.findUniqueOrThrow({ where: { id: otherItem.id } })
    expect(unchanged.status).toBe('In Production')
    expect(await prisma.oorLine.count({ where: { orgId: OTHER_ORG_ID } })).toBe(0)
  })

  it('fails the HTTP refresh closed when routing names another organization’s module', async () => {
    await prisma.integration.create({
      data: {
        orgId: ORG_ID,
        name: 'ERP isolation test',
        type: 'ERP_KAREVE_SYNC',
        status: 'CONNECTED',
        config: {
          routing: {
            openOrders: {
              enabled: true,
              targetModuleId: OTHER_MODULE_ID,
              targetModuleType: 'OPEN_ORDERS',
            },
          },
        },
      },
    })
    const response = await requestIntegrationRoute(
      '/erp/refresh-open-orders',
      ['oor:edit_status'],
    )
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ ok: false })
    expect(await prisma.oorLine.count({ where: { orgId: OTHER_ORG_ID } })).toBe(0)
  })

  it('refuses refresh when the acting member cannot edit OOR statuses', async () => {
    const response = await requestIntegrationRoute('/erp/refresh-open-orders', ['oor:read'])
    expect(response.status).toBe(403)
  })

  it('refuses to push an open order owned by another organization', async () => {
    const otherItem = await prisma.moduleItem.create({
      data: {
        moduleId: OTHER_MODULE_ID,
        status: 'In Production',
        data: orderData([{ lineNo: 1, sku: 'OTHER-PUSH-SKU', qtyOrdered: 4, qtyReceived: 0 }]),
      },
    })
    const response = await requestIntegrationRoute(
      `/erp/push-open-order/${otherItem.id}`,
      ['oor:edit_status'],
    )
    expect(response.status).toBe(404)
  })
})

function parsedLine(itemNumber: string): ParsedReport['lines'][number] {
  return {
    customerPoNumber: 'PO-100',
    channelTag: null,
    salesOrderNumber: 'SO-100',
    itemNumber,
    custPartNumber: null,
    description: `${itemNumber} imported`,
    qtyOrdered: 20,
    qtyOrderedRaw: null,
    qtyRemaining: 12,
    unitPrice: 2.5,
    valueSource: 30,
    valueComputed: 30,
    valueMismatch: false,
    orderDate: new Date('2026-08-01'),
    shipDate: null,
    origRequiredDate: null,
    requiredDeliveryDate: new Date('2026-09-15'),
    workOrderNumber: null,
    jobNumber: null,
    fulfillmentType: 'CONTRACT_MFG',
    cmCode: 'ACME',
    jobStatus: 'ACT',
    comments: [],
    nodes: [],
    rawRow: {},
    externalIds: {},
  }
}

function reportAdapter(key: string, lines: ParsedReport['lines']): SourceAdapter {
  return {
    key,
    async load(_input: SourceInput): Promise<ParsedReport> {
      return {
        reportType: 'customer_open_order',
        reportLabel: key,
        asOfDate: new Date('2026-08-30'),
        lines,
        warnings: [],
      }
    },
  }
}

async function requestIntegrationRoute(path: string, permissions: string[]): Promise<Response> {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    ;(req as any).member = { id: 'test_member_erp_oor', orgId: ORG_ID }
    ;(req as any).subject = {
      id: 'test_member_erp_oor',
      lifecycleStatus: 'active',
      role: {
        id: 'test_role_erp_oor',
        key: 'test',
        name: 'Test',
        rank: 0,
        permissions,
      },
      overrides: [],
    }
    next()
  })
  app.use(integrationRoutes)
  const server = createServer(app)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('TEST_SERVER_ADDRESS_UNAVAILABLE')
    return await fetch(`http://127.0.0.1:${address.port}${path}`, { method: 'POST' })
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
    })
  }
}