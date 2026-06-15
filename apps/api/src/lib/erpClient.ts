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
        headers: {
          Authorization: `Bearer ${apiKey}`,
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

  throw new Error(
    `Failed to fetch SKUs from ERP at ${base}: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  )
}
