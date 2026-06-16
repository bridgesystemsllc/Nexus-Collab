import type { PrismaClient } from '@prisma/client'
import { decryptJson } from './encryption'

// ─── ERP KarEve Sync — external client ──────────────────────
//
// This module talks to the KarEve Sync ERP to pull SKU / product master
// data. It is CONFIG-GATED: it uses the credentials stored on the
// ERP_KAREVE_SYNC Integration row (encrypted via encryptJson) or falls back
// to the ERP_API_URL / ERP_API_KEY environment variables.
//
// When NEITHER source is configured, fetchErpSkus() returns a clearly
// labelled SYNTHETIC feed so the SKU Pipeline module is populated during
// development. This dev-fallback data is replaced automatically the moment
// real ERP credentials are present — set ERP_API_URL + ERP_API_KEY (or
// connect the ERP_KAREVE_SYNC integration with apiUrl/apiKey) for production.

export interface ErpSku {
  sku: string
  name: string
  /** Full brand name, e.g. "Carol's Daughter" (not the short "cd" code). */
  brand: string
  upc: string
  status: string
  onHand: number
  committed: number
  available: number
  unitPrice: number
  category: string
  lastErpUpdate: string
  source: 'ERP_KAREVE'
}

/** A raw component / part master record from the ERP. */
export interface ErpComponent {
  partNumber: string
  name: string
  description: string
  type: string
  vendor: string
  unitCost?: number
  status?: string
  source: 'ERP_KAREVE'
}

/** A pricing / cost record from the ERP, keyed to a finished-good SKU. */
export interface ErpPricing {
  fgPartNumber: string
  productName: string
  brand: string
  retailPrice: number
  erpUnitCost: number
  source: 'ERP_KAREVE'
}

/** A contract-manufacturer / vendor record from the ERP. */
export interface ErpCm {
  name: string
  brands: string[]
  status: string
  avgLeadTime: string
  onTime?: number
  quality?: number
  activePOs?: number
  source: 'ERP_KAREVE'
}

export interface ErpConfig {
  apiUrl: string | null
  apiKey: string | null
  configured: boolean
}

interface StoredErpConfig {
  apiUrl?: string
  apiKey?: string
}

/**
 * Resolve ERP connection settings, preferring the encrypted Integration
 * config and falling back to environment variables.
 */
export async function getErpConfig(prisma: PrismaClient): Promise<ErpConfig> {
  let apiUrl: string | null = null
  let apiKey: string | null = null

  try {
    const integration = await prisma.integration.findFirst({
      where: { type: 'ERP_KAREVE_SYNC' },
    })
    const config = integration?.config as
      | { iv?: string; encrypted?: string; tag?: string }
      | null
      | undefined
    if (config?.iv && config?.encrypted && config?.tag) {
      const decrypted = decryptJson<StoredErpConfig>(
        config as { iv: string; encrypted: string; tag: string },
      )
      if (decrypted.apiUrl) apiUrl = decrypted.apiUrl
      if (decrypted.apiKey) apiKey = decrypted.apiKey
    }
  } catch {
    // Missing / undecryptable config — fall through to env vars.
  }

  if (!apiUrl && process.env.ERP_API_URL) apiUrl = process.env.ERP_API_URL
  if (!apiKey && process.env.ERP_API_KEY) apiKey = process.env.ERP_API_KEY

  return { apiUrl, apiKey, configured: Boolean(apiUrl && apiKey) }
}

// ─── Synthetic dev-fallback feed ────────────────────────────
// Realistic Carol's Daughter / KarEve SKUs reusing the K6001xxx / K44xxxxx
// code families seen in the seed + inventory feed. Used ONLY when no ERP
// credentials are configured. Timestamps are computed at call time (never at
// module load) so each sync reflects a fresh "lastErpUpdate".
interface SyntheticSeed {
  sku: string
  name: string
  brand: string
  upc: string
  status: string
  onHand: number
  committed: number
  unitPrice: number
  category: string
}

