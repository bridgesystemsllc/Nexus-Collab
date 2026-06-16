import type { PrismaClient } from '@prisma/client'
import {
  fetchErpSkus,
  fetchErpComponents,
  fetchErpPricing,
  fetchErpCms,
} from './erpClient'
import { ERP_FEEDS, getRouting, resolveTargetModule } from './erpRouting'

// Simulated ERP master inventory feed for Kareve Beauty Group.
// In production this would be fetched from the ERP API; here we model a
// realistic snapshot and apply small live fluctuations per sync so the
// Inventory Health module reflects an evolving feed.
interface ErpInventoryRecord {
  sku: string
  name: string
  baseOnHand: number
  committed: number
}

const ERP_INVENTORY_FEED: ErpInventoryRecord[] = [
  { sku: 'K4415110', name: 'Goddess Strength Shampoo 11oz', baseOnHand: 2, committed: 8778 },
  { sku: 'K3386201', name: 'BLK Vanilla Shmp 8.5oz', baseOnHand: 1, committed: 245 },
  { sku: 'K5517804', name: 'Born to Repair Cond 11oz', baseOnHand: 19, committed: 353 },
  { sku: 'K3692911', name: 'GS Conditioner 11oz', baseOnHand: 4154, committed: 1200 },
  { sku: 'K3905507', name: 'BV Replenish Shampoo 12oz', baseOnHand: 3821, committed: 180 },
  { sku: 'K5036900', name: 'GS Cocoon Mask 12oz', baseOnHand: 1167, committed: 88 },
  { sku: 'K6001100', name: 'CD Scalp Detox Shampoo 8oz', baseOnHand: 540, committed: 410 },
  { sku: 'K2271509', name: 'Ambi Even & Clear Cleanser 6oz', baseOnHand: 2890, committed: 760 },
]

// Average monthly demand per SKU (units), used to derive coverage months.
const MONTHLY_DEMAND: Record<string, number> = {
  K4415110: 2900,
  K3386201: 120,
  K5517804: 980,
  K3692911: 510,
  K3905507: 178,
  K5036900: 21,
  K6001100: 260,
  K2271509: 350,
}

function jitter(base: number): number {
  if (base <= 5) return base
  const delta = Math.round(base * (Math.random() * 0.2 - 0.1)) // ±10%
  return Math.max(0, base + delta)
}

function statusFor(coverageMonths: number): string {
  if (coverageMonths <= 0) return 'emergency'
  if (coverageMonths < 1) return 'critical'
  if (coverageMonths > 20) return 'overstock'
  return 'healthy'
}

export interface ErpSyncResult {
  recordsProcessed: number
  created: number
  updated: number
}

/**
 * Pull the ERP inventory feed and upsert it into the Operations
 * INVENTORY_HEALTH module. Matches existing items by SKU, updates their
 * stock figures, and creates items for any new SKUs.
 */
export async function syncErpInventory(
  prisma: PrismaClient,
  targetModuleId?: string,
): Promise<ErpSyncResult> {
  // Honor an explicit target module when provided (routing-driven); otherwise
  // fall back to the first INVENTORY_HEALTH module (back-compat behavior).
  const invModule = targetModuleId
    ? await prisma.departmentModule.findUnique({ where: { id: targetModuleId } })
    : await prisma.departmentModule.findFirst({ where: { type: 'INVENTORY_HEALTH' } })
  if (!invModule) {
    return { recordsProcessed: 0, created: 0, updated: 0 }
  }

  const existing = await prisma.moduleItem.findMany({ where: { moduleId: invModule.id } })
  const bySku = new Map<string, (typeof existing)[number]>()
  for (const item of existing) {
    const sku = (item.data as any)?.sku
    if (sku) bySku.set(sku, item)
  }

  let created = 0
  let updated = 0

  for (const rec of ERP_INVENTORY_FEED) {
    const onHand = jitter(rec.baseOnHand)
    const committed = rec.committed
    const available = Math.max(onHand - committed, 0)
    const demand = MONTHLY_DEMAND[rec.sku] || 0
    const coverageMonths = demand > 0 ? Math.round((available / demand) * 10) / 10 : available > 0 ? 99 : 0
    const status = statusFor(coverageMonths)

    const data = {
      sku: rec.sku,
      name: rec.name,
      onHand,
      committed,
      available,
      coverageMonths,
      status,
      source: 'ERP_KAREVE',
      lastSyncedAt: new Date().toISOString(),
    }

    const match = bySku.get(rec.sku)
    if (match) {
      await prisma.moduleItem.update({
        where: { id: match.id },
        data: { data, status },
      })
      updated++
    } else {
      await prisma.moduleItem.create({
        data: { moduleId: invModule.id, data, status },
      })
      created++
    }
  }

  return { recordsProcessed: created + updated, created, updated }
}

