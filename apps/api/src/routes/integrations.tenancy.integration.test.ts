// Needs a live database — run with `pnpm --filter @nexus/api test:integration`.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import express from 'express'
import { createServer } from 'http'
import { integrationRoutes } from './integrations'
import { aiRoutes } from './ai'
import { inventoryImportRoutes } from './inventoryImport'
import { generateState } from '../lib/oauth'
import { encryptJson } from '../lib/encryption'
import { setOutboundOnConfig } from '../lib/erpRouting'
import { GEODIS_FEED_TYPE } from '../services/inventoryImport/feedConfig'

const prisma = new PrismaClient()
const ORG_A = 'test_org_integrations_tenant_a'
const ORG_B = 'test_org_integrations_tenant_b'
const INTEGRATION_A = 'test_integration_tenant_a'
const INTEGRATION_B = 'test_integration_tenant_b'
const GENERIC_A = 'test_integration_generic_a'
const GENERIC_B = 'test_integration_generic_b'
const DEPT_A = 'test_integration_dept_a'
const DEPT_B = 'test_integration_dept_b'
const MODULE_A = 'test_integration_module_a'
const MODULE_B = 'test_integration_module_b'
const GEODIS_A = 'test_integration_geodis_a'
const GEODIS_B = 'test_integration_geodis_b'

async function clearTenantData() {
  await prisma.syncLog.deleteMany({
    where: { integration: { orgId: { in: [ORG_A, ORG_B] } } },
  })
  await prisma.moduleItem.deleteMany({
    where: { module: { department: { orgId: { in: [ORG_A, ORG_B] } } } },
  })
  await prisma.departmentModule.deleteMany({
    where: { department: { orgId: { in: [ORG_A, ORG_B] } } },
  })
  await prisma.department.deleteMany({ where: { orgId: { in: [ORG_A, ORG_B] } } })
  await prisma.integration.deleteMany({ where: { orgId: { in: [ORG_A, ORG_B] } } })
}

async function wipe() {
  await clearTenantData()
  await prisma.organization.deleteMany({ where: { id: { in: [ORG_A, ORG_B] } } })
}

beforeAll(async () => {
  await wipe()
  await prisma.organization.createMany({
    data: [
      { id: ORG_A, name: 'Integration tenant A', slug: ORG_A, color: '#111111', featureInterests: [] },
      { id: ORG_B, name: 'Integration tenant B', slug: ORG_B, color: '#222222', featureInterests: [] },
    ],
  })
})

beforeEach(async () => {
  await clearTenantData()
  const tenantBConfig = setOutboundOnConfig(
    encryptJson({ apiUrl: 'https://tenant-b.invalid/api/v1', apiKey: 'tenant-b-key' }),
    { components: { enabled: true, erpPath: '/tenant-b-components' } },
  )
  await prisma.integration.createMany({
    data: [
      {
        id: INTEGRATION_A,
        orgId: ORG_A,
        type: 'ERP_KAREVE_SYNC',
        name: 'Tenant A ERP',
        status: 'CONNECTED',
        config: { routing: { skus: { enabled: true, erpPath: '/tenant-a-products' } } },
      },
      {
        id: INTEGRATION_B,
        orgId: ORG_B,
        type: 'ERP_KAREVE_SYNC',
        name: 'Tenant B ERP',
        status: 'CONNECTED',
        config: {
          ...tenantBConfig,
          routing: { skus: { enabled: false, erpPath: '/tenant-b-products' } },
        },
      },
      {
        id: GENERIC_A,
        orgId: ORG_A,
        type: 'SLACK',
        name: 'Tenant A Slack',
        status: 'DISCONNECTED',
        config: {},
      },
      {
        id: GENERIC_B,
        orgId: ORG_B,
        type: 'SLACK',
        name: 'Tenant B Slack',
        status: 'CONNECTED',
        config: { marker: 'tenant-b-secret' },
      },
    ],
  })
  await prisma.syncLog.createMany({
    data: [
      { integrationId: INTEGRATION_A, status: 'COMPLETE', recordsProcessed: 11 },
      { integrationId: INTEGRATION_B, status: 'FAILED', recordsProcessed: 22 },
    ],
  })
})

afterAll(async () => {
  await wipe()
  await prisma.$disconnect()
})

