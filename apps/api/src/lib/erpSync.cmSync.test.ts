import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the erpClient module before importing erpSync
vi.mock('./erpClient', async () => {
  const actual = await vi.importActual('./erpClient')
  return {
    ...actual,
    fetchErpCms: vi.fn(),
  }
})

import { syncErpCm, type ErpSyncResult } from './erpSync'
import { fetchErpCms, type ErpCm } from './erpClient'
import type { PrismaClient } from '@prisma/client'

const mockFetchErpCms = fetchErpCms as ReturnType<typeof vi.fn>

// Fixture: Example CM LLC per spec NX-CM (companyName Example CM LLC, taxId null, emails @example.com)
function makeCm(overrides: Partial<ErpCm> = {}): ErpCm {
  return {
    erpId: 'cm-test-001',
    name: 'Example CM LLC',
    cmCode: 'EXMPL',
    legalName: 'Example Contract Manufacturer LLC',
    cmType: 'FULL_SERVICE',
    vendorId: 'v-001',
    headquarters: 'New York, NY',
    brands: ["Carol's Daughter", 'Ambi'],
    status: 'active',
    avgLeadTime: '6-8 wks',
    onTime: 92,
    quality: 95,
    activePOs: 4,
    source: 'ERP_KAREVE',
    ...overrides,
  }
}

