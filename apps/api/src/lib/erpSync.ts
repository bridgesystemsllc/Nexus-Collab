import type { PrismaClient } from '@prisma/client'

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
export async function syncErpInventory(prisma: PrismaClient): Promise<ErpSyncResult> {
  const invModule = await prisma.departmentModule.findFirst({
    where: { type: 'INVENTORY_HEALTH' },
  })
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
