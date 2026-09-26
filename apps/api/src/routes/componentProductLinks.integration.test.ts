// ─── Component → Product Links Integration Tests ─────────────
// NX-105: Verify org-scoped component product assignments work correctly.
// Run with: DATABASE_URL="postgresql://nexus:nexus@localhost:5432/nexus" pnpm --filter @nexus/api test componentProductLinks

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import express from 'express'
import { createServer } from 'http'
import { componentRoutes } from './components'

const prisma = new PrismaClient()

const ORG_A = 'test_org_cpl_a'
const ORG_B = 'test_org_cpl_b'
const DEPT_A = 'test_dept_cpl_a'
const DEPT_B = 'test_dept_cpl_b'
const MODULE_A = 'test_module_cpl_a'
const MODULE_B = 'test_module_cpl_b'
const COMPONENT_A = 'test_component_cpl_a'
const COMPONENT_B = 'test_component_cpl_b'
const PRODUCT_A1 = 'test_product_cpl_a1'
const PRODUCT_A2 = 'test_product_cpl_a2'
const PRODUCT_B = 'test_product_cpl_b'

const UPC_A1 = '012345678905' // valid UPC-A check digit (5)
const UPC_A2 = '123456789012' // valid UPC-A check digit (2)
const UPC_B = '234567890129'  // valid UPC-A check digit (9)
const UPC_INVALID = '111111111111' // invalid check digit (should be 7, not 1)

async function clearTestData() {
  await prisma.componentProductLink.deleteMany({
    where: { orgId: { in: [ORG_A, ORG_B] } },
  })
  await prisma.product.deleteMany({
    where: { orgId: { in: [ORG_A, ORG_B] } },
  })
  await prisma.moduleItem.deleteMany({
    where: { module: { department: { orgId: { in: [ORG_A, ORG_B] } } } },
  })
  await prisma.departmentModule.deleteMany({
    where: { department: { orgId: { in: [ORG_A, ORG_B] } } },
  })
  await prisma.department.deleteMany({ where: { orgId: { in: [ORG_A, ORG_B] } } })
}

async function wipe() {
  await clearTestData()
  await prisma.organization.deleteMany({ where: { id: { in: [ORG_A, ORG_B] } } })
}

beforeAll(async () => {
  await wipe()
  await prisma.organization.createMany({
    data: [
      { id: ORG_A, name: 'CPL Tenant A', slug: ORG_A, color: '#111111', featureInterests: [] },
      { id: ORG_B, name: 'CPL Tenant B', slug: ORG_B, color: '#222222', featureInterests: [] },
    ],
  })
})

