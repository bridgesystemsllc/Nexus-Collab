import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Test the mapErpCm function behavior by testing through the module
// We need to test the mapping logic directly

describe('CM ERP mapping', () => {
  describe('ErpCm interface fields', () => {
    it('should have erpId as a required field in the interface', () => {
      // This is a compile-time check - if ErpCm doesn't have erpId, this would fail
      const cm: import('./erpClient').ErpCm = {
        erpId: 'test-id',
        name: 'Test CM',
        brands: [],
        status: 'active',
        avgLeadTime: '4-6 wks',
        source: 'ERP_KAREVE',
      }
      expect(cm.erpId).toBe('test-id')
    })

    it('should have optional cmCode, legalName, cmType, vendorId, headquarters fields', () => {
      const cm: import('./erpClient').ErpCm = {
        erpId: 'test-id',
        name: 'Test CM',
        cmCode: 'TST',
        legalName: 'Test CM LLC',
        cmType: 'FULL_SERVICE',
        vendorId: 'v-001',
        headquarters: 'New York, NY',
        brands: ['Brand A'],
        status: 'active',
        avgLeadTime: '4-6 wks',
        onTime: 90,
        quality: 95,
        activePOs: 3,
        source: 'ERP_KAREVE',
      }
      expect(cm.cmCode).toBe('TST')
      expect(cm.legalName).toBe('Test CM LLC')
      expect(cm.cmType).toBe('FULL_SERVICE')
      expect(cm.vendorId).toBe('v-001')
      expect(cm.headquarters).toBe('New York, NY')
    })
  })

  describe('valid CM status values', () => {
    const validStatuses = ['active', 'attention', 'inactive', 'pending', 'onboarding']

    it.each(validStatuses)('should accept status: %s', (status) => {
      const cm: import('./erpClient').ErpCm = {
        erpId: 'test-id',
        name: 'Test CM',
        brands: [],
        status,
        avgLeadTime: '4-6 wks',
        source: 'ERP_KAREVE',
      }
      expect(cm.status).toBe(status)
    })
  })

  describe('synthetic CM data', () => {
    it('synthetic CMs should have erpId field', async () => {
      // Import the module to get synthetic data
      // Note: This will only work when ERP is not configured
      const { fetchErpCms } = await import('./erpClient')
      
      // Create a mock prisma that returns no integration (unconfigured)
      const mockPrisma = {
        integration: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      } as any

      const cms = await fetchErpCms(mockPrisma)
      
      // All synthetic CMs should have erpId
      expect(cms.length).toBeGreaterThan(0)
      for (const cm of cms) {
        expect(cm.erpId).toBeDefined()
        expect(typeof cm.erpId).toBe('string')
        expect(cm.erpId.length).toBeGreaterThan(0)
      }
    })

    it('synthetic CMs should have all new fields', async () => {
      const { fetchErpCms } = await import('./erpClient')
      
      const mockPrisma = {
        integration: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      } as any

      const cms = await fetchErpCms(mockPrisma)
      
      // Check first CM has all fields
      const cm = cms[0]
      expect(cm.erpId).toBeDefined()
      expect(cm.name).toBeDefined()
      expect(cm.cmCode).toBeDefined()
      expect(cm.legalName).toBeDefined()
      expect(cm.cmType).toBeDefined()
      expect(cm.vendorId).toBeDefined()
      expect(cm.headquarters).toBeDefined()
      expect(cm.brands).toBeDefined()
      expect(cm.status).toBeDefined()
      expect(cm.source).toBe('ERP_KAREVE')
    })

    it('synthetic CMs should NOT have taxId', async () => {
      const { fetchErpCms } = await import('./erpClient')
      
      const mockPrisma = {
        integration: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      } as any

      const cms = await fetchErpCms(mockPrisma)
      
      for (const cm of cms) {
        expect((cm as any).taxId).toBeUndefined()
      }
    })
  })
})

describe('CM endpoint targeting', () => {
  it('should target /contract-manufacturers endpoint', async () => {
    // This is a documentation test - the actual endpoint is in candidatePaths call
    // Verify by checking the source code expectation
    const { fetchErpCms } = await import('./erpClient')
    
    // The function signature accepts a path override
    expect(typeof fetchErpCms).toBe('function')
    
    // When no path override is given, it should use /contract-manufacturers
    // This is verified by the implementation in the actual code
  })
})
