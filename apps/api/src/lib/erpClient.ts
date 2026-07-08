import type { PrismaClient } from '@prisma/client'
import { decryptJson } from './encryption'
import { mapErpOpenOrder, type ErpOpenOrder } from './erpOpenOrders'

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

/** A raw inventory / stock-level record from the ERP. */
export interface ErpInventory {
  sku: string
  name: string
  /** Full brand name resolved from the ERP brandId (may be blank if unknown). */
  brand: string
  onHand: number
  committed: number
  available: number
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

/**
 * Build the ordered list of base URLs to try for a configured ERP. Many ERP
 * deployments expose their data API under an `/api/v1` prefix, but users often
 * paste just the host (e.g. `https://erp.example.com`). We try the URL exactly
 * as given first, then with `/api/v1` appended, so either form connects without
 * forcing the user to know the exact prefix.
 */
export function erpBaseCandidates(apiUrl: string): string[] {
  const base = apiUrl.replace(/\/+$/, '')
  const candidates = [base]
  if (!/\/api\/v\d+$/.test(base)) candidates.push(`${base}/api/v1`)
  return candidates
}

/**
 * True when a response body is actually JSON we can use. Some servers return
 * their SPA's `index.html` with HTTP 200 for unknown routes; that must NOT be
 * mistaken for a successful data fetch.
 */
export function looksLikeJson(contentType: string | null, body: string): boolean {
  if (contentType && contentType.toLowerCase().includes('application/json')) return true
  const trimmed = body.trimStart()
  return trimmed.startsWith('{') || trimmed.startsWith('[')
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

// The KarEve Sync ERP references a product's brand only by numeric `brandId`
// and exposes no brand-list / lookup endpoint (and no `include`/`expand` for
// it), so the brand name cannot be fetched at runtime. This curated map turns
// the ERP's brand ids into their real display names. Update it if Kareve adds
// or renumbers brands in the ERP.
const ERP_BRAND_NAMES: Record<string, string> = {
  '1': "Carol's Daughter",
  '2': 'Baxter of California',
  '3': 'AcneFree',
  '4': 'Ambi',
  '5': 'Dermablend',
}

/** Resolve a brand display name, preferring an ERP-supplied name, then the
 * curated brandId map, else empty. */
function resolveBrand(raw: Record<string, any>): string {
  const named = raw.brand ?? raw.brandName
  if (named != null && String(named).trim() !== '') return String(named)
  if (raw.brandId != null) {
    const mapped = ERP_BRAND_NAMES[String(raw.brandId)]
    if (mapped) return mapped
  }
  return ''
}

// Map a raw ERP API record (shape varies across deployments) into ErpSku.
// Field aliases cover the KarEve Sync ERP shape (skuNumber/itemName/quantity/
// quantityAvailable/quantityAllocated/unitUpc) as well as common alternates.
function mapErpRecord(raw: Record<string, any>): ErpSku {
  const onHand =
    Number(raw.onHand ?? raw.on_hand ?? raw.quantityOnHand ?? raw.quantity ?? 0) || 0
  const committed =
    Number(raw.committed ?? raw.allocated ?? raw.quantityCommitted ?? raw.quantityAllocated ?? 0) || 0
  const available =
    raw.available != null
      ? Number(raw.available) || 0
      : raw.quantityAvailable != null
        ? Number(raw.quantityAvailable) || 0
        : Math.max(onHand - committed, 0)
  return {
    sku: String(raw.sku ?? raw.skuNumber ?? raw.sellableSku ?? raw.shopifySku ?? raw.itemCode ?? raw.code ?? ''),
    name: String(raw.name ?? raw.itemName ?? raw.description ?? raw.productName ?? ''),
    brand: resolveBrand(raw),
    upc: String(raw.upc ?? raw.unitUpc ?? raw.sellableUpc ?? raw.gtin ?? raw.barcode ?? ''),
    status: String(raw.status ?? (raw.isActive === false ? 'Inactive' : 'Active')),
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

  // Configured → REAL data only. On failure (unreachable, unauthorized,
  // HTML/non-JSON, or zero usable records) we THROW rather than fall back to
  // synthetic. The sync orchestrator (syncErp) isolates and logs the failed
  // feed, so a live ERP outage never silently overwrites real data with
  // sample values. Synthetic is reserved for the unconfigured dev case above.
  const records = await fetchErpRecords(
    apiUrl,
    apiKey,
    ['/products', '/inventory', '/skus'],
    ['products', 'inventory', 'skus'],
  )
  // The SKU pipeline mirrors the ERP's ACTIVE catalog only — drop records the
  // ERP flags inactive/discontinued (isActive === false or a matching status).
  const active = records.filter((r) => {
    if (r.isActive === false) return false
    const status = String(r.status ?? '').toLowerCase()
    return status !== 'inactive' && status !== 'discontinued'
  })
  const mapped = active.map(mapErpRecord).filter((r) => r.sku)
  if (mapped.length === 0) {
    throw new Error('ERP returned no usable SKU records')
  }
  return mapped
}

// Page size requested per ERP page. The KarEve ERP caps page size at 100, so
// asking for more still returns 100; we then walk the remaining pages.
const ERP_PAGE_LIMIT = 100
// Hard ceiling on pages walked, so a misreported `total` can never loop forever.
const ERP_MAX_PAGES = 1000

/** Pull the record array out of the various envelope shapes ERPs use. */
function extractRecords(body: unknown, resourceKeys: string[]): Record<string, any>[] | null {
  if (Array.isArray(body)) return body as Record<string, any>[]
  if (Array.isArray((body as any)?.data)) return (body as any).data as Record<string, any>[]
  for (const key of resourceKeys) {
    if (Array.isArray((body as any)?.[key])) return (body as any)[key] as Record<string, any>[]
  }
  return null
}

/** Read the advertised total record count from a paginated envelope, if any. */
function extractTotal(body: unknown): number | null {
  const meta = (body as any)?.meta ?? body
  const total = Number(meta?.total ?? meta?.totalCount ?? meta?.count)
  return Number.isFinite(total) && total > 0 ? total : null
}

/** Append `page`/`limit` query params, respecting any existing query string. */
function withPage(url: string, page: number, limit: number): string {
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}page=${page}&limit=${limit}`
}

// ─── Shared real-ERP fetch helper ───────────────────────────
// Tries each base candidate (the URL as given, then with /api/v1 appended) ×
// each candidate path in order (an explicit routing `path` takes precedence),
// sends both auth styles, rejects HTML/non-JSON responses (an SPA index.html
// returned for unknown routes), and unwraps array / { data } / { <resource> }
// shapes. Once a working endpoint is found it walks ALL pages (using the
// `meta.total` advertised by the ERP) so the full catalog is returned, not just
// the first page. Throws if every candidate fails.
async function fetchErpRecords(
  apiUrl: string,
  apiKey: string,
  paths: string[],
  resourceKeys: string[],
): Promise<Record<string, any>[]> {
  let lastError: unknown = null
  // Send both auth styles so either ERP auth scheme works.
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'X-API-Key': apiKey,
    Accept: 'application/json',
  }
  for (const base of erpBaseCandidates(apiUrl)) {
    for (const path of paths) {
      try {
        const url = `${base}${path}`
        const response = await fetch(withPage(url, 1, ERP_PAGE_LIMIT), {
          headers,
          signal: AbortSignal.timeout(10_000),
        })
        if (!response.ok) {
          lastError = new Error(`ERP ${url} returned HTTP ${response.status}`)
          continue
        }
        const raw = await response.text()
        if (!looksLikeJson(response.headers.get('content-type'), raw)) {
          lastError = new Error(`ERP ${url} returned a non-JSON response`)
          continue
        }
        const body = JSON.parse(raw) as unknown
        const firstRecords = extractRecords(body, resourceKeys)
        if (firstRecords == null) {
          lastError = new Error(`ERP ${url} returned an unrecognized JSON shape`)
          continue
        }

        // Working endpoint found. Walk remaining pages if the ERP advertises a
        // larger total than this page returned.
        const all = [...firstRecords]
        const total = extractTotal(body)
        const perPage = firstRecords.length
        if (total != null && perPage > 0 && total > perPage) {
          const pages = Math.min(Math.ceil(total / perPage), ERP_MAX_PAGES)
          for (let page = 2; page <= pages; page++) {
            const resp = await fetch(withPage(url, page, perPage), {
              headers,
              signal: AbortSignal.timeout(10_000),
            })
            // A mid-pagination transport failure must THROW, not break: page 1
            // already proved this endpoint works, so a later HTTP/non-JSON error
            // is a real fault. Returning here would silently persist a partial
            // catalog over real data. The throw propagates to syncErp's per-feed
            // try/catch, which isolates + logs the feed and leaves prior data.
            if (!resp.ok) {
              throw new Error(`ERP ${url} page ${page} returned HTTP ${resp.status}`)
            }
            const text = await resp.text()
            if (!looksLikeJson(resp.headers.get('content-type'), text)) {
              throw new Error(`ERP ${url} page ${page} returned a non-JSON response`)
            }
            const pageRecords = extractRecords(JSON.parse(text), resourceKeys)
            // An empty/exhausted page is a legitimate end (e.g. a stale `total`),
            // so stop without error.
            if (!pageRecords || pageRecords.length === 0) break
            all.push(...pageRecords)
            if (all.length >= total) break
          }
        }
        return all
      } catch (err) {
        lastError = err
      }
    }
  }
  throw new Error(
    `Failed to fetch ${resourceKeys[0]} from ERP at ${apiUrl}: ${
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

// ─── Inventory / Stock levels ───────────────────────────────
// The ERP inventory feed reuses the product/inventory endpoints' quantity
// fields. Same dev-fallback contract as the SKU feed: real data when
// configured, otherwise a labelled synthetic snapshot.
function syntheticInventory(): ErpInventory[] {
  return SYNTHETIC_ERP_SKUS.map((s) => ({
    sku: s.sku,
    name: s.name,
    brand: (s as any).brand ?? '',
    onHand: s.onHand,
    committed: s.committed,
    available: Math.max(s.onHand - s.committed, 0),
    source: 'ERP_KAREVE',
  }))
}

function mapErpInventory(raw: Record<string, any>): ErpInventory {
  const onHand =
    Number(raw.onHand ?? raw.on_hand ?? raw.quantityOnHand ?? raw.quantity ?? 0) || 0
  const committed =
    Number(raw.committed ?? raw.allocated ?? raw.quantityCommitted ?? raw.quantityAllocated ?? 0) || 0
  const available =
    raw.available != null
      ? Number(raw.available) || 0
      : raw.quantityAvailable != null
        ? Number(raw.quantityAvailable) || 0
        : Math.max(onHand - committed, 0)
  return {
    sku: String(raw.sku ?? raw.skuNumber ?? raw.sellableSku ?? raw.itemCode ?? raw.code ?? ''),
    name: String(raw.name ?? raw.itemName ?? raw.description ?? raw.productName ?? ''),
    brand: resolveBrand(raw),
    onHand,
    committed,
    available,
    source: 'ERP_KAREVE',
  }
}

/**
 * Fetch inventory / stock-level data from the ERP. Returns the real feed when
 * configured (trying `path` then `/inventory` then `/products`), otherwise a
 * labelled synthetic dev feed. Falls back to synthetic on any fetch error or
 * when the ERP returns zero usable records.
 */
export async function fetchErpInventory(
  prisma: PrismaClient,
  path?: string,
): Promise<ErpInventory[]> {
  const { apiUrl, apiKey, configured } = await getErpConfig(prisma)
  if (!configured || !apiUrl || !apiKey) return syntheticInventory()
  // Configured → REAL data only: throw on failure or zero usable records so the
  // sync orchestrator isolates/logs it instead of writing synthetic stock.
  const records = await fetchErpRecords(
    apiUrl,
    apiKey,
    candidatePaths(path, '/inventory', '/products'),
    ['inventory', 'products'],
  )
  const mapped = records.map(mapErpInventory).filter((r) => r.sku)
  if (mapped.length === 0) {
    throw new Error('ERP returned no usable inventory records')
  }
  return mapped
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
  // Configured → REAL data only: throw on failure so the sync orchestrator
  // isolates/logs it instead of writing synthetic components.
  const records = await fetchErpRecords(
    apiUrl,
    apiKey,
    candidatePaths(path, '/components', '/parts'),
    ['components', 'parts'],
  )
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
  // Configured → REAL data only: throw on failure so the sync orchestrator
  // isolates/logs it instead of writing synthetic pricing.
  const records = await fetchErpRecords(
    apiUrl,
    apiKey,
    candidatePaths(path, '/pricing', '/costs'),
    ['pricing', 'costs'],
  )
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
  // CMs that exist in the ERP but not yet in Nexus — these get created on sync.
  { name: 'Kolmar Korea', brands: ['Ambi', "Carol's Daughter"], status: 'active', avgLeadTime: '10-12 wks', onTime: 88, quality: 93, activePOs: 4 },
  { name: 'Cosmetic Solutions', brands: ['AcneFree'], status: 'active', avgLeadTime: '5-7 wks', onTime: 90, quality: 94, activePOs: 3 },
  { name: 'Mana Products', brands: ["Carol's Daughter"], status: 'attention', avgLeadTime: '6-9 wks', onTime: 81, quality: 91, activePOs: 2 },
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
  // Configured → REAL data only: throw on failure so the sync orchestrator
  // isolates/logs it instead of writing synthetic CM/vendor rows.
  const records = await fetchErpRecords(
    apiUrl,
    apiKey,
    candidatePaths(path, '/vendors', '/cms'),
    ['vendors', 'cms'],
  )
  return records.map(mapErpCm).filter((r) => r.name)
}

// ─── Open Orders / Purchase Orders ──────────────────────────
// Mirrors the ERP "Open Order Tracking" screen: POs grouped by manufacturer,
// each with per-SKU line items. The synthetic dev feed reflects the
// manufacturers + POs seen in the ERP UI (Paklab, Twincraft, Glenmark, Cosmax)
// and carries real line items so the Nexus Open-Orders view is fully testable
// before the real ERP endpoint is confirmed.
const SYNTHETIC_ERP_OPEN_ORDERS: Array<Record<string, any>> = [
  {
    poNumber: 'P06222026', erpPoId: 'PL-1', vendor: 'Paklab', status: 'Sent to Vendor',
    urgency: 'Normal', orderDate: '2026-06-21', deliveryDue: '2026-11-29', eta: '2026-11-29',
    lines: [
      { lineNo: 1, sku: 'A2210100', description: 'Ambi Even & Clear 10 vertical', qtyOrdered: 25000, qtyReceived: 0, unitPrice: 1.75 },
      { lineNo: 2, sku: 'A2210200', description: 'Ambi Fade Cream 10 AMZ vertical', qtyOrdered: 75000, qtyReceived: 0, unitPrice: 1.75 },
    ],
  },
  {
    poNumber: 'P05282026', erpPoId: 'PL-2', vendor: 'Paklab', status: 'Sent to Vendor',
    urgency: 'Normal', orderDate: '2026-05-25', deliveryDue: '2026-12-14', eta: '2026-12-14',
    lines: [
      { lineNo: 1, sku: 'F5510100', description: 'AcneFree Oil-Free Cleanser', qtyOrdered: 60000, qtyReceived: 0, unitPrice: 1.42 },
      { lineNo: 2, sku: 'F5510300', description: 'AcneFree Witch Hazel Toner', qtyOrdered: 40000, qtyReceived: 0, unitPrice: 1.18 },
    ],
  },
  {
    poNumber: 'P05272026', erpPoId: 'PL-3', vendor: 'Paklab', status: 'Sent to Vendor',
    urgency: 'Normal', orderDate: '2026-05-25', deliveryDue: '2026-10-29', eta: '2026-10-29',
    lines: [
      { lineNo: 1, sku: 'A2210300', description: 'Ambi Soothing Moisturizer SPF 30', qtyOrdered: 6000, qtyReceived: 0, unitPrice: 2.10 },
      { lineNo: 2, sku: 'A2210400', description: 'Ambi Even & Clear Daily Moisturizer', qtyOrdered: 4000, qtyReceived: 0, unitPrice: 1.95 },
    ],
  },
  {
    poNumber: 'PK05272026', erpPoId: 'PL-4', vendor: 'Paklab', status: 'Acknowledged',
    urgency: 'Normal', orderDate: '2026-05-25', deliveryDue: '2026-11-19', eta: '2026-11-19',
    lines: [
      { lineNo: 1, sku: 'F5510200', description: 'AcneFree Severe Acne 24HR Kit', qtyOrdered: 20000, qtyReceived: 0, unitPrice: 4.05 },
      { lineNo: 2, sku: 'F5510100', description: 'AcneFree Oil-Free Cleanser', qtyOrdered: 20000, qtyReceived: 0, unitPrice: 1.42 },
      { lineNo: 3, sku: 'F5510300', description: 'AcneFree Witch Hazel Toner', qtyOrdered: 10000, qtyReceived: 0, unitPrice: 1.18 },
    ],
  },
  {
    poNumber: 'P04232026', erpPoId: 'PL-5', vendor: 'Paklab', status: 'Sent to Vendor',
    urgency: 'Normal', orderDate: '2026-04-16', deliveryDue: '2026-10-22', eta: '2026-10-22',
    lines: [
      { lineNo: 1, sku: 'A2210100', description: 'Ambi Even & Clear Cleanser', qtyOrdered: 100000, qtyReceived: 0, unitPrice: 1.75 },
    ],
  },
  {
    poNumber: 'P03132026', erpPoId: 'PL-6', vendor: 'Paklab', status: 'In Production',
    urgency: 'Urgent', orderDate: '2026-03-12', deliveryDue: '2026-06-25', eta: '2026-06-25',
    lines: [
      { lineNo: 1, sku: 'A2210200', description: 'Ambi Fade Cream Normal Skin', qtyOrdered: 10000, qtyReceived: 0, unitPrice: 1.88 },
    ],
  },
  {
    poNumber: 'TW-88010', erpPoId: 'TW-1', vendor: 'Twincraft', status: 'Acknowledged',
    urgency: 'Normal', orderDate: '2026-05-01', deliveryDue: '2026-10-10', eta: '2026-10-10',
    lines: [
      { lineNo: 1, sku: 'K6001100', description: 'CD Scalp & Edge Detox Shampoo 8oz', qtyOrdered: 150000, qtyReceived: 30000, unitPrice: 2.35 },
      { lineNo: 2, sku: 'K6001200', description: 'CD Scalp & Edge Cleansing Oil 6oz', qtyOrdered: 150000, qtyReceived: 20000, unitPrice: 2.60 },
    ],
  },
  {
    poNumber: 'GL-4402', erpPoId: 'GL-1', vendor: 'Glenmark', status: 'In Production',
    urgency: 'Normal', orderDate: '2026-04-18', deliveryDue: '2026-09-30', eta: '2026-09-30',
    lines: [
      { lineNo: 1, sku: 'K4415110', description: 'Goddess Strength Shampoo 11oz', qtyOrdered: 90400, qtyReceived: 0, unitPrice: 1.99 },
      { lineNo: 2, sku: 'K4415210', description: 'Goddess Strength Conditioner 11oz', qtyOrdered: 80000, qtyReceived: 0, unitPrice: 1.99 },
    ],
  },
  {
    poNumber: 'CX-7781', erpPoId: 'CX-1', vendor: 'Cosmax', status: 'Sent to Vendor',
    urgency: 'Normal', orderDate: '2026-06-02', deliveryDue: '2026-12-01', eta: '2026-12-01',
    lines: [
      { lineNo: 1, sku: 'A2210300', description: 'Ambi Soothing Moisturizer SPF 30', qtyOrdered: 50000, qtyReceived: 0, unitPrice: 2.10 },
    ],
  },
]

function syntheticOpenOrders(): ErpOpenOrder[] {
  return SYNTHETIC_ERP_OPEN_ORDERS.map(mapErpOpenOrder)
}

/**
 * Fetch open-order / purchase-order data from the ERP. Real feed when
 * configured (trying `path` then `/open-orders` then `/purchase-orders` then
 * `/pos`), otherwise a labelled synthetic dev feed. Throws on configured-but-
 * failing (or zero usable records) so the sync orchestrator isolates the feed
 * instead of writing sample data over real POs.
 */
export async function fetchErpOpenOrders(
  prisma: PrismaClient,
  path?: string,
): Promise<ErpOpenOrder[]> {
  const { apiUrl, apiKey, configured } = await getErpConfig(prisma)
  if (!configured || !apiUrl || !apiKey) return syntheticOpenOrders()
  const records = await fetchErpRecords(
    apiUrl,
    apiKey,
    candidatePaths(path, '/open-orders', '/purchase-orders', '/pos'),
    ['openOrders', 'open_orders', 'purchaseOrders', 'pos', 'orders'],
  )
  const mapped = records.map(mapErpOpenOrder).filter((r) => r.poNumber)
  if (mapped.length === 0) throw new Error('ERP returned no usable open-order records')
  return mapped
}