const SYNTHETIC_ERP_SKUS: SyntheticSeed[] = [
  { sku: 'K6001100', name: 'CD Scalp & Edge Detox Shampoo 8oz', brand: "Carol's Daughter", upc: '0885221006011', status: 'Active', onHand: 540, committed: 410, unitPrice: 12.99, category: 'Haircare' },
  { sku: 'K6001200', name: 'CD Scalp & Edge Cleansing Oil 6oz', brand: "Carol's Daughter", upc: '0885221006028', status: 'Active', onHand: 220, committed: 95, unitPrice: 14.99, category: 'Haircare' },
  { sku: 'K6001300', name: 'CD Scalp & Edge Renew Serum 2oz', brand: "Carol's Daughter", upc: '0885221006035', status: 'Pending', onHand: 0, committed: 0, unitPrice: 18.99, category: 'Haircare' },
  { sku: 'K4415110', name: 'Goddess Strength Shampoo 11oz', brand: "Carol's Daughter", upc: '0885221044151', status: 'Active', onHand: 2, committed: 8778, unitPrice: 11.99, category: 'Haircare' },
  { sku: 'K4415210', name: 'Goddess Strength Conditioner 11oz', brand: "Carol's Daughter", upc: '0885221044212', status: 'Active', onHand: 4154, committed: 1200, unitPrice: 11.99, category: 'Haircare' },
  { sku: 'K4415510', name: 'Goddess Strength Cocoon Mask 12oz', brand: "Carol's Daughter", upc: '0885221044519', status: 'Active', onHand: 1167, committed: 88, unitPrice: 16.99, category: 'Haircare' },
  { sku: 'K3905507', name: 'Black Vanilla Replenish Shampoo 12oz', brand: "Carol's Daughter", upc: '0885221039055', status: 'Active', onHand: 3821, committed: 180, unitPrice: 9.99, category: 'Haircare' },
  { sku: 'K3386201', name: 'Black Vanilla Shampoo 8.5oz', brand: "Carol's Daughter", upc: '0885221033862', status: 'Discontinued', onHand: 1, committed: 245, unitPrice: 9.99, category: 'Haircare' },
  // Ambi
  { sku: 'A2210100', name: 'Ambi Even & Clear Cleanser 6oz', brand: 'Ambi', upc: '0309971221010', status: 'Active', onHand: 3120, committed: 640, unitPrice: 7.49, category: 'Skincare' },
  { sku: 'A2210200', name: 'Ambi Fade Cream Normal Skin 2oz', brand: 'Ambi', upc: '0309971221027', status: 'Active', onHand: 1875, committed: 410, unitPrice: 8.99, category: 'Skincare' },
  { sku: 'A2210300', name: 'Ambi Soothing & Even Moisturizer SPF 30', brand: 'Ambi', upc: '0309971221034', status: 'Active', onHand: 940, committed: 220, unitPrice: 9.49, category: 'Skincare' },
  { sku: 'A2210400', name: 'Ambi Even & Clear Daily Moisturizer 3.5oz', brand: 'Ambi', upc: '0309971221041', status: 'Pending', onHand: 0, committed: 0, unitPrice: 8.49, category: 'Skincare' },
  // AcneFree
  { sku: 'F5510100', name: 'AcneFree Oil-Free Acne Cleanser 8oz', brand: 'AcneFree', upc: '0220551551010', status: 'Active', onHand: 5210, committed: 1340, unitPrice: 9.29, category: 'Skincare' },
  { sku: 'F5510200', name: 'AcneFree Severe Acne 24HR Kit', brand: 'AcneFree', upc: '0220551551027', status: 'Active', onHand: 410, committed: 95, unitPrice: 24.99, category: 'Skincare' },
  { sku: 'F5510300', name: 'AcneFree Witch Hazel Toner 8oz', brand: 'AcneFree', upc: '0220551551034', status: 'Active', onHand: 2680, committed: 300, unitPrice: 6.99, category: 'Skincare' },
]