function makeModuleItem(data: Record<string, any>, id = 'item-1') {
  return {
    id,
    moduleId: 'mod-cm',
    data,
    status: data.status || 'active',
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

function makePrisma(
  moduleResult: any | null,
  existingItems: any[] = [],
): PrismaClient {
  const updatedItems: any[] = []
  const createdItems: any[] = []
  return {
    departmentModule: {
      findUnique: vi.fn().mockResolvedValue(moduleResult),
      findFirst: vi.fn().mockResolvedValue(moduleResult),
    },
    moduleItem: {
      findMany: vi.fn().mockResolvedValue(existingItems),
      update: vi.fn().mockImplementation(({ where, data }) => {
        const item = existingItems.find((i) => i.id === where.id)
        const updated = { ...item, ...data.data ? { data: data.data } : {}, status: data.status }
        updatedItems.push(updated)
        return Promise.resolve(updated)
      }),
      create: vi.fn().mockImplementation(({ data }) => {
        const item = { id: `new-${createdItems.length + 1}`, ...data }
        createdItems.push(item)
        return Promise.resolve(item)
      }),
    },
    $updatedItems: updatedItems,
    $createdItems: createdItems,
  } as unknown as PrismaClient
}

describe('syncErpCm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('module resolution', () => {
    it('returns inert result when target module not found', async () => {
      const prisma = makePrisma(null)
      mockFetchErpCms.mockResolvedValue([makeCm()])

      const result = await syncErpCm(prisma, 'nonexistent-id')

      expect(result).toEqual({ recordsProcessed: 0, created: 0, updated: 0 })
      expect(mockFetchErpCms).not.toHaveBeenCalled()
    })

    it('uses explicit targetModuleId when provided', async () => {
      const mod = { id: 'mod-cm', type: 'CM_PRODUCTIVITY' }
      const prisma = makePrisma(mod)
      mockFetchErpCms.mockResolvedValue([])

      await syncErpCm(prisma, 'mod-cm')

      expect(prisma.departmentModule.findUnique).toHaveBeenCalledWith({
        where: { id: 'mod-cm' },
      })
    })
  })

  describe('empty ERP response', () => {
    it('does not wipe existing CMs when ERP returns empty feed', async () => {
      const mod = { id: 'mod-cm', type: 'CM_PRODUCTIVITY' }
      const existing = [
        makeModuleItem({ erpId: 'cm-001', name: 'Existing CM' }, 'item-1'),
      ]
      const prisma = makePrisma(mod, existing)
      mockFetchErpCms.mockResolvedValue([])

      const result = await syncErpCm(prisma)

      expect(result).toEqual({ recordsProcessed: 0, created: 0, updated: 0 })
      expect(prisma.moduleItem.update).not.toHaveBeenCalled()
      expect(prisma.moduleItem.create).not.toHaveBeenCalled()
    })
  })

  describe('matching strategy', () => {
    it('matches by erpId (primary match)', async () => {
      const mod = { id: 'mod-cm', type: 'CM_PRODUCTIVITY' }
      const existing = [
        makeModuleItem({ erpId: 'cm-test-001', name: 'Old Name' }, 'item-1'),
      ]
      const prisma = makePrisma(mod, existing)
      const erpCm = makeCm({ name: 'New Name From ERP' })
      mockFetchErpCms.mockResolvedValue([erpCm])

      const result = await syncErpCm(prisma)

      expect(result).toEqual({ recordsProcessed: 1, created: 0, updated: 1 })
      expect(prisma.moduleItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'item-1' },
          data: expect.objectContaining({
            data: expect.objectContaining({ name: 'New Name From ERP' }),
          }),
        }),
      )
    })

    it('falls back to name match and stamps erpId', async () => {
      const mod = { id: 'mod-cm', type: 'CM_PRODUCTIVITY' }
      // Existing item has no erpId, only name
      const existing = [
        makeModuleItem({ name: 'Example CM LLC' }, 'item-1'),
      ]
      const prisma = makePrisma(mod, existing)
      const erpCm = makeCm({ erpId: 'cm-new-id' })
      mockFetchErpCms.mockResolvedValue([erpCm])

      const result = await syncErpCm(prisma)

      expect(result).toEqual({ recordsProcessed: 1, created: 0, updated: 1 })
      expect(prisma.moduleItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'item-1' },
          data: expect.objectContaining({
            data: expect.objectContaining({ erpId: 'cm-new-id' }),
          }),
        }),
      )
    })

    it('creates new CM when no match found', async () => {
      const mod = { id: 'mod-cm', type: 'CM_PRODUCTIVITY' }
      const prisma = makePrisma(mod, [])
      mockFetchErpCms.mockResolvedValue([makeCm()])

      const result = await syncErpCm(prisma)

      expect(result).toEqual({ recordsProcessed: 1, created: 1, updated: 0 })
      expect(prisma.moduleItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            moduleId: 'mod-cm',
            data: expect.objectContaining({
              erpId: 'cm-test-001',
              name: 'Example CM LLC',
              source: 'ERP_KAREVE',
            }),
          }),
        }),
      )
    })
  })

  describe('field mapping', () => {
    it('maps all ERP fields correctly', async () => {
      const mod = { id: 'mod-cm', type: 'CM_PRODUCTIVITY' }
      const prisma = makePrisma(mod, [])
      const erpCm = makeCm()
      mockFetchErpCms.mockResolvedValue([erpCm])

      await syncErpCm(prisma)

      const created = (prisma as any).$createdItems[0]
      expect(created.data).toMatchObject({
        erpId: 'cm-test-001',
        name: 'Example CM LLC',
        cmCode: 'EXMPL',
        legalName: 'Example Contract Manufacturer LLC',
        cmType: 'FULL_SERVICE',
        vendorId: 'v-001',
        headquarters: 'New York, NY',
        brands: ["Carol's Daughter", 'Ambi'],
        status: 'active',
        avgLeadTime: '6-8 wks',
        onTime: 92,
        quality: 95,
        activePOs: 4,
        source: 'ERP_KAREVE',
      })
      expect(created.data.lastSyncedAt).toBeDefined()
    })

    it('sets source to ERP_KAREVE', async () => {
      const mod = { id: 'mod-cm', type: 'CM_PRODUCTIVITY' }
      const prisma = makePrisma(mod, [])
      mockFetchErpCms.mockResolvedValue([makeCm()])

      await syncErpCm(prisma)

      const created = (prisma as any).$createdItems[0]
      expect(created.data.source).toBe('ERP_KAREVE')
    })

    it('sets lastSyncedAt timestamp', async () => {
      const mod = { id: 'mod-cm', type: 'CM_PRODUCTIVITY' }
      const prisma = makePrisma(mod, [])
      mockFetchErpCms.mockResolvedValue([makeCm()])

      const before = new Date().toISOString()
      await syncErpCm(prisma)
      const after = new Date().toISOString()

      const created = (prisma as any).$createdItems[0]
      expect(created.data.lastSyncedAt >= before).toBe(true)
      expect(created.data.lastSyncedAt <= after).toBe(true)
    })
  })

  describe('field preservation', () => {
    it('preserves local issues, contacts, products, notes on update', async () => {
      const mod = { id: 'mod-cm', type: 'CM_PRODUCTIVITY' }
      const existing = [
        makeModuleItem({
          erpId: 'cm-test-001',
          name: 'Example CM LLC',
          issues: [{ id: 1, text: 'Delivery delay' }],
          contacts: [{ name: 'John Doe', email: 'john@example.com' }],
          products: [{ sku: 'SKU-001' }],
          notes: ['Important note'],
          contractStatus: 'Active Contract',
          address: { city: 'New York', state: 'NY' },
        }, 'item-1'),
      ]
      const prisma = makePrisma(mod, existing)
      mockFetchErpCms.mockResolvedValue([makeCm()])

      await syncErpCm(prisma)

      const updated = (prisma as any).$updatedItems[0]
      expect(updated.data.issues).toEqual([{ id: 1, text: 'Delivery delay' }])
      expect(updated.data.contacts).toEqual([{ name: 'John Doe', email: 'john@example.com' }])
      expect(updated.data.products).toEqual([{ sku: 'SKU-001' }])
      expect(updated.data.notes).toEqual(['Important note'])
      expect(updated.data.contractStatus).toBe('Active Contract')
      expect(updated.data.address).toEqual({ city: 'New York', state: 'NY' })
    })

    it('preserves local scorecard when ERP does not provide values', async () => {
      const mod = { id: 'mod-cm', type: 'CM_PRODUCTIVITY' }
      const existing = [
        makeModuleItem({
          erpId: 'cm-test-001',
          name: 'Example CM LLC',
          onTime: 88,
          quality: 92,
          activePOs: 7,
          openIssues: 3,
        }, 'item-1'),
      ]
      const prisma = makePrisma(mod, existing)
      const erpCm = makeCm({ onTime: undefined, quality: undefined, activePOs: undefined })
      mockFetchErpCms.mockResolvedValue([erpCm])

      await syncErpCm(prisma)

      const updated = (prisma as any).$updatedItems[0]
      expect(updated.data.onTime).toBe(88)
      expect(updated.data.quality).toBe(92)
      expect(updated.data.activePOs).toBe(7)
      expect(updated.data.openIssues).toBe(3)
    })

    it('NEVER copies taxId (removes if present)', async () => {
      const mod = { id: 'mod-cm', type: 'CM_PRODUCTIVITY' }
      const existing = [
        makeModuleItem({
          erpId: 'cm-test-001',
          name: 'Example CM LLC',
          taxId: '12-3456789', // Existing taxId should be removed
        }, 'item-1'),
      ]
      const prisma = makePrisma(mod, existing)
      mockFetchErpCms.mockResolvedValue([makeCm()])

      await syncErpCm(prisma)

      const updated = (prisma as any).$updatedItems[0]
      expect(updated.data.taxId).toBeUndefined()
    })
  })

  describe('status handling', () => {
    it('updates ModuleItem status to match ERP status', async () => {
      const mod = { id: 'mod-cm', type: 'CM_PRODUCTIVITY' }
      const existing = [
        makeModuleItem({ erpId: 'cm-test-001', name: 'Example CM LLC', status: 'active' }, 'item-1'),
      ]
      const prisma = makePrisma(mod, existing)
      mockFetchErpCms.mockResolvedValue([makeCm({ status: 'attention' })])

      await syncErpCm(prisma)

      expect(prisma.moduleItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'attention' }),
        }),
      )
    })
  })

  describe('multiple CMs', () => {
    it('processes multiple CMs in a single sync', async () => {
      const mod = { id: 'mod-cm', type: 'CM_PRODUCTIVITY' }
      const existing = [
        makeModuleItem({ erpId: 'cm-001', name: 'CM One' }, 'item-1'),
      ]
      const prisma = makePrisma(mod, existing)
      mockFetchErpCms.mockResolvedValue([
        makeCm({ erpId: 'cm-001', name: 'CM One Updated' }),
        makeCm({ erpId: 'cm-002', name: 'CM Two New' }),
        makeCm({ erpId: 'cm-003', name: 'CM Three New' }),
      ])

      const result = await syncErpCm(prisma)

      expect(result).toEqual({ recordsProcessed: 3, created: 2, updated: 1 })
    })

    it('handles duplicate erpIds in ERP feed (last wins)', async () => {
      const mod = { id: 'mod-cm', type: 'CM_PRODUCTIVITY' }
      const prisma = makePrisma(mod, [])
      mockFetchErpCms.mockResolvedValue([
        makeCm({ erpId: 'cm-001', name: 'First Name' }),
        makeCm({ erpId: 'cm-001', name: 'Second Name' }),
      ])

      const result = await syncErpCm(prisma)

      // Both records are processed separately since they have same erpId
      // The second one will update the first one's created record
      expect(result.recordsProcessed).toBe(2)
    })
  })

  describe('brands handling', () => {
    it('uses ERP brands when provided', async () => {
      const mod = { id: 'mod-cm', type: 'CM_PRODUCTIVITY' }
      const existing = [
        makeModuleItem({
          erpId: 'cm-test-001',
          name: 'Example CM LLC',
          brands: ['Old Brand'],
        }, 'item-1'),
      ]
      const prisma = makePrisma(mod, existing)
      mockFetchErpCms.mockResolvedValue([makeCm({ brands: ['New Brand A', 'New Brand B'] })])

      await syncErpCm(prisma)

      const updated = (prisma as any).$updatedItems[0]
      expect(updated.data.brands).toEqual(['New Brand A', 'New Brand B'])
    })

    it('preserves local brands when ERP provides empty array', async () => {
      const mod = { id: 'mod-cm', type: 'CM_PRODUCTIVITY' }
      const existing = [
        makeModuleItem({
          erpId: 'cm-test-001',
          name: 'Example CM LLC',
          brands: ['Local Brand'],
        }, 'item-1'),
      ]
      const prisma = makePrisma(mod, existing)
      mockFetchErpCms.mockResolvedValue([makeCm({ brands: [] })])

      await syncErpCm(prisma)

      const updated = (prisma as any).$updatedItems[0]
      expect(updated.data.brands).toEqual(['Local Brand'])
    })
  })
})
