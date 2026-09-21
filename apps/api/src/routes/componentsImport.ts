import { Router, Request, Response } from 'express'
import { z } from 'zod'
import * as XLSX from 'xlsx'
import { prisma } from '../lib/prisma'
import { getActingOrgId } from '../middleware/billingContext'

export const componentsImportRoutes: ReturnType<typeof Router> = Router()

// ─── Template Headers (§3 - exact, no ACTIONS) ──────────────
const TEMPLATE_HEADERS = [
  'COMPONENT',
  'PART #',
  'TYPE',
  'BRANDS',
  'VENDOR',
  'STATUS',
  'ON HAND',
  'UNIT COST',
  'TARGET',
  'COMPATIBILITY',
  'ASSIGNED',
]

// ─── Valid Component Types ──────────────────────────────────
const VALID_COMPONENT_TYPES = [
  'Primary Packaging',
  'Secondary Packaging',
  'Closures',
  'Labels & Decoration',
  'Raw Materials',
  'Accessories',
  'Regulatory Components',
]

// ─── Valid Feasibility Statuses ─────────────────────────────
const VALID_STATUSES = [
  'Concept',
  'Feasibility Review',
  'Sampling',
  'Sample Testing',
  'Compatibility Testing',
  'Cost Negotiation',
  'Approved',
  'Conditionally Approved',
  'Active',
  'Discontinued',
  'On Hold',
  'Replaced',
]

// ─── Valid Compatibility Results ────────────────────────────
const VALID_COMPATIBILITY = ['pass', 'fail', 'conditional', 'not_tested', 'in_progress']

// ─── Row Schema ─────────────────────────────────────────────
const importRowSchema = z.object({
  COMPONENT: z.string().optional(),
  'PART #': z.union([z.string(), z.number()]).optional(),
  TYPE: z.string().optional(),
  BRANDS: z.string().optional(),
  VENDOR: z.string().optional(),
  STATUS: z.string().optional(),
  'ON HAND': z.union([z.string(), z.number()]).optional(),
  'UNIT COST': z.union([z.string(), z.number()]).optional(),
  TARGET: z.union([z.string(), z.number()]).optional(),
  COMPATIBILITY: z.string().optional(),
  ASSIGNED: z.string().optional(),
})

const importSchema = z.object({
  moduleId: z.string().min(1, 'moduleId is required'),
  rows: z.array(importRowSchema).min(1, 'At least one row is required'),
})

// ─── Helpers ────────────────────────────────────────────────
function parseNumber(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null
  const str = String(val).replace(/[$,]/g, '').trim()
  const n = parseFloat(str)
  return isNaN(n) ? null : n
}

function normalizeType(val: string | undefined): string {
  if (!val) return 'Primary Packaging'
  const lower = val.toLowerCase().trim()
  for (const t of VALID_COMPONENT_TYPES) {
    if (t.toLowerCase() === lower) return t
  }
  return 'Primary Packaging'
}

function normalizeStatus(val: string | undefined): string {
  if (!val) return 'Concept'
  const lower = val.toLowerCase().trim()
  for (const s of VALID_STATUSES) {
    if (s.toLowerCase() === lower) return s
  }
  return 'Concept'
}

function normalizeCompatibility(val: string | undefined): string | null {
  if (!val) return null
  const lower = val.toLowerCase().trim()
  if (VALID_COMPATIBILITY.includes(lower)) return lower
  if (lower === 'compatible') return 'pass'
  if (lower === 'incompatible') return 'fail'
  return null
}

function parseBrands(val: string | undefined): string[] {
  if (!val) return []
  return val
    .split(/[,;]/)
    .map((b) => b.trim())
    .filter(Boolean)
}