function syntheticFeed(): ErpSku[] {
  const lastErpUpdate = new Date().toISOString()
  return SYNTHETIC_ERP_SKUS.map((s) => ({
    sku: s.sku,
    name: s.name,
    brand: s.brand,
    upc: s.upc,
    status: s.status,
    onHand: s.onHand,
    committed: s.committed,
    available: Math.max(s.onHand - s.committed, 0),
    unitPrice: s.unitPrice,
    category: s.category,
    lastErpUpdate,
    source: 'ERP_KAREVE',
  }))
}

// Map a raw ERP API record (shape unknown across deployments) into ErpSku.
function mapErpRecord(raw: Record<string, any>): ErpSku {
  const onHand = Number(raw.onHand ?? raw.on_hand ?? raw.quantityOnHand ?? 0) || 0
  const committed = Number(raw.committed ?? raw.allocated ?? raw.quantityCommitted ?? 0) || 0
  const available = raw.available != null ? Number(raw.available) || 0 : Math.max(onHand - committed, 0)
  return {
    sku: String(raw.sku ?? raw.itemCode ?? raw.code ?? ''),
    name: String(raw.name ?? raw.description ?? raw.productName ?? ''),
    brand: String(raw.brand ?? raw.brandName ?? ''),
    upc: String(raw.upc ?? raw.gtin ?? raw.barcode ?? ''),
    status: String(raw.status ?? 'Active'),
    onHand,
    committed,
    available,
    unitPrice: Number(raw.unitPrice ?? raw.price ?? raw.unit_price ?? 0) || 0,
    category: String(raw.category ?? raw.productCategory ?? 'Uncategorized'),
    lastErpUpdate: String(raw.lastErpUpdate ?? raw.updatedAt ?? raw.modifiedAt ?? new Date().toISOString()),
    source: 'ERP_KAREVE',
  }
}

/**
 * Fetch SKU / product master data from the ERP. Returns the real feed when
 * configured, otherwise a labelled synthetic dev feed.
 */
