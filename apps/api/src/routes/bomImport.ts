import { Router, Request, Response } from 'express'
import { z } from 'zod'
import * as XLSX from 'xlsx'
import { prisma } from '../lib/prisma'
import { getActingOrgId } from '../middleware/billingContext'

export const bomImportRoutes: ReturnType<typeof Router> = Router()

type PartType = 'bulk' | 'bottle' | 'cap' | 'tube' | 'carton' | 'label' | 'shipper' | 'divider' | 'shrinkwrap' | 'other'
type BomStatus = 'draft' | 'active' | 'archived'

interface BomLine {
  lineNo: number
  componentId: string | null
  partNumber: string
  description: string
  um: string
  supplier: string
  partType: PartType
}

interface Bom {
  brand: string
  fgPartNumber: string
  productName: string
  fillClaim: string
  minFill: string
  fillerSupplier: string
  fillerName: string
  caseQty: number | null
  innerPack: string
  overUnderTolerance: string
  launchPriority: number | null
  status: BomStatus
  version: number
  lines: BomLine[]
}

const VALID_PART_TYPES: PartType[] = [
  'bulk', 'bottle', 'cap', 'tube', 'carton', 'label', 'shipper', 'divider', 'shrinkwrap', 'other',
]

const VALID_STATUSES = ['draft', 'active', 'archived'] as const

// ─── Template Headers (§5) ──────────────────────────────────
const BOM_HEADERS = [
  'FG Part Number',
  'Product Name',
  'Brand',
  'Fill Claim',
  'Min Fill',
  'Filler Supplier',
  'Filler Name',
  'Case Qty',
  'Inner Pack',
  'Over/Under Tolerance',
  'Launch Priority',
  'Status',
]

const LINE_HEADERS = [
  'FG Part Number',
  'Line No',
  'Part Number',
  'Description',
  'UM',
  'Supplier',
  'Part Type',
]

// ─── Row Schemas (§4) ───────────────────────────────────────
const bomHeaderRowSchema = z.object({
  'FG Part Number': z.string().min(1, 'FG Part Number is required'),
  'Product Name': z.string().optional().default(''),
  'Brand': z.string().optional().default("Carol's Daughter"),
  'Fill Claim': z.string().optional().default(''),
  'Min Fill': z.string().optional().default(''),
  'Filler Supplier': z.string().optional().default(''),
  'Filler Name': z.string().optional().default(''),
  'Case Qty': z.union([z.string(), z.number()]).optional(),
  'Inner Pack': z.string().optional().default(''),
  'Over/Under Tolerance': z.string().optional().default(''),
  'Launch Priority': z.union([z.string(), z.number()]).optional(),
  'Status': z.string().optional().default('draft'),
})

const bomLineRowSchema = z.object({
  'FG Part Number': z.string().min(1, 'FG Part Number is required'),
  'Line No': z.union([z.string(), z.number()]),
  'Part Number': z.string().optional().default(''),
  'Description': z.string().optional().default(''),
  'UM': z.string().optional().default('1'),
  'Supplier': z.string().optional().default(''),
  'Part Type': z.string().optional().default('other'),
})

export type BomHeaderRow = z.infer<typeof bomHeaderRowSchema>
export type BomLineRow = z.infer<typeof bomLineRowSchema>

const previewSchema = z.object({
  boms: z.array(z.record(z.any())),
  lines: z.array(z.record(z.any())),
})

const commitSchema = z.object({
  moduleId: z.string().min(1, 'moduleId is required'),
  boms: z.array(z.record(z.any())),
  lines: z.array(z.record(z.any())),
})

// ─── Helpers ────────────────────────────────────────────────
function parseNumber(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null
  const n = typeof val === 'number' ? val : parseFloat(String(val))
  return isNaN(n) ? null : n
}

function normalizePartType(val: string): PartType {
  const lower = val.toLowerCase().trim()
  if (VALID_PART_TYPES.includes(lower as PartType)) return lower as PartType
  return 'other'
}

function normalizeStatus(val: string): 'draft' | 'active' | 'archived' {
  const lower = val.toLowerCase().trim()
  if (VALID_STATUSES.includes(lower as any)) return lower as 'draft' | 'active' | 'archived'
  return 'draft'
}