// Implemented sync functions, keyed by ERP feed key. Each takes the resolved
// target module id. Feeds NOT listed here (components/pricing/cm) are wired in
// the routing catalog but have no sync yet — syncErp leaves them inert.
const FEED_SYNCS: Record<
  string,
  (
    prisma: PrismaClient,
    targetModuleId: string,
    erpPath?: string | null,
  ) => Promise<ErpSyncResult>
> = {
  skus: (prisma, moduleId) => syncErpSkuPipeline(prisma, moduleId),
  inventory: (prisma, moduleId) => syncErpInventory(prisma, moduleId),
  components: (prisma, moduleId, erpPath) =>
    syncErpComponents(prisma, moduleId, erpPath ?? undefined),
  pricing: (prisma, moduleId, erpPath) =>
    syncErpPricing(prisma, moduleId, erpPath ?? undefined),
  cm: (prisma, moduleId, erpPath) => syncErpCm(prisma, moduleId, erpPath ?? undefined),
}

export interface ErpSyncOrchestratorResult {
  feeds: Record<string, ErpSyncResult>
  recordsProcessed: number
}

/**
 * Routing-aware ERP sync orchestrator. Loads the ERP integration + its routing,
 * then for each ENABLED feed with an implemented sync, resolves the target
 * module and runs the sync into it. Disabled feeds and not-yet-implemented
 * feeds (components/pricing/cm) are reported as inert {0,0,0} results.
 *
 * Fully defensive: missing routing → defaults; missing module → skip the feed
 * (never throws for a single feed's resolution).
 */
export async function syncErp(prisma: PrismaClient): Promise<ErpSyncOrchestratorResult> {
  const integration = await prisma.integration.findFirst({
    where: { type: 'ERP_KAREVE_SYNC' },
  })
  const routing = getRouting(integration)

  const feeds: Record<string, ErpSyncResult> = {}
  let recordsProcessed = 0

  for (const feed of ERP_FEEDS) {
    const entry = routing[feed.key]
    const inert: ErpSyncResult = { recordsProcessed: 0, created: 0, updated: 0 }

    // Skip disabled feeds.
    if (!entry?.enabled) {
      feeds[feed.key] = inert
      continue
    }

    const syncFn = FEED_SYNCS[feed.key]
    if (!syncFn) {
      // Wired in routing but no sync implemented yet — leave inert.
      feeds[feed.key] = inert
      continue
    }

    const targetModule = await resolveTargetModule(prisma, feed.key, routing)
    if (!targetModule) {
      // No module to write to — skip this feed without throwing.
      feeds[feed.key] = inert
      continue
    }

    const result = await syncFn(prisma, targetModule.id, entry.erpPath)
    feeds[feed.key] = result
    recordsProcessed += result.recordsProcessed
  }

  return { feeds, recordsProcessed }
}

/**
 * Pull the ERP SKU / product master feed and upsert it into the Operations
 * SKU_PIPELINE module. Matches existing items by SKU and MERGES the ERP
 * fields (sku/name/brand/upc/onHand/committed/available/unitPrice/category)
 * into them while PRESERVING local pipeline fields (step/totalSteps/owner/
 * blocker/status/linkedNpdId). New SKUs are created with sensible pipeline
 * defaults. Mirrors the syncErpInventory pattern.
 */
export async function syncErpSkuPipeline(
  prisma: PrismaClient,
  targetModuleId?: string,
): Promise<ErpSyncResult> {
  // Honor an explicit target module when provided (routing-driven); otherwise
  // fall back to the first SKU_PIPELINE module (back-compat behavior).
  const skuModule = targetModuleId
    ? await prisma.departmentModule.findUnique({ where: { id: targetModuleId } })
    : await prisma.departmentModule.findFirst({ where: { type: 'SKU_PIPELINE' } })
  if (!skuModule) {
    return { recordsProcessed: 0, created: 0, updated: 0 }
  }

  const existing = await prisma.moduleItem.findMany({ where: { moduleId: skuModule.id } })
  const bySku = new Map<string, (typeof existing)[number]>()
  for (const item of existing) {
    const sku = (item.data as any)?.sku
    if (sku) bySku.set(sku, item)
  }

  const erpSkus = await fetchErpSkus(prisma)
  const now = new Date().toISOString()

  let created = 0
  let updated = 0

  for (const rec of erpSkus) {
    // ERP-supplied fields, applied on every sync.
    const erpFields = {
      sku: rec.sku,
      name: rec.name,
      brand: rec.brand,
      upc: rec.upc,
      onHand: rec.onHand,
      committed: rec.committed,
      available: rec.available,
      unitPrice: rec.unitPrice,
      category: rec.category,
      lastErpUpdate: rec.lastErpUpdate,
      source: 'ERP_KAREVE' as const,
      lastSyncedAt: now,
    }

    const match = bySku.get(rec.sku)
    if (match) {
      const prev = (match.data as any) || {}
      // Preserve local pipeline fields; ERP only supplies master/stock data.
      const data = {
        ...prev,
        ...erpFields,
        // Keep existing pipeline progress + ownership if already set.
        step: prev.step ?? 1,
        totalSteps: prev.totalSteps ?? 6,
        owner: prev.owner ?? 'ERP',
        blocker: prev.blocker ?? null,
        status: prev.status ?? rec.status,
      }
      await prisma.moduleItem.update({
        where: { id: match.id },
        data: { data, status: data.status },
      })
      updated++
    } else {
      const data = {
        ...erpFields,
        status: rec.status,
        step: 1,
        totalSteps: 6,
        owner: 'ERP',
        blocker: null,
        linkedNpdId: null,
      }
      await prisma.moduleItem.create({
        data: { moduleId: skuModule.id, data, status: rec.status },
      })
      created++
    }
  }

  return { recordsProcessed: created + updated, created, updated }
}