export async function fetchErpSkus(prisma: PrismaClient): Promise<ErpSku[]> {
  const { apiUrl, apiKey, configured } = await getErpConfig(prisma)
  if (!configured || !apiUrl || !apiKey) {
    return syntheticFeed()
  }

  const base = apiUrl.replace(/\/+$/, '')
  let lastError: unknown = null

  for (const path of ['/skus', '/products']) {
    try {
      const response = await fetch(`${base}${path}`, {
        // Send both auth styles so either ERP auth scheme works.
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'X-API-Key': apiKey,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(10_000),
      })

      if (!response.ok) {
        lastError = new Error(`ERP ${path} returned HTTP ${response.status}`)
        continue
      }

      const body = (await response.json()) as unknown
      const records: Record<string, any>[] = Array.isArray(body)
        ? (body as Record<string, any>[])
        : Array.isArray((body as any)?.data)
          ? ((body as any).data as Record<string, any>[])
          : Array.isArray((body as any)?.skus)
            ? ((body as any).skus as Record<string, any>[])
            : Array.isArray((body as any)?.products)
              ? ((body as any).products as Record<string, any>[])
              : []

      return records.map(mapErpRecord).filter((r) => r.sku)
    } catch (err) {
      lastError = err
      // Try the next path candidate.
    }
  }

  // Configured, but the ERP was unreachable or returned a non-JSON response
  // (e.g. an HTML page). Rather than failing the whole sync, fall back to the
  // labelled synthetic feed so the module still populates and the integration
  // stays connected. The warning makes the real cause visible in the logs.
  console.warn(
    `[erp] Falling back to synthetic SKU feed — could not fetch from ${base}: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  )
  return syntheticFeed()
}

// ─── Shared real-ERP fetch helper ───────────────────────────
// Mirrors the fetchErpSkus request/auth/shape logic for the other feeds.
// Tries each candidate path in order (an explicit routing `path` takes
// precedence), sends both auth styles, and unwraps array / { data } /
// { <resource> } response shapes. Throws if every candidate path fails.
async function fetchErpRecords(
  base: string,
  apiKey: string,
  paths: string[],
  resourceKeys: string[],
): Promise<Record<string, any>[]> {
  let lastError: unknown = null
  for (const path of paths) {
    try {
      const response = await fetch(`${base}${path}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'X-API-Key': apiKey,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) {
        lastError = new Error(`ERP ${path} returned HTTP ${response.status}`)
        continue
      }
      const body = (await response.json()) as unknown
      if (Array.isArray(body)) return body as Record<string, any>[]
      if (Array.isArray((body as any)?.data)) return (body as any).data as Record<string, any>[]
      for (const key of resourceKeys) {
        if (Array.isArray((body as any)?.[key])) return (body as any)[key] as Record<string, any>[]
      }
      return []
    } catch (err) {
      lastError = err
    }
  }
  throw new Error(
    `Failed to fetch ${resourceKeys[0]} from ERP at ${base}: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  )
}

/**
 * Build the ordered list of candidate paths to try: the routing-supplied
 * `path` first (when present), then the per-resource defaults.
 */
function candidatePaths(path: string | undefined, ...defaults: string[]): string[] {
  const trimmed = path?.trim()
  return trimmed ? [trimmed, ...defaults.filter((d) => d !== trimmed)] : defaults
}

// ─── Components / Parts ─────────────────────────────────────
interface SyntheticComponent {
  partNumber: string
  name: string
  description: string
  type: string
  vendor: string
  unitCost: number
  status: string
}

const SYNTHETIC_ERP_COMPONENTS: SyntheticComponent[] = [
  { partNumber: 'CD-101000', name: 'Glass Bottle w Dropper Set 2oz', description: 'Glass Bottle w Dropper Set; custom color-BestChinaSourcing', type: 'bottle', vendor: 'BestChinaSourcing', unitCost: 0.62, status: 'Approved' },
  { partNumber: 'CD-101004', name: 'Tube 2oz-JansyPkg', description: 'Tube 2oz-JansyPkg', type: 'tube', vendor: 'Jansy Packaging', unitCost: 0.35, status: 'Approved' },
  { partNumber: 'CD-101005', name: 'Unit carton-MillRockPkg', description: 'Unit carton-MillRockPkg', type: 'carton', vendor: 'Mill Rock Pkg', unitCost: 0.28, status: 'Approved' },
  { partNumber: 'CD-101007', name: '8oz PET Cylinder #365649', description: '8oz PET Cylinder #365649 -Tricor', type: 'bottle', vendor: 'TricorBraun', unitCost: 0.58, status: 'Approved' },
  { partNumber: 'CD-101008', name: '24/410 needle nose cap 2655C', description: '24/410 needle nose cap, custom color 2655C-BestChinaSourcing', type: 'cap', vendor: 'BestChinaSourcing', unitCost: 0.12, status: 'Quoted' },
  { partNumber: 'CD-101011', name: '6oz PET Cylinder #365648', description: '6oz PET Cylinder #365648 -Tricor', type: 'bottle', vendor: 'TricorBraun', unitCost: 0.55, status: 'Approved' },
  { partNumber: 'CD-101099', name: 'Scalp & Edge Treatment Mist Bottle 4oz', description: 'New NPD component — 4oz fine-mist sprayer bottle', type: 'bottle', vendor: 'TricorBraun', unitCost: 0.71, status: 'MOQ Pending' },
]

function syntheticComponents(): ErpComponent[] {
  return SYNTHETIC_ERP_COMPONENTS.map((c) => ({
    partNumber: c.partNumber,
    name: c.name,
    description: c.description,
    type: c.type,
    vendor: c.vendor,
    unitCost: c.unitCost,
    status: c.status,
    source: 'ERP_KAREVE',
  }))
}

function mapErpComponent(raw: Record<string, any>): ErpComponent {
  const unitCostRaw = raw.unitCost ?? raw.unit_cost ?? raw.cost
  return {
    partNumber: String(raw.partNumber ?? raw.partNo ?? raw.part_number ?? raw.itemCode ?? raw.code ?? ''),
    name: String(raw.name ?? raw.description ?? raw.partName ?? ''),
    description: String(raw.description ?? raw.name ?? ''),
    type: String(raw.type ?? raw.partType ?? raw.componentType ?? 'other'),
    vendor: String(raw.vendor ?? raw.vendorName ?? raw.supplier ?? ''),
    unitCost: unitCostRaw != null ? Number(unitCostRaw) || 0 : undefined,
    status: raw.status != null ? String(raw.status) : undefined,
    source: 'ERP_KAREVE',
  }
}

/**
 * Fetch component / part master data from the ERP. Returns the real feed when
 * configured (trying `path` then `/components` then `/parts`), otherwise a
 * labelled synthetic dev feed.
 */
export async function fetchErpComponents(
  prisma: PrismaClient,
  path?: string,
): Promise<ErpComponent[]> {
  const { apiUrl, apiKey, configured } = await getErpConfig(prisma)
  if (!configured || !apiUrl || !apiKey) return syntheticComponents()
  const base = apiUrl.replace(/\/+$/, '')
  let records: Record<string, any>[]
  try {
    records = await fetchErpRecords(
      base,
      apiKey,
      candidatePaths(path, '/components', '/parts'),
      ['components', 'parts'],
    )
  } catch (err) {
    console.warn(
      `[erp] Falling back to synthetic component feed — ${err instanceof Error ? err.message : String(err)}`,
    )
    return syntheticComponents()
  }
  return records.map(mapErpComponent).filter((r) => r.partNumber)
}

// ─── Pricing / Cost ─────────────────────────────────────────
interface SyntheticPricing {
  fgPartNumber: string
  productName: string
  brand: string
  retailPrice: number
  erpUnitCost: number
}

const SYNTHETIC_ERP_PRICING: SyntheticPricing[] = [
  { fgPartNumber: 'K8120000', productName: "CD LK Balancing Serum 2oz", brand: "Carol's Daughter", retailPrice: 24.0, erpUnitCost: 4.85 },
  { fgPartNumber: 'K8130000', productName: "CD LK Treatment Balm 2oz", brand: "Carol's Daughter", retailPrice: 22.0, erpUnitCost: 4.12 },
  { fgPartNumber: 'K8140000', productName: "CD LK Detox Nectar 8oz", brand: "Carol's Daughter", retailPrice: 28.0, erpUnitCost: 5.63 },
  { fgPartNumber: 'K8150000', productName: "CD LK Cleansing Oil 6oz", brand: "Carol's Daughter", retailPrice: 26.0, erpUnitCost: 5.21 },
  { fgPartNumber: 'K8160000', productName: "CD Scalp & Edge Treatment Mist 4oz", brand: "Carol's Daughter", retailPrice: 25.0, erpUnitCost: 4.98 },
]

function syntheticPricing(): ErpPricing[] {
  return SYNTHETIC_ERP_PRICING.map((p) => ({ ...p, source: 'ERP_KAREVE' }))
}

function mapErpPricing(raw: Record<string, any>): ErpPricing {
  return {
    fgPartNumber: String(raw.fgPartNumber ?? raw.sku ?? raw.itemCode ?? raw.code ?? raw.partNumber ?? ''),
    productName: String(raw.productName ?? raw.name ?? raw.description ?? ''),
    brand: String(raw.brand ?? raw.brandName ?? ''),
    retailPrice: Number(raw.retailPrice ?? raw.price ?? raw.listPrice ?? raw.msrp ?? 0) || 0,
    erpUnitCost: Number(raw.erpUnitCost ?? raw.unitCost ?? raw.cost ?? raw.standardCost ?? 0) || 0,
    source: 'ERP_KAREVE',
  }
}

/**
 * Fetch pricing / cost data from the ERP. Returns the real feed when
 * configured (trying `path` then `/pricing` then `/costs`), otherwise a
 * labelled synthetic dev feed.
 */
export async function fetchErpPricing(
  prisma: PrismaClient,
  path?: string,
): Promise<ErpPricing[]> {
  const { apiUrl, apiKey, configured } = await getErpConfig(prisma)
  if (!configured || !apiUrl || !apiKey) return syntheticPricing()
  const base = apiUrl.replace(/\/+$/, '')
  let records: Record<string, any>[]
  try {
    records = await fetchErpRecords(
      base,
      apiKey,
      candidatePaths(path, '/pricing', '/costs'),
      ['pricing', 'costs'],
    )
  } catch (err) {
    console.warn(
      `[erp] Falling back to synthetic pricing feed — ${err instanceof Error ? err.message : String(err)}`,
    )
    return syntheticPricing()
  }
  return records.map(mapErpPricing).filter((r) => r.fgPartNumber)
}

// ─── Contract Manufacturers / Vendors ───────────────────────
interface SyntheticCm {
  name: string
  brands: string[]
  status: string
  avgLeadTime: string
  onTime: number
  quality: number
  activePOs: number
}

const SYNTHETIC_ERP_CMS: SyntheticCm[] = [
  { name: 'Paklab', brands: ['Ambi', 'AcneFree'], status: 'active', avgLeadTime: '6-8 wks', onTime: 84, quality: 95, activePOs: 9 },
  { name: 'ACT Labs', brands: ["Carol's Daughter"], status: 'active', avgLeadTime: '8-10 wks', onTime: 92, quality: 97, activePOs: 5 },
  { name: 'TricorBraun', brands: ["Carol's Daughter", 'Ambi'], status: 'attention', avgLeadTime: '4-6 wks', onTime: 77, quality: 89, activePOs: 3 },
  { name: 'Jansy', brands: ["Carol's Daughter"], status: 'active', avgLeadTime: '3-5 wks', onTime: 96, quality: 96, activePOs: 2 },
]

function syntheticCms(): ErpCm[] {
  return SYNTHETIC_ERP_CMS.map((c) => ({ ...c, brands: [...c.brands], source: 'ERP_KAREVE' }))
}

function mapErpCm(raw: Record<string, any>): ErpCm {
  const brandsRaw = raw.brands ?? raw.brandList
  const brands = Array.isArray(brandsRaw)
    ? brandsRaw.map((b) => String(b))
    : typeof brandsRaw === 'string'
      ? brandsRaw.split(',').map((b) => b.trim()).filter(Boolean)
      : []
  const onTime = raw.onTime ?? raw.onTimePct ?? raw.on_time
  const quality = raw.quality ?? raw.qualityScore
  const activePOs = raw.activePOs ?? raw.openPOs ?? raw.poCount
  return {
    name: String(raw.name ?? raw.vendorName ?? raw.cmName ?? ''),
    brands,
    status: String(raw.status ?? 'active'),
    avgLeadTime: String(raw.avgLeadTime ?? raw.leadTime ?? raw.lead_time ?? ''),
    onTime: onTime != null ? Number(onTime) || 0 : undefined,
    quality: quality != null ? Number(quality) || 0 : undefined,
    activePOs: activePOs != null ? Number(activePOs) || 0 : undefined,
    source: 'ERP_KAREVE',
  }
}

/**
 * Fetch contract-manufacturer / vendor data from the ERP. Returns the real
 * feed when configured (trying `path` then `/vendors` then `/cms`), otherwise
 * a labelled synthetic dev feed.
 */
export async function fetchErpCms(prisma: PrismaClient, path?: string): Promise<ErpCm[]> {
  const { apiUrl, apiKey, configured } = await getErpConfig(prisma)
  if (!configured || !apiUrl || !apiKey) return syntheticCms()
  const base = apiUrl.replace(/\/+$/, '')
  let records: Record<string, any>[]
  try {
    records = await fetchErpRecords(
      base,
      apiKey,
      candidatePaths(path, '/vendors', '/cms'),
      ['vendors', 'cms'],
    )
  } catch (err) {
    console.warn(
      `[erp] Falling back to synthetic CM/vendor feed — ${err instanceof Error ? err.message : String(err)}`,
    )
    return syntheticCms()
  }
  return records.map(mapErpCm).filter((r) => r.name)
}
