import type { PrismaClient } from '@prisma/client'
import type { ColumnMap } from './mapRows'

// ─── Supplier inventory feed configuration ───────────────────
// A feed is stored as an Integration row rather than a bespoke table: the
// existing Integration/SyncLog pair already models "an external source with
// config, connection state, and a run history", which is exactly this.
//
// The Geodis feed is the first, but nothing here is Geodis-specific beyond
// the defaults — a second 3PL is another row.

export const GEODIS_FEED_TYPE = 'GEODIS_INVENTORY_FEED'
export const GEODIS_MODULE_NAME = 'Geodis Inventory'
export const GEODIS_WAREHOUSE = 'GEODIS'
export const GEODIS_SOURCE = 'GEODIS_FEED'

export interface FeedMatch {
  // Both are substring tests, lowercased. An empty/absent value means "don't
  // constrain on this", but a feed with neither would match all mail, so
  // matchFeed treats that as no-match.
  fromContains?: string
  subjectContains?: string
}

export interface FeedGuard {
  // Hold the import when the incoming row count falls below this fraction of
  // the last successful run. Guards against truncated reports zeroing stock.
  minRowRatio: number
  // Hold when unreadable rows exceed this fraction of all rows seen.
  maxBadRowRatio: number
}

export interface FeedConfig {
  targetModuleId: string | null
  match: FeedMatch
  columnMap: ColumnMap
  guard: FeedGuard
  warehouse: string
  source: string
}

// Placeholder mapping, tuned to the first real Geodis export. These are the
// column names their portal uses by default; correcting them is a config edit
// through the API, not a code change.
export const DEFAULT_GEODIS_COLUMN_MAP: ColumnMap = {
  sku: 'Item',
  name: 'Description',
  brand: 'Brand',
  onHand: 'On Hand',
  committed: 'Allocated',
  available: 'Available',
}

export const DEFAULT_GUARD: FeedGuard = {
  minRowRatio: 0.7,
  maxBadRowRatio: 0.1,
}

export const DEFAULT_GEODIS_CONFIG: FeedConfig = {
  targetModuleId: null,
  match: { fromContains: 'geodis.com', subjectContains: 'inventory' },
  columnMap: DEFAULT_GEODIS_COLUMN_MAP,
  guard: DEFAULT_GUARD,
  warehouse: GEODIS_WAREHOUSE,
  source: GEODIS_SOURCE,
}

// Merge a stored config blob over the defaults. Stored config is user-editable
// JSON, so every field is treated as untrusted and individually defaulted
// rather than spread wholesale.
export function normalizeFeedConfig(raw: unknown): FeedConfig {
  const c = (raw ?? {}) as Record<string, any>
  const match = (c.match ?? {}) as Record<string, any>
  const columnMap = (c.columnMap ?? {}) as Record<string, any>
  const guard = (c.guard ?? {}) as Record<string, any>

  const ratio = (value: unknown, fallback: number) => {
    const n = Number(value)
    return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback
  }
  const str = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim() ? value.trim() : undefined

  // Match rules distinguish "not configured" from "deliberately cleared": an
  // absent key falls back to the default, but a present-and-empty one means
  // "do not constrain on this". Without that distinction a sender-only rule
  // would be impossible to express, which matters when a supplier's subject
  // lines vary between runs. matchFeed still refuses to match when BOTH ends
  // up empty, so this cannot widen into matching all mail.
  const rule = (key: string, fallback: string | undefined): string | undefined =>
    key in match ? str(match[key]) : fallback

  return {
    targetModuleId: str(c.targetModuleId) ?? null,
    match: {
      fromContains: rule('fromContains', DEFAULT_GEODIS_CONFIG.match.fromContains),
      subjectContains: rule('subjectContains', DEFAULT_GEODIS_CONFIG.match.subjectContains),
    },
    columnMap: {
      sku: str(columnMap.sku) ?? DEFAULT_GEODIS_COLUMN_MAP.sku,
      name: str(columnMap.name) ?? DEFAULT_GEODIS_COLUMN_MAP.name,
      brand: str(columnMap.brand) ?? DEFAULT_GEODIS_COLUMN_MAP.brand,
      onHand: str(columnMap.onHand) ?? DEFAULT_GEODIS_COLUMN_MAP.onHand,
      committed: str(columnMap.committed) ?? DEFAULT_GEODIS_COLUMN_MAP.committed,
      available: str(columnMap.available) ?? DEFAULT_GEODIS_COLUMN_MAP.available,
    },
    guard: {
      minRowRatio: ratio(guard.minRowRatio, DEFAULT_GUARD.minRowRatio),
      maxBadRowRatio: ratio(guard.maxBadRowRatio, DEFAULT_GUARD.maxBadRowRatio),
    },
    warehouse: str(c.warehouse) ?? GEODIS_WAREHOUSE,
    source: str(c.source) ?? GEODIS_SOURCE,
  }
}

export interface ResolvedFeed {
  integrationId: string
  name: string
  config: FeedConfig
}

// Find or create the Geodis feed, together with the inventory module it writes
// into. Idempotent: safe to call on every import and on startup.
export async function ensureGeodisFeed(prisma: PrismaClient): Promise<ResolvedFeed | null> {
  const org = await prisma.organization.findFirst()
  if (!org) return null

  let integration = await prisma.integration.findFirst({ where: { type: GEODIS_FEED_TYPE } })
  if (!integration) {
    integration = await prisma.integration.create({
      data: {
        type: GEODIS_FEED_TYPE,
        name: 'Geodis Inventory Feed',
        status: 'DISCONNECTED',
        config: DEFAULT_GEODIS_CONFIG as unknown as object,
        orgId: org.id,
      },
    })
  }

  const config = normalizeFeedConfig(integration.config)

  // Resolve (or create) the module the feed writes into. It is a normal
  // INVENTORY_HEALTH module so that everything.tsx and the AI context pick it
  // up with no change; only its name and the per-row warehouse tag mark it as
  // Geodis.
  let moduleId = config.targetModuleId
  const existingModule = moduleId
    ? await prisma.departmentModule.findUnique({ where: { id: moduleId } })
    : null

  if (!existingModule) {
    const found = await prisma.departmentModule.findFirst({
      where: { type: 'INVENTORY_HEALTH', name: GEODIS_MODULE_NAME },
    })
    if (found) {
      moduleId = found.id
    } else {
      const ops =
        (await prisma.department.findFirst({ where: { type: 'BUILTIN_OPS' } })) ??
        (await prisma.department.findFirst({ where: { orgId: org.id } }))
      if (!ops) return null

      const created = await prisma.departmentModule.create({
        data: {
          name: GEODIS_MODULE_NAME,
          type: 'INVENTORY_HEALTH',
          departmentId: ops.id,
          sortOrder: 2,
          config: { warehouse: GEODIS_WAREHOUSE, readOnly: true } as unknown as object,
        },
      })
      moduleId = created.id
    }

    config.targetModuleId = moduleId
    await prisma.integration.update({
      where: { id: integration.id },
      data: { config: config as unknown as object },
    })
  }

  return { integrationId: integration.id, name: integration.name, config }
}