async function request(
  orgId: string,
  path: string,
  options: {
    method?: string
    body?: unknown
    permissions?: string[]
    redirect?: RequestRedirect
    router?: express.Router
  } = {},
): Promise<Response> {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    ;(req as any).member = { id: `member_${orgId}`, orgId }
    ;(req as any).subject = {
      id: `member_${orgId}`,
      lifecycleStatus: 'active',
      role: {
        id: `role_${orgId}`,
        key: 'test',
        name: 'Test',
        rank: 0,
        permissions: options.permissions ?? ['settings:read', 'settings:manage'],
      },
      overrides: [],
    }
    next()
  })
  app.use(options.router ?? integrationRoutes)

  const server = createServer(app)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('TEST_SERVER_ADDRESS_UNAVAILABLE')
    const isFormData = options.body instanceof FormData
    return await fetch(`http://127.0.0.1:${address.port}${path}`, {
      method: options.method ?? 'GET',
      headers: options.body === undefined || isFormData ? undefined : { 'content-type': 'application/json' },
      body:
        options.body === undefined
          ? undefined
          : isFormData
            ? options.body
            : JSON.stringify(options.body),
      redirect: options.redirect,
    })
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
    })
  }
}

describe('organization integration HTTP isolation', () => {
  it('lists only the acting workspace integrations', async () => {
    const response = await request(ORG_A, '/')
    expect(response.status).toBe(200)
    const body = await response.json() as Array<{ id: string }>
    expect(body.map((row) => row.id).sort()).toEqual([GENERIC_A, INTEGRATION_A].sort())
  })

  it('returns status and logs only from the acting workspace record', async () => {
    const status = await request(ORG_A, '/ERP_KAREVE_SYNC/status')
    expect(status.status).toBe(200)
    expect((await status.json() as { status: string }).status).toBe('CONNECTED')

    const logs = await request(ORG_A, '/ERP_KAREVE_SYNC/logs')
    expect(logs.status).toBe(200)
    const body = await logs.json() as Array<{ recordsProcessed: number }>
    expect(body.map((row) => row.recordsProcessed)).toEqual([11])
  })

  it('reads and updates routing without exposing or changing another workspace', async () => {
    const read = await request(ORG_A, '/ERP_KAREVE_SYNC/routing')
    expect(read.status).toBe(200)
    const readBody = await read.json() as { feeds: Array<{ key: string; erpPath: string | null }> }
    expect(readBody.feeds.find((feed) => feed.key === 'skus')?.erpPath).toBe('/tenant-a-products')

    const update = await request(ORG_A, '/ERP_KAREVE_SYNC/routing', {
      method: 'PATCH',
      body: { routing: { skus: { enabled: false, erpPath: '/updated-a' } } },
    })
    expect(update.status).toBe(200)

    const other = await prisma.integration.findUniqueOrThrow({ where: { id: INTEGRATION_B } })
    expect((other.config as any).routing.skus.erpPath).toBe('/tenant-b-products')
  })

  it('disconnects only the acting workspace integration', async () => {
    const response = await request(ORG_A, '/ERP_KAREVE_SYNC/disconnect', { method: 'POST' })
    expect(response.status).toBe(200)

    const [own, other] = await Promise.all([
      prisma.integration.findUniqueOrThrow({ where: { id: INTEGRATION_A } }),
      prisma.integration.findUniqueOrThrow({ where: { id: INTEGRATION_B } }),
    ])
    expect(own.status).toBe('DISCONNECTED')
    expect(other.status).toBe('CONNECTED')
  })

  it('connects and tests only the acting workspace generic integration', async () => {
    const connect = await request(ORG_A, '/SLACK/connect', {
      method: 'POST',
      body: { config: { marker: 'tenant-a-value' } },
    })
    expect(connect.status).toBe(200)

    const test = await request(ORG_A, '/SLACK/test', { method: 'POST' })
    expect(test.status).toBe(200)

    const [own, other] = await Promise.all([
      prisma.integration.findUniqueOrThrow({ where: { id: GENERIC_A } }),
      prisma.integration.findUniqueOrThrow({ where: { id: GENERIC_B } }),
    ])
    expect(own.status).toBe('CONNECTED')
    expect((own.config as any).marker).toBe('tenant-a-value')
    expect((other.config as any).marker).toBe('tenant-b-secret')
  })

  it('reads and updates outbound settings only in the acting workspace', async () => {
    const read = await request(ORG_A, '/ERP_KAREVE_SYNC/outbound')
    expect(read.status).toBe(200)

    const update = await request(ORG_A, '/ERP_KAREVE_SYNC/outbound', {
      method: 'PATCH',
      body: { outbound: { components: { enabled: true, erpPath: '/tenant-a-components' } } },
    })
    expect(update.status).toBe(200)

    const [own, other] = await Promise.all([
      prisma.integration.findUniqueOrThrow({ where: { id: INTEGRATION_A } }),
      prisma.integration.findUniqueOrThrow({ where: { id: INTEGRATION_B } }),
    ])
    expect((own.config as any).outbound.components.erpPath).toBe('/tenant-a-components')
    expect((other.config as any).outbound.components.erpPath).toBe('/tenant-b-components')
  })

  it('syncs and pushes only the acting workspace integration and source data', async () => {
    await prisma.department.createMany({
      data: [
        { id: DEPT_A, name: 'Tenant A Operations', orgId: ORG_A },
        { id: DEPT_B, name: 'Tenant B Operations', orgId: ORG_B },
      ],
    })
    await prisma.departmentModule.createMany({
      data: [
        { id: MODULE_A, name: 'Tenant A Components', type: 'COMPONENTS', departmentId: DEPT_A },
        { id: MODULE_B, name: 'Tenant B Components', type: 'COMPONENTS', departmentId: DEPT_B },
      ],
    })
    await prisma.moduleItem.createMany({
      data: [
        { moduleId: MODULE_A, data: { partNumber: 'A-PART', name: 'Tenant A part' } },
        { moduleId: MODULE_B, data: { partNumber: 'B-PART', name: 'Tenant B part' } },
      ],
    })
    const outbound = await request(ORG_A, '/ERP_KAREVE_SYNC/outbound', {
      method: 'PATCH',
      body: { outbound: { components: { enabled: true, erpPath: '/tenant-a-components' } } },
    })
    expect(outbound.status).toBe(200)

    const sync = await request(ORG_A, '/ERP_KAREVE_SYNC/sync', { method: 'POST' })
    expect(sync.status).toBe(200)

    const push = await request(ORG_A, '/ERP_KAREVE_SYNC/push', {
      method: 'POST',
      body: { feeds: ['components'] },
    })
    expect(push.status).toBe(200)
    const pushBody = await push.json() as {
      dryRun: boolean
      feeds: { components: { sample: { partNumber: string } } }
    }
    expect(pushBody.dryRun).toBe(true)
    expect(pushBody.feeds.components.sample.partNumber).toBe('A-PART')

    const [ownLogs, otherLogs] = await Promise.all([
      prisma.syncLog.count({ where: { integrationId: INTEGRATION_A } }),
      prisma.syncLog.count({ where: { integrationId: INTEGRATION_B } }),
    ])
    expect(ownLogs).toBe(3)
    expect(otherLogs).toBe(1)
  })

  it('requires settings:manage for administrative mutations', async () => {
    const response = await request(ORG_A, '/ERP_KAREVE_SYNC/disconnect', {
      method: 'POST',
      permissions: ['settings:read'],
    })
    expect(response.status).toBe(403)

    const own = await prisma.integration.findUniqueOrThrow({ where: { id: INTEGRATION_A } })
    expect(own.status).toBe('CONNECTED')
  })

  it('requires settings:manage before an OAuth callback can exchange or persist tokens', async () => {
    const response = await request(ORG_A, '/microsoft/callback?code=fake&state=fake', {
      permissions: ['settings:read'],
    })
    expect(response.status).toBe(403)
  })

  it('rejects an OAuth callback state issued for another workspace', async () => {
    const state = generateState('microsoft', ORG_A)
    const response = await request(ORG_B, `/microsoft/callback?code=fake&state=${state}`, {
      redirect: 'manual',
    })
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toContain('error=invalid_state')
  })

  it('keeps the AI ERP trigger scoped to the acting workspace', async () => {
    const response = await request(ORG_A, '/actions/sync-erp', {
      method: 'POST',
      router: aiRoutes,
    })
    expect(response.status).toBe(200)

    const [own, other] = await Promise.all([
      prisma.integration.findUniqueOrThrow({ where: { id: INTEGRATION_A } }),
      prisma.integration.findUniqueOrThrow({ where: { id: INTEGRATION_B } }),
    ])
    expect(own.syncCount).toBe(1)
    expect(other.syncCount).toBe(0)
  })

  it('isolates Geodis status, logs, config, and uploaded inventory by workspace', async () => {
    await prisma.department.createMany({
      data: [
        { id: DEPT_A, name: 'Tenant A Operations', orgId: ORG_A, type: 'BUILTIN_OPS' },
        { id: DEPT_B, name: 'Tenant B Operations', orgId: ORG_B, type: 'BUILTIN_OPS' },
      ],
    })
    await prisma.departmentModule.createMany({
      data: [
        { id: MODULE_A, name: 'Geodis Inventory', type: 'INVENTORY_HEALTH', departmentId: DEPT_A },
        { id: MODULE_B, name: 'Geodis Inventory', type: 'INVENTORY_HEALTH', departmentId: DEPT_B },
      ],
    })
    await prisma.integration.createMany({
      data: [
        {
          id: GEODIS_A,
          orgId: ORG_A,
          type: GEODIS_FEED_TYPE,
          name: 'Tenant A Geodis',
          status: 'CONNECTED',
          config: { targetModuleId: MODULE_A, warehouse: 'A-WAREHOUSE' },
        },
        {
          id: GEODIS_B,
          orgId: ORG_B,
          type: GEODIS_FEED_TYPE,
          name: 'Tenant B Geodis',
          status: 'CONNECTED',
          config: { targetModuleId: MODULE_B, warehouse: 'B-WAREHOUSE' },
        },
      ],
    })
    await prisma.moduleItem.createMany({
      data: [
        { moduleId: MODULE_A, data: { sku: 'A-OLD', onHand: 1 } },
        { moduleId: MODULE_B, data: { sku: 'B-SECRET', onHand: 99 } },
      ],
    })
    await prisma.syncLog.createMany({
      data: [
        { integrationId: GEODIS_A, status: 'complete', recordsProcessed: 1 },
        { integrationId: GEODIS_B, status: 'complete', recordsProcessed: 99 },
      ],
    })

    const status = await request(ORG_A, '/geodis/status', {
      permissions: ['settings:read'],
      router: inventoryImportRoutes,
    })
    expect(status.status).toBe(200)
    const statusBody = await status.json() as {
      integrationId: string
      moduleId: string
      itemCount: number
      config: { warehouse: string }
    }
    expect(statusBody).toMatchObject({
      integrationId: GEODIS_A,
      moduleId: MODULE_A,
      itemCount: 1,
      config: { warehouse: 'A-WAREHOUSE' },
    })

    const logs = await request(ORG_A, '/geodis/logs', {
      permissions: ['settings:read'],
      router: inventoryImportRoutes,
    })
    expect(logs.status).toBe(200)
    expect((await logs.json() as Array<{ recordsProcessed: number }>)
      .map((row) => row.recordsProcessed)).toEqual([1])

    const config = await request(ORG_A, '/geodis/config', {
      method: 'PUT',
      body: { warehouse: 'A-UPDATED' },
      router: inventoryImportRoutes,
    })
    expect(config.status).toBe(200)

    const form = new FormData()
    form.append(
      'file',
      new Blob(['Item,Description,Brand,On Hand,Allocated,Available\nA-NEW,Tenant A item,Brand A,8,2,6\n']),
      'inventory.csv',
    )
    const upload = await request(ORG_A, '/geodis/upload', {
      method: 'POST',
      body: form,
      router: inventoryImportRoutes,
    })
    expect(upload.status).toBe(200)

    const [ownFeed, otherFeed, ownItems, otherItems] = await Promise.all([
      prisma.integration.findUniqueOrThrow({ where: { id: GEODIS_A } }),
      prisma.integration.findUniqueOrThrow({ where: { id: GEODIS_B } }),
      prisma.moduleItem.findMany({ where: { moduleId: MODULE_A } }),
      prisma.moduleItem.findMany({ where: { moduleId: MODULE_B } }),
    ])
    expect((ownFeed.config as any).warehouse).toBe('A-UPDATED')
    expect((otherFeed.config as any).warehouse).toBe('B-WAREHOUSE')
    expect(ownItems.some((item) => (item.data as any).sku === 'A-NEW')).toBe(true)
    expect(otherItems.map((item) => (item.data as any).sku)).toEqual(['B-SECRET'])
  })
})