interface ValidationError {
  row: number
  sheet: 'BOMs' | 'Lines'
  fgPartNumber?: string
  field?: string
  message: string
}

interface PreviewSummary {
  willCreate: number
  willUpdate: number
  matchedExisting: number
}

interface CommitError {
  fgPartNumber: string
  message: string
}

// ─── GET /api/v1/bom/import/template ────────────────────────
bomImportRoutes.get('/template', async (_req: Request, res: Response) => {
  try {
    const wb = XLSX.utils.book_new()

    // BOMs sheet with headers + example row
    const bomsData = [
      BOM_HEADERS,
      ['K8120000', 'LK Scalp Edge Balancing Serum 2oz', "Carol's Daughter", '2 FL OZ / 60mL', 'Legal fill claim', 'ACT', 'CD LK SCALP & EDGE BALANCING SERUM 2OZ', '12', '3 eaches per', '[+ or – 8%]', '1', 'draft'],
    ]
    const bomsSheet = XLSX.utils.aoa_to_sheet(bomsData)
    // Set column widths for readability
    bomsSheet['!cols'] = [
      { wch: 14 }, // FG Part Number
      { wch: 40 }, // Product Name
      { wch: 18 }, // Brand
      { wch: 18 }, // Fill Claim
      { wch: 18 }, // Min Fill
      { wch: 14 }, // Filler Supplier
      { wch: 45 }, // Filler Name
      { wch: 10 }, // Case Qty
      { wch: 14 }, // Inner Pack
      { wch: 18 }, // Over/Under Tolerance
      { wch: 14 }, // Launch Priority
      { wch: 10 }, // Status
    ]
    XLSX.utils.book_append_sheet(wb, bomsSheet, 'BOMs')

    // Lines sheet with headers + example rows
    const linesData = [
      LINE_HEADERS,
      ['K8120000', '1', 'ACT-BULK-001', 'CD LK SCALP & EDGE BALANCING SERUM 2OZ BULK', '1', 'ACT', 'bulk'],
      ['K8120000', '2', 'BTL-2OZ-CYL', '2oz PET Cylinder Bottle', '1', 'Berlin Packaging', 'bottle'],
      ['K8120000', '3', 'CAP-DISC-BLK', 'Disc Top Cap Black', '1', 'Berlin Packaging', 'cap'],
      ['K8120000', '4', 'LBL-CD-001', 'Label Front 2oz Serum', '1', 'Multi-Color Corp', 'label'],
      ['K8120000', '5', 'CTN-6PK', '6-Pack Carton', '1', 'International Paper', 'carton'],
    ]
    const linesSheet = XLSX.utils.aoa_to_sheet(linesData)
    linesSheet['!cols'] = [
      { wch: 14 }, // FG Part Number
      { wch: 8 },  // Line No
      { wch: 18 }, // Part Number
      { wch: 50 }, // Description
      { wch: 6 },  // UM
      { wch: 20 }, // Supplier
      { wch: 12 }, // Part Type
    ]
    XLSX.utils.book_append_sheet(wb, linesSheet, 'Lines')

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename="BOM_Import_Template.xlsx"')
    res.send(buffer)
  } catch (error) {
    console.error('[bomImport] GET /template error:', error)
    res.status(500).json({ error: 'Failed to generate template' })
  }
})