beforeEach(async () => {
  await clearTestData()
  
  await prisma.department.createMany({
    data: [
      { id: DEPT_A, name: 'Operations A', orgId: ORG_A, type: 'BUILTIN_OPS' },
      { id: DEPT_B, name: 'Operations B', orgId: ORG_B, type: 'BUILTIN_OPS' },
    ],
  })
  
  await prisma.departmentModule.createMany({
    data: [
      { id: MODULE_A, name: 'Components A', type: 'COMPONENTS', departmentId: DEPT_A },
      { id: MODULE_B, name: 'Components B', type: 'COMPONENTS', departmentId: DEPT_B },
    ],
  })
  
  await prisma.moduleItem.createMany({
    data: [
      { id: COMPONENT_A, moduleId: MODULE_A, data: { name: 'Component A', partNumber: 'CMP-A' } },
      { id: COMPONENT_B, moduleId: MODULE_B, data: { name: 'Component B', partNumber: 'CMP-B' } },
    ],
  })
  
  await prisma.product.createMany({
    data: [
      { id: PRODUCT_A1, name: 'Product A1', brand: 'Brand A', category: 'Test', upc: UPC_A1, orgId: ORG_A },
      { id: PRODUCT_A2, name: 'Product A2', brand: 'Brand A', category: 'Test', upc: UPC_A2, orgId: ORG_A },
      { id: PRODUCT_B, name: 'Product B', brand: 'Brand B', category: 'Test', upc: UPC_B, orgId: ORG_B },
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
  } = {},
): Promise<Response> {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    ;(req as any).member = { id: `member_${orgId}`, orgId }
    next()
  })
  app.use(componentRoutes)

  const server = createServer(app)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('TEST_SERVER_ADDRESS_UNAVAILABLE')
    return await fetch(`http://127.0.0.1:${address.port}${path}`, {
      method: options.method ?? 'GET',
      headers: options.body === undefined ? undefined : { 'content-type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
    })
  }
}

describe('Component → Product Links (NX-105)', () => {
  describe('org isolation', () => {
    it('cannot assign a product from another org', async () => {
      const response = await request(ORG_A, `/${COMPONENT_A}/products`, {
        method: 'POST',
        body: { upc: UPC_B },
      })
      expect(response.status).toBe(404)
      const body = await response.json()
      expect(body.error).toBe('No product with this UPC-A')
    })

    it('cannot see a component from another org', async () => {
      const response = await request(ORG_A, `/${COMPONENT_B}/products`)
      expect(response.status).toBe(404)
      const body = await response.json()
      expect(body.error).toBe('Component not found')
    })

    it('search only returns products from own org', async () => {
      const response = await request(ORG_A, `/${COMPONENT_A}/products/search?upc=${UPC_A1.substring(0, 4)}`)
      expect(response.status).toBe(200)
      const products = await response.json()
      expect(Array.isArray(products)).toBe(true)
      const upcs = products.map((p: any) => p.upc)
      expect(upcs).not.toContain(UPC_B)
    })
  })

  describe('invalid UPC-A', () => {
    it('rejects UPC-A with letters in search', async () => {
      const response = await request(ORG_A, `/${COMPONENT_A}/products/search?upc=0123abc45678`)
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toBe('UPC-A must contain only digits')
    })

    it('rejects UPC-A with letters in assign', async () => {
      const response = await request(ORG_A, `/${COMPONENT_A}/products`, {
        method: 'POST',
        body: { upc: '0123abc45678' },
      })
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toBe('UPC-A must contain only digits')
    })

    it('rejects UPC-A with invalid check digit in assign', async () => {
      const response = await request(ORG_A, `/${COMPONENT_A}/products`, {
        method: 'POST',
        body: { upc: UPC_INVALID },
      })
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toBe('Invalid UPC-A: must be 12 digits with valid check digit')
    })

    it('rejects too short UPC-A prefix in search', async () => {
      const response = await request(ORG_A, `/${COMPONENT_A}/products/search?upc=012`)
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toBe('Enter at least 4 digits to search')
    })
  })

  describe('not-found cases', () => {
    it('returns 404 for non-existent component', async () => {
      const response = await request(ORG_A, `/nonexistent_component/products`)
      expect(response.status).toBe(404)
      const body = await response.json()
      expect(body.error).toBe('Component not found')
    })

    it('returns 404 for non-existent UPC-A in assign', async () => {
      const response = await request(ORG_A, `/${COMPONENT_A}/products`, {
        method: 'POST',
        body: { upc: '999999999993' }, // valid check digit but no product
      })
      expect(response.status).toBe(404)
      const body = await response.json()
      expect(body.error).toBe('No product with this UPC-A')
    })

    it('returns 404 when unassigning non-linked product', async () => {
      const response = await request(ORG_A, `/${COMPONENT_A}/products/${UPC_A1}`, {
        method: 'DELETE',
      })
      expect(response.status).toBe(404)
      const body = await response.json()
      expect(body.error).toBe('Product not assigned to this component')
    })
  })

  describe('duplicate idempotent assign', () => {
    it('returns 201 for first assign, 200 for duplicate', async () => {
      const first = await request(ORG_A, `/${COMPONENT_A}/products`, {
        method: 'POST',
        body: { upc: UPC_A1 },
      })
      expect(first.status).toBe(201)
      const firstBody = await first.json()
      expect(firstBody.upc).toBe(UPC_A1)

      const second = await request(ORG_A, `/${COMPONENT_A}/products`, {
        method: 'POST',
        body: { upc: UPC_A1 },
      })
      expect(second.status).toBe(200)
      const secondBody = await second.json()
      expect(secondBody.upc).toBe(UPC_A1)

      const links = await prisma.componentProductLink.findMany({
        where: { orgId: ORG_A, componentId: COMPONENT_A },
      })
      expect(links.length).toBe(1)
    })
  })

  describe('search-does-not-use-name', () => {
    it('search by UPC prefix finds products, not by name', async () => {
      await prisma.product.create({
        data: {
          name: 'Product With Name 0123',
          brand: 'Brand',
          category: 'Test',
          upc: '555555555559', // does not start with 0123
          orgId: ORG_A,
        },
      })

      const response = await request(ORG_A, `/${COMPONENT_A}/products/search?upc=0123`)
      expect(response.status).toBe(200)
      const products = await response.json()
      const names = products.map((p: any) => p.name)
      expect(names).not.toContain('Product With Name 0123')
    })

    it('search by name prefix returns empty (we only search UPC)', async () => {
      const response = await request(ORG_A, `/${COMPONENT_A}/products/search?upc=Product`)
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toBe('UPC-A must contain only digits')
    })
  })

  describe('full workflow', () => {
    it('assign, list, unassign cycle works correctly', async () => {
      const assign1 = await request(ORG_A, `/${COMPONENT_A}/products`, {
        method: 'POST',
        body: { upc: UPC_A1 },
      })
      expect(assign1.status).toBe(201)

      const assign2 = await request(ORG_A, `/${COMPONENT_A}/products`, {
        method: 'POST',
        body: { upc: UPC_A2 },
      })
      expect(assign2.status).toBe(201)

      const list = await request(ORG_A, `/${COMPONENT_A}/products`)
      expect(list.status).toBe(200)
      const products = await list.json()
      expect(products.length).toBe(2)
      expect(products.map((p: any) => p.upc).sort()).toEqual([UPC_A1, UPC_A2].sort())

      const search = await request(ORG_A, `/${COMPONENT_A}/products/search?upc=0123`)
      expect(search.status).toBe(200)
      const searchResults = await search.json()
      expect(searchResults.map((p: any) => p.upc)).not.toContain(UPC_A1)

      const unassign = await request(ORG_A, `/${COMPONENT_A}/products/${UPC_A1}`, {
        method: 'DELETE',
      })
      expect(unassign.status).toBe(204)

      const listAfter = await request(ORG_A, `/${COMPONENT_A}/products`)
      expect(listAfter.status).toBe(200)
      const productsAfter = await listAfter.json()
      expect(productsAfter.length).toBe(1)
      expect(productsAfter[0].upc).toBe(UPC_A2)
    })
  })
})