/**
 * Pull the ERP component / part master feed and upsert it into a COMPONENTS
 * module. Matches existing items by data.partNumber, MERGES the ERP master
 * fields (partNumber/name/description/type/vendor/status + a targetCostPerUnit
 * derived from ERP unitCost) while PRESERVING locally-managed fields
 * (moqTiers, vendors). New parts are created with empty moqTiers + a primary
 * vendor entry. Sets source:'ERP_KAREVE' + lastSyncedAt and mirrors status.
 */
export async function syncErpComponents(
  prisma: PrismaClient,
  targetModuleId?: string,
  erpPath?: string,
): Promise<ErpSyncResult> {
  const mod = targetModuleId
    ? await prisma.departmentModule.findUnique({ where: { id: targetModuleId } })
    : await prisma.departmentModule.findFirst({ where: { type: 'COMPONENTS' } })
  if (!mod) {
    return { recordsProcessed: 0, created: 0, updated: 0 }
  }

  const existing = await prisma.moduleItem.findMany({ where: { moduleId: mod.id } })
  const byPart = new Map<string, (typeof existing)[number]>()
  for (const item of existing) {
    const pn = (item.data as any)?.partNumber
    if (pn) byPart.set(pn, item)
  }

  const components = await fetchErpComponents(prisma, erpPath)
  const now = new Date().toISOString()

  let created = 0
  let updated = 0

  for (const rec of components) {
    const status = rec.status ?? 'Approved'
    // ERP-supplied master fields applied on every sync.
    const erpFields = {
      partNumber: rec.partNumber,
      name: rec.name,
      description: rec.description,
      type: rec.type,
      vendor: rec.vendor,
      status,
      source: 'ERP_KAREVE' as const,
      lastSyncedAt: now,
    }

    const match = byPart.get(rec.partNumber)
    if (match) {
      const prev = (match.data as any) || {}
      // Preserve locally-managed sourcing data (moqTiers, vendors); ERP only
      // supplies the part master + an optional cost reference.
      const data = {
        ...prev,
        ...erpFields,
        targetCostPerUnit: rec.unitCost ?? prev.targetCostPerUnit ?? null,
        moqTiers: prev.moqTiers ?? [],
        vendors: prev.vendors ?? [{ vendorName: rec.vendor, vendorStatus: 'Primary' }],
      }
      await prisma.moduleItem.update({ where: { id: match.id }, data: { data, status } })
      updated++
    } else {
      const data = {
        ...erpFields,
        targetCostPerUnit: rec.unitCost ?? null,
        moqTiers: [],
        vendors: [{ vendorName: rec.vendor, vendorStatus: 'Primary' }],
      }
      await prisma.moduleItem.create({ data: { moduleId: mod.id, data, status } })
      created++
    }
  }

  return { recordsProcessed: created + updated, created, updated }
}

/**
 * Pull the ERP pricing / cost feed and upsert it into a FINANCE_COSTING module.
 * Matches existing items by data.fgPartNumber. The ERP OWNS retailPrice +
 * a cost reference (erpUnitCost) + productName/brand; everything else is
 * FINANCE-OWNED and PRESERVED on update (labelCost, freightPerUnit,
 * overheadPerUnit, targetMarginPct, cogsOverride, notes). New rows get sane
 * finance defaults. Sets source:'ERP_KAREVE' + lastSyncedAt.
 */
