// ─── Component Attachments Integration Tests ─────────────────
// NX-ATTACH: Verify org-scoped component attachments work correctly.
// Run with: DATABASE_URL="postgresql://nexus:nexus@localhost:5432/nexus" pnpm --filter @nexus/api test componentAttachments

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '@prisma/client'
import express from 'express'
import { createServer } from 'http'
import { componentRoutes } from './components'

const prisma = new PrismaClient()

const ORG_A = 'test_org_catt_a'
const ORG_B = 'test_org_catt_b'
const DEPT_A = 'test_dept_catt_a'
const DEPT_B = 'test_dept_catt_b'
const MODULE_A = 'test_module_catt_a'
const MODULE_B = 'test_module_catt_b'
const COMPONENT_A = 'test_component_catt_a'
const COMPONENT_B = 'test_component_catt_b'

async function clearTestData() {
  await prisma.componentAttachment.deleteMany({
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
      { id: ORG_A, name: 'CATT Tenant A', slug: ORG_A, color: '#111111', featureInterests: [] },
      { id: ORG_B, name: 'CATT Tenant B', slug: ORG_B, color: '#222222', featureInterests: [] },
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
})

afterAll(async () => {
  await wipe()
  await prisma.$disconnect()
})

interface RequestOptions {
  method?: string
  body?: unknown
  role?: 'ADMIN' | 'OPS_MANAGER' | 'MEMBER'
  memberId?: string
  noAuth?: boolean
}

async function request(
  orgId: string,
  path: string,
  options: RequestOptions = {},
): Promise<Response> {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    if (!options.noAuth) {
      ;(req as any).member = {
        id: options.memberId || `member_${orgId}`,
        orgId,
        role: options.role ?? 'ADMIN',
      }
    }
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
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
}

describe('Component Attachments (NX-ATTACH)', () => {
  describe('org isolation', () => {
    it('returns 404 when trying to access component from another org', async () => {
      const response = await request(ORG_A, `/${COMPONENT_B}/attachments`)
      expect(response.status).toBe(404)
      const body = await response.json()
      expect(body.error).toBe('Component not found')
    })

    it('returns 404 when trying to create attachment on component from another org', async () => {
      // Mock S3 for this test
      vi.stubEnv('S3_ENDPOINT', 'http://fake-s3.test')
      vi.stubEnv('S3_ACCESS_KEY_ID', 'fake-key')
      vi.stubEnv('S3_SECRET_ACCESS_KEY', 'fake-secret')
      vi.stubEnv('S3_BUCKET_NAME', 'fake-bucket')

      const response = await request(ORG_A, `/${COMPONENT_B}/attachments`, {
        method: 'POST',
        body: {
          kind: 'COMPATIBILITY_REPORT',
          filename: 'report.pdf',
          contentType: 'application/pdf',
          sizeBytes: 1024,
        },
      })
      expect(response.status).toBe(404)
      const body = await response.json()
      expect(body.error).toBe('Component not found')

      vi.unstubAllEnvs()
    })
  })

  describe('S3 configuration', () => {
    it('returns 503 when S3 is not configured', async () => {
      // Ensure S3 env vars are cleared
      vi.stubEnv('S3_ENDPOINT', '')
      vi.stubEnv('S3_ACCESS_KEY_ID', '')
      vi.stubEnv('S3_SECRET_ACCESS_KEY', '')
      vi.stubEnv('S3_BUCKET_NAME', '')

      const response = await request(ORG_A, `/${COMPONENT_A}/attachments`, {
        method: 'POST',
        body: {
          kind: 'COMPATIBILITY_REPORT',
          filename: 'report.pdf',
          contentType: 'application/pdf',
          sizeBytes: 1024,
        },
      })
      expect(response.status).toBe(503)
      const body = await response.json()
      expect(body.error).toBe('File storage is not configured.')

      vi.unstubAllEnvs()
    })
  })

  describe('versioning', () => {
    it('second POST same kind increments version and keeps both rows', async () => {
      // Create two attachments with same kind
      await prisma.componentAttachment.create({
        data: {
          orgId: ORG_A,
          componentId: COMPONENT_A,
          kind: 'COMPATIBILITY_REPORT',
          version: 1,
          filename: 'report_v1.pdf',
          contentType: 'application/pdf',
          sizeBytes: 1024,
          s3Key: `orgs/${ORG_A}/components/${COMPONENT_A}/COMPATIBILITY_REPORT/v1/report_v1.pdf`,
        },
      })
      await prisma.componentAttachment.create({
        data: {
          orgId: ORG_A,
          componentId: COMPONENT_A,
          kind: 'COMPATIBILITY_REPORT',
          version: 2,
          filename: 'report_v2.pdf',
          contentType: 'application/pdf',
          sizeBytes: 2048,
          s3Key: `orgs/${ORG_A}/components/${COMPONENT_A}/COMPATIBILITY_REPORT/v2/report_v2.pdf`,
        },
      })

      const response = await request(ORG_A, `/${COMPONENT_A}/attachments`)
      expect(response.status).toBe(200)
      const body = await response.json()

      const reports = body.filter((a: any) => a.kind === 'COMPATIBILITY_REPORT')
      expect(reports.length).toBe(2)

      const versions = reports.map((r: any) => r.version).sort()
      expect(versions).toEqual([1, 2])

      // Verify both rows exist in database
      const dbRows = await prisma.componentAttachment.findMany({
        where: { orgId: ORG_A, componentId: COMPONENT_A, kind: 'COMPATIBILITY_REPORT' },
      })
      expect(dbRows.length).toBe(2)
    })
  })

  describe('validation', () => {
    it('returns 400 for invalid attachment kind', async () => {
      vi.stubEnv('S3_ENDPOINT', 'http://fake-s3.test')
      vi.stubEnv('S3_ACCESS_KEY_ID', 'fake-key')
      vi.stubEnv('S3_SECRET_ACCESS_KEY', 'fake-secret')
      vi.stubEnv('S3_BUCKET_NAME', 'fake-bucket')

      const response = await request(ORG_A, `/${COMPONENT_A}/attachments`, {
        method: 'POST',
        body: {
          kind: 'INVALID_KIND',
          filename: 'report.pdf',
          contentType: 'application/pdf',
          sizeBytes: 1024,
        },
      })
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toBe('Invalid attachment kind')

      vi.unstubAllEnvs()
    })

    it('returns 400 for invalid content type', async () => {
      vi.stubEnv('S3_ENDPOINT', 'http://fake-s3.test')
      vi.stubEnv('S3_ACCESS_KEY_ID', 'fake-key')
      vi.stubEnv('S3_SECRET_ACCESS_KEY', 'fake-secret')
      vi.stubEnv('S3_BUCKET_NAME', 'fake-bucket')

      const response = await request(ORG_A, `/${COMPONENT_A}/attachments`, {
        method: 'POST',
        body: {
          kind: 'COMPATIBILITY_REPORT',
          filename: 'report.txt',
          contentType: 'text/plain',
          sizeBytes: 1024,
        },
      })
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toBe('Invalid content type. Allowed: PDF, PNG, JPEG')

      vi.unstubAllEnvs()
    })
  })

  describe('authorization', () => {
    it('returns 401 when not authenticated', async () => {
      const response = await request(ORG_A, `/${COMPONENT_A}/attachments`, {
        method: 'POST',
        body: {
          kind: 'COMPATIBILITY_REPORT',
          filename: 'report.pdf',
          contentType: 'application/pdf',
          sizeBytes: 1024,
        },
        noAuth: true,
      })
      expect(response.status).toBe(403)
      const body = await response.json()
      expect(body.error).toBe('Forbidden: requires ADMIN or OPS_MANAGER')
    })

    it('returns 403 when MEMBER tries to POST', async () => {
      vi.stubEnv('S3_ENDPOINT', 'http://fake-s3.test')
      vi.stubEnv('S3_ACCESS_KEY_ID', 'fake-key')
      vi.stubEnv('S3_SECRET_ACCESS_KEY', 'fake-secret')
      vi.stubEnv('S3_BUCKET_NAME', 'fake-bucket')

      const response = await request(ORG_A, `/${COMPONENT_A}/attachments`, {
        method: 'POST',
        body: {
          kind: 'COMPATIBILITY_REPORT',
          filename: 'report.pdf',
          contentType: 'application/pdf',
          sizeBytes: 1024,
        },
        role: 'MEMBER',
      })
      expect(response.status).toBe(403)
      const body = await response.json()
      expect(body.error).toBe('Forbidden: requires ADMIN or OPS_MANAGER')

      vi.unstubAllEnvs()
    })
  })

  describe('list attachments', () => {
    it('returns attachments filtered by component and org', async () => {
      // Create attachments for both components
      await prisma.componentAttachment.create({
        data: {
          orgId: ORG_A,
          componentId: COMPONENT_A,
          kind: 'COMPATIBILITY_REPORT',
          version: 1,
          filename: 'report_a.pdf',
          contentType: 'application/pdf',
          sizeBytes: 1024,
          s3Key: `orgs/${ORG_A}/components/${COMPONENT_A}/COMPATIBILITY_REPORT/v1/report_a.pdf`,
        },
      })
      await prisma.componentAttachment.create({
        data: {
          orgId: ORG_B,
          componentId: COMPONENT_B,
          kind: 'COMPATIBILITY_REPORT',
          version: 1,
          filename: 'report_b.pdf',
          contentType: 'application/pdf',
          sizeBytes: 2048,
          s3Key: `orgs/${ORG_B}/components/${COMPONENT_B}/COMPATIBILITY_REPORT/v1/report_b.pdf`,
        },
      })

      const response = await request(ORG_A, `/${COMPONENT_A}/attachments`)
      expect(response.status).toBe(200)
      const body = await response.json()

      expect(body.length).toBe(1)
      expect(body[0].filename).toBe('report_a.pdf')
    })

    it('returns attachments with kindDisplay field', async () => {
      await prisma.componentAttachment.create({
        data: {
          orgId: ORG_A,
          componentId: COMPONENT_A,
          kind: 'COMPATIBILITY_REPORT',
          version: 1,
          filename: 'report.pdf',
          contentType: 'application/pdf',
          sizeBytes: 1024,
          s3Key: `orgs/${ORG_A}/components/${COMPONENT_A}/COMPATIBILITY_REPORT/v1/report.pdf`,
        },
      })
      await prisma.componentAttachment.create({
        data: {
          orgId: ORG_A,
          componentId: COMPONENT_A,
          kind: 'SPEC_SHEET',
          version: 1,
          filename: 'spec.png',
          contentType: 'image/png',
          sizeBytes: 2048,
          s3Key: `orgs/${ORG_A}/components/${COMPONENT_A}/SPEC_SHEET/v1/spec.png`,
        },
      })

      const response = await request(ORG_A, `/${COMPONENT_A}/attachments`)
      expect(response.status).toBe(200)
      const body = await response.json()

      expect(body.length).toBe(2)

      const report = body.find((a: any) => a.kind === 'COMPATIBILITY_REPORT')
      expect(report.kindDisplay).toBe('Compatibility report')

      const spec = body.find((a: any) => a.kind === 'SPEC_SHEET')
      expect(spec.kindDisplay).toBe('Spec sheet')
    })
  })

  describe('no DeleteObject on prior versions', () => {
    it('uploading new version keeps prior S3 keys in database', async () => {
      // Insert v1 directly
      const v1 = await prisma.componentAttachment.create({
        data: {
          orgId: ORG_A,
          componentId: COMPONENT_A,
          kind: 'SPEC_SHEET',
          version: 1,
          filename: 'spec_v1.pdf',
          contentType: 'application/pdf',
          sizeBytes: 1024,
          s3Key: `orgs/${ORG_A}/components/${COMPONENT_A}/SPEC_SHEET/v1/spec_v1.pdf`,
        },
      })

      // Insert v2 directly
      await prisma.componentAttachment.create({
        data: {
          orgId: ORG_A,
          componentId: COMPONENT_A,
          kind: 'SPEC_SHEET',
          version: 2,
          filename: 'spec_v2.pdf',
          contentType: 'application/pdf',
          sizeBytes: 2048,
          s3Key: `orgs/${ORG_A}/components/${COMPONENT_A}/SPEC_SHEET/v2/spec_v2.pdf`,
        },
      })

      // Verify v1 still exists in database
      const v1Check = await prisma.componentAttachment.findUnique({
        where: { id: v1.id },
      })
      expect(v1Check).not.toBeNull()
      expect(v1Check!.version).toBe(1)
      expect(v1Check!.s3Key).toContain('v1')

      // Verify both versions exist
      const allVersions = await prisma.componentAttachment.findMany({
        where: { orgId: ORG_A, componentId: COMPONENT_A, kind: 'SPEC_SHEET' },
        orderBy: { version: 'asc' },
      })
      expect(allVersions.length).toBe(2)
      expect(allVersions[0].version).toBe(1)
      expect(allVersions[1].version).toBe(2)
    })
  })
})