// ─── POST /api/v1/bom/import/preview ────────────────────────
bomImportRoutes.post('/preview', async (req: Request, res: Response) => {
  try {
    const orgId = getActingOrgId(req)

    const parsed = previewSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid request' })
    }

    const { boms: rawBoms, lines: rawLines } = parsed.data
    const errors: ValidationError[] = []
    const seenFgPartNumbers = new Set<string>()

    // Validate BOM header rows
    const validBoms: BomHeaderRow[] = []
    for (let i = 0; i < rawBoms.length; i++) {
      const row = rawBoms[i]
      const rowNum = i + 2 // Excel row numbers are 1-indexed + header row

      const result = bomHeaderRowSchema.safeParse(row)
      if (!result.success) {
        const firstError = result.error.errors[0]
        errors.push({
          row: rowNum,
          sheet: 'BOMs',
          fgPartNumber: row['FG Part Number'] || undefined,
          field: firstError?.path?.[0]?.toString(),
          message: firstError?.message || 'Invalid row',
        })
        continue
      }

      const fgPartNumber = result.data['FG Part Number']

      // Check for duplicate within same import
      if (seenFgPartNumbers.has(fgPartNumber)) {
        errors.push({
          row: rowNum,
          sheet: 'BOMs',
          fgPartNumber,
          message: `Duplicate FG Part Number "${fgPartNumber}" in import file`,
        })
        continue
      }
      seenFgPartNumbers.add(fgPartNumber)

      // Validate status
      const status = result.data['Status'] || 'draft'
      if (!VALID_STATUSES.includes(status.toLowerCase() as any)) {
        errors.push({
          row: rowNum,
          sheet: 'BOMs',
          fgPartNumber,
          field: 'Status',
          message: `Invalid status "${status}". Must be one of: draft, active, archived`,
        })
        continue
      }

      validBoms.push(result.data)
    }

    // Validate line rows
    const validLines: BomLineRow[] = []
    for (let i = 0; i < rawLines.length; i++) {
      const row = rawLines[i]
      const rowNum = i + 2

      const result = bomLineRowSchema.safeParse(row)
      if (!result.success) {
        const firstError = result.error.errors[0]
        errors.push({
          row: rowNum,
          sheet: 'Lines',
          fgPartNumber: row['FG Part Number'] || undefined,
          field: firstError?.path?.[0]?.toString(),
          message: firstError?.message || 'Invalid row',
        })
        continue
      }

      const fgPartNumber = result.data['FG Part Number']

      // Validate that FG Part Number exists in BOM headers
      if (!seenFgPartNumbers.has(fgPartNumber)) {
        errors.push({
          row: rowNum,
          sheet: 'Lines',
          fgPartNumber,
          message: `FG Part Number "${fgPartNumber}" not found in BOMs sheet`,
        })
        continue
      }

      // Validate part type
      const partType = result.data['Part Type'] || 'other'
      if (!VALID_PART_TYPES.includes(partType.toLowerCase() as PartType)) {
        errors.push({
          row: rowNum,
          sheet: 'Lines',
          fgPartNumber,
          field: 'Part Type',
          message: `Invalid part type "${partType}". Must be one of: ${VALID_PART_TYPES.join(', ')}`,
        })
        continue
      }

      validLines.push(result.data)
    }

    // Check which FG Part Numbers already exist in the org's BOM module
    const bomModule = await prisma.departmentModule.findFirst({
      where: {
        type: 'BILL_OF_MATERIALS',
        department: { orgId },
      },
      include: {
        items: true,
      },
    })

    const existingByFg = new Map<string, string>()
    if (bomModule) {
      for (const item of bomModule.items) {
        const data = item.data as any
        if (data?.fgPartNumber) {
          existingByFg.set(data.fgPartNumber, item.id)
        }
      }
    }

    // Calculate summary
    let willCreate = 0
    let willUpdate = 0
    let matchedExisting = 0

    for (const fg of seenFgPartNumbers) {
      if (existingByFg.has(fg)) {
        willUpdate++
        matchedExisting++
      } else {
        willCreate++
      }
    }

    const summary: PreviewSummary = {
      willCreate,
      willUpdate,
      matchedExisting,
    }

    res.json({
      valid: errors.length === 0,
      errors,
      summary,
    })
  } catch (error) {
    console.error('[bomImport] POST /preview error:', error)
    res.status(500).json({ error: 'Failed to validate import' })
  }
})

