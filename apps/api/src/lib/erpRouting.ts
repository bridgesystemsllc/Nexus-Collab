import type { PrismaClient, Integration, Prisma } from '@prisma/client'

// ─── ERP data-flow routing ──────────────────────────────────
//
// When the ERP_KAREVE_SYNC integration is connected, an admin can configure
// which ERP feeds flow into which Nexus modules, and enable/disable each feed.
//
// Routing lives on Integration.config alongside the ENCRYPTED credentials blob
// ({ iv, encrypted, tag }) but is itself stored UNENCRYPTED under `.routing`
// (routing is not a secret). The two never clobber each other:
//   - setRoutingOnConfig() preserves the creds keys while merging routing.
//   - the connect handler preserves any existing `.routing` while rewriting creds.

/** A single ERP feed in the catalog. */
export interface ErpFeed {
  key: string
  label: string
  defaultModuleType: string
  description: string
}

/**
 * Catalog of ERP feeds that can be routed into Nexus modules. `skus` and
 * `inventory` have implemented syncs today; the rest are wired but inert until
 * their syncs are built.
 */
export const ERP_FEEDS: ErpFeed[] = [
  {
    key: 'skus',
    label: 'SKUs / Products',
    defaultModuleType: 'SKU_PIPELINE',
    description: 'SKU / product master data (name, brand, UPC, status, stock, price).',
  },
  {
    key: 'inventory',
    label: 'Inventory Levels',
    defaultModuleType: 'INVENTORY_HEALTH',
    description: 'On-hand / committed / available stock levels and coverage health.',
  },
  {
    key: 'components',
    label: 'Components / Parts',
    defaultModuleType: 'COMPONENTS',
    description: 'Raw components and parts master data (not yet implemented).',
  },
  {
    key: 'pricing',
    label: 'Pricing / Cost',
    defaultModuleType: 'FINANCE_COSTING',
    description: 'Unit cost and pricing data for finance costing (not yet implemented).',
  },
  {
    key: 'cm',
    label: 'Contract Manufacturers / Vendors',
    defaultModuleType: 'CM_PRODUCTIVITY',
    description: 'Contract manufacturer / vendor records and productivity (not yet implemented).',
  },
]

/** Feed keys whose syncs are implemented today (default-enabled). */
const IMPLEMENTED_FEED_KEYS = new Set(['skus', 'inventory'])

/** A routing decision for a single feed. */
export interface RouteEntry {
  enabled: boolean
  targetModuleId: string | null
  targetModuleType: string | null
  erpPath?: string | null
}

export type Routing = Record<string, RouteEntry>

/** The encrypted credentials blob shape stored on Integration.config. */
interface CredsBlob {
  iv?: string
  encrypted?: string
  tag?: string
}

type StoredConfig = CredsBlob & { routing?: Record<string, Partial<RouteEntry>> }

/**
 * Build the default RouteEntry for a feed: enabled iff its sync is implemented,
 * targeting the feed's default module type, with no explicit module id / path.
 */
function defaultEntry(feed: ErpFeed): RouteEntry {
  return {
    enabled: IMPLEMENTED_FEED_KEYS.has(feed.key),
    targetModuleId: null,
    targetModuleType: feed.defaultModuleType,
    erpPath: null,
  }
}

/**
 * Read the routing off an Integration, merged with defaults so EVERY feed key
 * in ERP_FEEDS has a complete RouteEntry. Missing / malformed routing falls
 * back to defaults defensively.
 */
export function getRouting(integration: Integration | null | undefined): Routing {
  const config = (integration?.config ?? null) as StoredConfig | null
  const stored = config?.routing ?? {}

  const routing: Routing = {}
  for (const feed of ERP_FEEDS) {
    const base = defaultEntry(feed)
    const patch = (stored[feed.key] ?? {}) as Partial<RouteEntry>
    routing[feed.key] = {
      enabled: typeof patch.enabled === 'boolean' ? patch.enabled : base.enabled,
      targetModuleId:
        patch.targetModuleId !== undefined ? patch.targetModuleId : base.targetModuleId,
      targetModuleType:
        patch.targetModuleType !== undefined ? patch.targetModuleType : base.targetModuleType,
      erpPath: patch.erpPath !== undefined ? patch.erpPath : base.erpPath,
    }
  }
  return routing
}

/**
 * Return a NEW config object that preserves the encrypted creds keys
 * ({ iv, encrypted, tag }) and any unrelated keys, while merging `routingPatch`
 * into `.routing`. Per-feed patches are shallow-merged onto whatever routing is
 * already stored, so updating one feed never drops the others.
 */
export function setRoutingOnConfig(
  existingConfig: unknown,
  routingPatch: Record<string, Partial<RouteEntry>>,
): Prisma.InputJsonObject {
  const existing = (existingConfig ?? {}) as StoredConfig
  const currentRouting = (existing.routing ?? {}) as Record<string, Partial<RouteEntry>>

  const mergedRouting: Record<string, Partial<RouteEntry>> = { ...currentRouting }
  for (const [key, patch] of Object.entries(routingPatch || {})) {
    if (!patch) continue
    mergedRouting[key] = { ...(currentRouting[key] ?? {}), ...patch }
  }

  return { ...existing, routing: mergedRouting } as Prisma.InputJsonObject
}

/**
 * Resolve the DepartmentModule a feed should write to:
 *   1. routing[feedKey].targetModuleId if set AND the module exists,
 *   2. else the first module of routing[feedKey].targetModuleType,
 *   3. else the first module of the feed's defaultModuleType.
 * Returns null if none can be found (caller should skip the feed).
 */
export async function resolveTargetModule(
  prisma: PrismaClient,
  feedKey: string,
  routing: Routing,
) {
  const feed = ERP_FEEDS.find((f) => f.key === feedKey)
  const entry = routing[feedKey]

  // 1. Explicit module id.
  if (entry?.targetModuleId) {
    const byId = await prisma.departmentModule.findUnique({
      where: { id: entry.targetModuleId },
    })
    if (byId) return byId
  }

  // 2. Configured target module type.
  if (entry?.targetModuleType) {
    const byType = await prisma.departmentModule.findFirst({
      where: { type: entry.targetModuleType },
    })
    if (byType) return byType
  }

  // 3. Feed default module type.
  if (feed?.defaultModuleType) {
    const byDefault = await prisma.departmentModule.findFirst({
      where: { type: feed.defaultModuleType },
    })
    if (byDefault) return byDefault
  }

  return null
}