export async function syncErpPricing(
  prisma: PrismaClient,
  targetModuleId?: string,
  erpPath?: string,
): Promise<ErpSyncResult> {
  const mod = targetModuleId
    ? await prisma.departmentModule.findUnique({ where: { id: targetModuleId } })
    : await prisma.departmentModule.findFirst({ where: { type: 'FINANCE_COSTING' } })
  if (!mod) {
    return { recordsProcessed: 0, created: 0, updated: 0 }
  }

  const existing = await prisma.moduleItem.findMany({ where: { moduleId: mod.id } })
  const byFg = new Map<string, (typeof existing)[number]>()
  for (const item of existing) {
    const fg = (item.data as any)?.fgPartNumber
    if (fg) byFg.set(fg, item)
  }

  const pricing = await fetchErpPricing(prisma, erpPath)
  const now = new Date().toISOString()

  let created = 0
  let updated = 0

  for (const rec of pricing) {
    // ERP-owned fields, applied on every sync.
    const erpFields = {
      fgPartNumber: rec.fgPartNumber,
      productName: rec.productName,
      brand: rec.brand,
      retailPrice: rec.retailPrice,
      erpUnitCost: rec.erpUnitCost,
      source: 'ERP_KAREVE' as const,
      lastSyncedAt: now,
    }

    const match = byFg.get(rec.fgPartNumber)
    if (match) {
      const prev = (match.data as any) || {}
      // Spread prev FIRST so ERP-owned fields overwrite, then explicitly carry
      // the finance-owned fields back over to guarantee preservation.
      const data = {
        ...prev,
        ...erpFields,
        labelCost: prev.labelCost,
        freightPerUnit: prev.freightPerUnit,
        overheadPerUnit: prev.overheadPerUnit,
        targetMarginPct: prev.targetMarginPct,
        cogsOverride: prev.cogsOverride,
        notes: prev.notes,
      }
      await prisma.moduleItem.update({
        where: { id: match.id },
        data: { data, status: match.status },
      })
      updated++
    } else {
      const data = {
        ...erpFields,
        labelCost: 0,
        freightPerUnit: 0,
        overheadPerUnit: 0,
        targetMarginPct: null,
        cogsOverride: null,
        notes: '',
      }
      await prisma.moduleItem.create({ data: { moduleId: mod.id, data, status: 'Active' } })
      created++
    }
  }

  return { recordsProcessed: created + updated, created, updated }
}

/**
 * Pull the ERP contract-manufacturer / vendor feed and upsert it into a
 * CM_PRODUCTIVITY module. Matches existing items by data.name, MERGES the ERP
 * fields (name/brands/status/avgLeadTime + onTime/quality/activePOs metrics)
 * while PRESERVING locally-managed fields (issues, contacts, products, notes).
 * Sets source:'ERP_KAREVE' + lastSyncedAt and mirrors status.
 */
export async function syncErpCm(
  prisma: PrismaClient,
  targetModuleId?: string,
  erpPath?: string,
): Promise<ErpSyncResult> {
  const mod = targetModuleId
    ? await prisma.departmentModule.findUnique({ where: { id: targetModuleId } })
    : await prisma.departmentModule.findFirst({ where: { type: 'CM_PRODUCTIVITY' } })
  if (!mod) {
    return { recordsProcessed: 0, created: 0, updated: 0 }
  }

  const existing = await prisma.moduleItem.findMany({ where: { moduleId: mod.id } })
  const byName = new Map<string, (typeof existing)[number]>()
  for (const item of existing) {
    const name = (item.data as any)?.name
    if (name) byName.set(name, item)
  }

  const cms = await fetchErpCms(prisma, erpPath)
  const now = new Date().toISOString()

  let created = 0
  let updated = 0

  for (const rec of cms) {
    const status = rec.status || 'active'
    // ERP-supplied fields applied on every sync.
    const erpFields = {
      name: rec.name,
      brands: rec.brands,
      status,
      avgLeadTime: rec.avgLeadTime,
      onTime: rec.onTime,
      quality: rec.quality,
      activePOs: rec.activePOs,
      source: 'ERP_KAREVE' as const,
      lastSyncedAt: now,
    }

    const match = byName.get(rec.name)
    if (match) {
      const prev = (match.data as any) || {}
      // Preserve locally-managed CM detail; ERP supplies the scorecard fields.
      const data = {
        ...prev,
        ...erpFields,
        onTime: rec.onTime ?? prev.onTime,
        quality: rec.quality ?? prev.quality,
        activePOs: rec.activePOs ?? prev.activePOs,
        openIssues: prev.openIssues ?? 0,
      }
      await prisma.moduleItem.update({ where: { id: match.id }, data: { data, status } })
      updated++
    } else {
      const data = {
        ...erpFields,
        onTime: rec.onTime ?? 0,
        quality: rec.quality ?? 0,
        activePOs: rec.activePOs ?? 0,
        openIssues: 0,
      }
      await prisma.moduleItem.create({ data: { moduleId: mod.id, data, status } })
      created++
    }
  }

  return { recordsProcessed: created + updated, created, updated }
}