// ─── POST /api/v1/bom/import/commit ─────────────────────────
bomImportRoutes.post('/commit', async (req: Request, res: Response) => {
  try {
    const orgId = getActingOrgId(req)

    const parsed = commitSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid request' })
    }

    const { moduleId, boms: rawBoms, lines: rawLines } = parsed.data

    // Verify module belongs to org
    const bomModule = await prisma.departmentModule.findFirst({
      where: {
        id: moduleId,
        type: 'BILL_OF_MATERIALS',
        department: { orgId },
      },
      include: {
        items: true,
      },
    })

    if (!bomModule) {
      return res.status(404).json({ error: 'BOM module not found or does not belong to your organization' })
    }

    // Build map of existing items by fgPartNumber
    const existingByFg = new Map<string, { id: string; data: any }>()
    for (const item of bomModule.items) {
      const data = item.data as any
      if (data?.fgPartNumber) {
        existingByFg.set(data.fgPartNumber, { id: item.id, data })
      }
    }

    // Parse and validate BOMs
    const seenFgPartNumbers = new Set<string>()
    const validBoms: Array<{ row: BomHeaderRow; fgPartNumber: string }> = []
    const commitErrors: CommitError[] = []

    for (let i = 0; i < rawBoms.length; i++) {
      const row = rawBoms[i]
      const result = bomHeaderRowSchema.safeParse(row)

      if (!result.success) {
        commitErrors.push({
          fgPartNumber: row['FG Part Number'] || `Row ${i + 2}`,
          message: result.error.errors[0]?.message || 'Invalid row',
        })
        continue
      }

      const fgPartNumber = result.data['FG Part Number']

      if (seenFgPartNumbers.has(fgPartNumber)) {
        commitErrors.push({
          fgPartNumber,
          message: `Duplicate FG Part Number in import file`,
        })
        continue
      }
      seenFgPartNumbers.add(fgPartNumber)
      validBoms.push({ row: result.data, fgPartNumber })
    }

    // Group lines by FG Part Number
    const linesByFg = new Map<string, BomLineRow[]>()
    for (const rawLine of rawLines) {
      const result = bomLineRowSchema.safeParse(rawLine)
      if (!result.success) continue

      const fgPartNumber = result.data['FG Part Number']
      if (!seenFgPartNumbers.has(fgPartNumber)) continue

      if (!linesByFg.has(fgPartNumber)) {
        linesByFg.set(fgPartNumber, [])
      }
      linesByFg.get(fgPartNumber)!.push(result.data)
    }

    // Process each BOM
    let created = 0
    let updated = 0

    await prisma.$transaction(async (tx) => {
      for (const { row, fgPartNumber } of validBoms) {
        try {
          const bomLines = linesByFg.get(fgPartNumber) || []

          // Convert row data to Bom structure
          const lines: BomLine[] = bomLines
            .sort((a, b) => {
              const aNum = parseNumber(a['Line No']) ?? 0
              const bNum = parseNumber(b['Line No']) ?? 0
              return aNum - bNum
            })
            .map((lineRow, idx): BomLine => ({
              lineNo: parseNumber(lineRow['Line No']) ?? idx + 1,
              componentId: null,
              partNumber: String(lineRow['Part Number'] || ''),
              description: String(lineRow['Description'] || ''),
              um: String(lineRow['UM'] || '1'),
              supplier: String(lineRow['Supplier'] || ''),
              partType: normalizePartType(String(lineRow['Part Type'] || 'other')),
            }))

          const bomData: Bom = {
            brand: String(row['Brand'] || "Carol's Daughter"),
            fgPartNumber,
            productName: String(row['Product Name'] || ''),
            fillClaim: String(row['Fill Claim'] || ''),
            minFill: String(row['Min Fill'] || ''),
            fillerSupplier: String(row['Filler Supplier'] || ''),
            fillerName: String(row['Filler Name'] || ''),
            caseQty: parseNumber(row['Case Qty']),
            innerPack: String(row['Inner Pack'] || ''),
            overUnderTolerance: String(row['Over/Under Tolerance'] || ''),
            launchPriority: parseNumber(row['Launch Priority']),
            status: normalizeStatus(String(row['Status'] || 'draft')),
            version: 1,
            lines,
          }

          const existing = existingByFg.get(fgPartNumber)

          if (existing) {
            // Update existing BOM, preserving version and incrementing
            const existingVersion = existing.data?.version ?? 0
            await tx.moduleItem.update({
              where: { id: existing.id },
              data: {
                data: { ...bomData, version: existingVersion + 1 } as object,
                status: bomData.status,
              },
            })
            updated++
          } else {
            // Create new BOM
            await tx.moduleItem.create({
              data: {
                moduleId,
                data: bomData as object,
                status: bomData.status,
              },
            })
            created++
          }
        } catch (err: any) {
          commitErrors.push({
            fgPartNumber,
            message: err?.message || 'Unknown error',
          })
        }
      }
    })

    res.json({
      created,
      updated,
      errors: commitErrors,
    })
  } catch (error) {
    console.error('[bomImport] POST /commit error:', error)
    res.status(500).json({ error: 'Failed to commit import' })
  }
})