function parseAssigned(val: string | undefined): { productName: string; assignmentStatus: string }[] {
  if (!val) return []
  const parsed = parseNumber(val)
  if (parsed !== null && parsed > 0) {
    return Array.from({ length: Math.min(parsed, 10) }, (_, i) => ({
      productName: `Product ${i + 1}`,
      assignmentStatus: 'Active',
    }))
  }
  return val
    .split(/[,;]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((productName) => ({ productName, assignmentStatus: 'Active' }))
}

// ─── GET /api/v1/ops/components/import-template ─────────────
componentsImportRoutes.get('/import-template', async (_req: Request, res: Response) => {
  try {
    const wb = XLSX.utils.book_new()

    const data = [TEMPLATE_HEADERS]
    const sheet = XLSX.utils.aoa_to_sheet(data)

    sheet['!cols'] = [
      { wch: 30 }, // COMPONENT
      { wch: 18 }, // PART #
      { wch: 22 }, // TYPE
      { wch: 25 }, // BRANDS
      { wch: 25 }, // VENDOR
      { wch: 18 }, // STATUS
      { wch: 12 }, // ON HAND
      { wch: 12 }, // UNIT COST
      { wch: 12 }, // TARGET
      { wch: 16 }, // COMPATIBILITY
      { wch: 25 }, // ASSIGNED
    ]

    XLSX.utils.book_append_sheet(wb, sheet, 'Components')

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename="Components_Import_Template.xlsx"')
    res.send(buffer)
  } catch (error) {
    console.error('[componentsImport] GET /import-template error:', error)
    res.status(500).json({ error: 'Failed to generate template' })
  }
})

// ─── POST /api/v1/ops/components/import ─────────────────────
componentsImportRoutes.post('/import', async (req: Request, res: Response) => {
  try {
    const orgId = getActingOrgId(req)

    const parsed = importSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid request' })
    }

    const { moduleId, rows } = parsed.data

    // Verify module belongs to org and is COMPONENTS type
    const module = await prisma.departmentModule.findFirst({
      where: {
        id: moduleId,
        type: 'COMPONENTS',
        department: { orgId },
      },
      include: {
        items: true,
      },
    })

    if (!module) {
      return res.status(404).json({ error: 'Components module not found or does not belong to your organization' })
    }

    const results: { created: number; updated: number; errors: string[] } = {
      created: 0,
      updated: 0,
      errors: [],
    }

    // Build a map of existing components for upsert
    // Key: partNumber (preferred) or name+brands[0]
    const existingByPartNumber = new Map<string, { id: string; data: any }>()
    const existingByNameBrand = new Map<string, { id: string; data: any }>()

    for (const item of module.items) {
      const data = item.data as any
      if (data?.partNumber) {
        existingByPartNumber.set(String(data.partNumber).toLowerCase(), { id: item.id, data })
      }
      const name = data?.name || ''
      const brand = (data?.brands || [])[0] || ''
      if (name) {
        existingByNameBrand.set(`${name.toLowerCase()}|${brand.toLowerCase()}`, { id: item.id, data })
      }
    }

    // Track processed rows for duplicate handling (last write wins)
    const processedByPartNumber = new Map<string, number>()
    const processedByNameBrand = new Map<string, number>()

    // Pre-process rows to determine which one wins for duplicates
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const partNumber = row['PART #'] !== undefined && row['PART #'] !== '' ? String(row['PART #']).trim() : ''
      const name = (row.COMPONENT || '').trim()
      const brands = parseBrands(row.BRANDS)
      const brand = brands[0] || ''

      if (partNumber) {
        processedByPartNumber.set(partNumber.toLowerCase(), i)
      } else if (name) {
        processedByNameBrand.set(`${name.toLowerCase()}|${brand.toLowerCase()}`, i)
      }
    }

    // Fetch existing PartNumbers for auto-link (§7)
    const partNumberRecords = await prisma.partNumber.findMany({
      where: { orgId },
      select: { id: true, partsNumber: true, componentId: true },
    })
    const partNumberMap = new Map<string, { id: string; componentId: string | null }>()
    for (const pn of partNumberRecords) {
      partNumberMap.set(String(pn.partsNumber), { id: pn.id, componentId: pn.componentId })
    }

    // Process rows
    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        const rowNum = i + 2 // Excel row numbers are 1-indexed + header row

        try {
          const name = (row.COMPONENT || '').trim()
          const partNumber = row['PART #'] !== undefined && row['PART #'] !== '' ? String(row['PART #']).trim() : ''
          const type = normalizeType(row.TYPE)
          const brands = parseBrands(row.BRANDS)
          const vendorName = (row.VENDOR || '').trim()
          const status = normalizeStatus(row.STATUS)
          const quantityOnHand = parseNumber(row['ON HAND'])
          const unitCost = parseNumber(row['UNIT COST'])
          const targetCost = parseNumber(row.TARGET)
          const compatibility = normalizeCompatibility(row.COMPATIBILITY)
          const productAssignments = parseAssigned(row.ASSIGNED)

          // Must have name or partNumber to create/update
          if (!name && !partNumber) {
            results.errors.push(`Row ${rowNum}: Missing COMPONENT name or PART #`)
            continue
          }

          // Check for duplicates within file (last write wins)
          if (partNumber) {
            const lastIdx = processedByPartNumber.get(partNumber.toLowerCase())
            if (lastIdx !== undefined && lastIdx !== i) {
              continue // Skip, later row wins
            }
          } else if (name) {
            const key = `${name.toLowerCase()}|${(brands[0] || '').toLowerCase()}`
            const lastIdx = processedByNameBrand.get(key)
            if (lastIdx !== undefined && lastIdx !== i) {
              continue // Skip, later row wins
            }
          }

          // Build component data
          const componentData: any = {
            name: name || `Part ${partNumber}`,
            partNumber: partNumber || '',
            type,
            brands,
            status,
            vendors: vendorName ? [{ vendorName, vendorStatus: 'Primary' }] : [],
            moqTiers: unitCost !== null ? [{ unitCost, moqQuantity: 1, toolingCost: 0, sampleCost: 0, shippingCostPerUnit: 0, dutyRatePct: 0, totalLandedCost: unitCost, effectiveDate: '', expiryDate: '', quoteReference: '' }] : [],
            productAssignments,
            compatibilityTests: compatibility ? [{ status: compatibility, productName: '', formulaReference: '', testType: '', testDate: '', lab: '', testDuration: '', testProtocol: '', resultNotes: '', reportFileUrl: '', followUpRequired: false }] : [],
            targetCostPerUnit: targetCost ?? 0,
            quantityOnHand,
            quantityAvailable: quantityOnHand,
            quantityAllocated: 0,
          }

          // Find existing component by partNumber or name+brand
          let existingId: string | null = null
          let existingData: any = null

          if (partNumber) {
            const existing = existingByPartNumber.get(partNumber.toLowerCase())
            if (existing) {
              existingId = existing.id
              existingData = existing.data
            }
          }

          if (!existingId && name) {
            const key = `${name.toLowerCase()}|${(brands[0] || '').toLowerCase()}`
            const existing = existingByNameBrand.get(key)
            if (existing) {
              existingId = existing.id
              existingData = existing.data
            }
          }

          let componentItemId: string

          if (existingId) {
            // Update existing
            const mergedData = {
              ...existingData,
              ...componentData,
              // Preserve nested arrays if new ones are empty
              vendors: componentData.vendors.length > 0 ? componentData.vendors : existingData.vendors || [],
              moqTiers: componentData.moqTiers.length > 0 ? componentData.moqTiers : existingData.moqTiers || [],
              productAssignments: componentData.productAssignments.length > 0 ? componentData.productAssignments : existingData.productAssignments || [],
              compatibilityTests: componentData.compatibilityTests.length > 0 ? componentData.compatibilityTests : existingData.compatibilityTests || [],
            }

            await tx.moduleItem.update({
              where: { id: existingId },
              data: { data: mergedData as object, status: 'Active' },
            })
            componentItemId = existingId
            results.updated++
          } else {
            // Create new
            const newItem = await tx.moduleItem.create({
              data: {
                moduleId,
                data: componentData as object,
                status: 'Active',
              },
            })
            componentItemId = newItem.id
            results.created++

            // Update maps for subsequent rows
            if (partNumber) {
              existingByPartNumber.set(partNumber.toLowerCase(), { id: componentItemId, data: componentData })
            }
            if (name) {
              const key = `${name.toLowerCase()}|${(brands[0] || '').toLowerCase()}`
              existingByNameBrand.set(key, { id: componentItemId, data: componentData })
            }
          }

          // PartNumber auto-link (§7): if PART # matches org PartNumber.partsNumber → set componentId
          if (partNumber) {
            const pnRecord = partNumberMap.get(partNumber)
            if (pnRecord && !pnRecord.componentId) {
              await tx.partNumber.update({
                where: { id: pnRecord.id },
                data: { componentId: componentItemId },
              })
            }
          }
        } catch (rowErr: any) {
          results.errors.push(`Row ${rowNum}: ${rowErr?.message || 'Unknown error'}`)
        }
      }
    })

    res.json(results)
  } catch (error) {
    console.error('[componentsImport] POST /import error:', error)
    res.status(500).json({ error: 'Failed to import components' })
  }
})
