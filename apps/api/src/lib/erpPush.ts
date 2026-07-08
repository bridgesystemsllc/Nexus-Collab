import type { PrismaClient } from '@prisma/client'
import { getErpConfig } from './erpClient'
import { ERP_OUTBOUND_FEEDS, getOutbound, type ErpOutboundFeed } from './erpRouting'

// ─── ERP OUTBOUND push (Nexus → ERP) ────────────────────────
//
// The inverse of erpClient/erpSync: instead of PULLING ERP feeds into Nexus
// modules, this module PUSHES Nexus module data OUT to the KarEve ERP for
// Components, BOMs, and Finance costing.
//
// It is CONFIG-GATED on real ERP credentials (the same getErpConfig() the
// inbound client uses). When the ERP is NOT configured, pushToErp performs a
// DRY RUN: it maps the payloads and reports the counts but NEVER fakes a real
// send. When configured, it POSTs to `${apiUrl}${path}` with the same dual
// auth headers (Authorization: Bearer + X-API-Key) the inbound fetches use.
//
// Errors are caught at every layer so a single feed (or a network failure)
// never throws past the orchestrator — push stays a best-effort manual action.

// ─── Payload mappers (Nexus module item.data → ERP-friendly JSON) ──
// All mappers are null-safe: they read defensively from a loosely-typed `data`
// blob (module items are stored as JSON) and always emit the natural key.

type AnyData = Record<string, any> | null | undefined

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s.length ? s : null
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Map a COMPONENTS module item.data to an ERP component record. */
export function mapComponentForErp(data: AnyData) {
  const d = (data ?? {}) as Record<string, any>
  // Natural key: partNumber. Legacy rows may carry it under `component`.
  const partNumber = str(d.partNumber) ?? str(d.component)
  const moqTiers = Array.isArray(d.moqTiers)
    ? d.moqTiers.map((t: any) => ({
        qty: num(t?.qty ?? t?.quantity),
        unitCost: num(t?.unitCost ?? t?.cost),
      }))
    : []
  const vendors = Array.isArray(d.vendors)
    ? d.vendors.map((v: any) => ({
        vendorName: str(v?.vendorName ?? v?.name),
        vendorStatus: str(v?.vendorStatus ?? v?.status),
      }))
    : []
  return {
    partNumber,
    name: str(d.name),
    description: str(d.description),
    type: str(d.type),
    vendor: str(d.vendor),
    status: str(d.status),
    targetCostPerUnit: num(d.targetCostPerUnit),
    moqTiers,
    vendors,
  }
}

/** Map a BILL_OF_MATERIALS module item.data to an ERP BOM record. */
export function mapBomForErp(data: AnyData) {
  const d = (data ?? {}) as Record<string, any>
  const lines = Array.isArray(d.lines)
    ? d.lines.map((l: any) => ({
        lineNo: num(l?.lineNo),
        componentId: str(l?.componentId),
        partNumber: str(l?.partNumber),
        description: str(l?.description),
        um: str(l?.um),
        supplier: str(l?.supplier),
        partType: str(l?.partType),
      }))
    : []
  return {
    fgPartNumber: str(d.fgPartNumber),
    productName: str(d.productName),
    brand: str(d.brand),
    fillClaim: str(d.fillClaim),
    minFill: num(d.minFill),
    fillerSupplier: str(d.fillerSupplier),
    fillerName: str(d.fillerName),
    caseQty: num(d.caseQty),
    innerPack: num(d.innerPack),
    overUnderTolerance: str(d.overUnderTolerance),
    launchPriority: str(d.launchPriority),
    status: str(d.status),
    version: str(d.version),
    lines,
  }
}

/** Map a FINANCE_COSTING module item.data to an ERP pricing/costing record. */
export function mapFinanceForErp(data: AnyData) {
  const d = (data ?? {}) as Record<string, any>
  return {
    fgPartNumber: str(d.fgPartNumber),
    productName: str(d.productName),
    brand: str(d.brand),
    labelCost: num(d.labelCost),
    freightPerUnit: num(d.freightPerUnit),
    overheadPerUnit: num(d.overheadPerUnit),
    targetMarginPct: num(d.targetMarginPct),
    cogsOverride: num(d.cogsOverride),
    retailPrice: num(d.retailPrice),
    notes: str(d.notes),
  }
}

const MAPPERS: Record<string, (data: AnyData) => Record<string, any>> = {
  components: mapComponentForErp,
  boms: mapBomForErp,
  finance: mapFinanceForErp,
}

// ─── HTTP push ──────────────────────────────────────────────

export interface PushToErpResult {
  configured: boolean
  dryRun: boolean
  sent: number
  status?: number
  error?: string
}

/**
 * POST a batch of records to the ERP at `path`. CONFIG-GATED:
 *   - If the ERP is NOT configured → DRY RUN: { configured:false, dryRun:true,
 *     sent:0 }. Never fakes a real send.
 *   - If configured → POST `${apiUrl}${path}` with both auth headers, body
 *     { records }, 15s timeout. Returns { configured:true, dryRun:false, sent,
 *     status } on a 2xx, or { ..., error } on any failure (never throws).
 */
export async function pushToErp(
  prisma: PrismaClient,
  path: string,
  records: Record<string, any>[],
): Promise<PushToErpResult> {
  const { apiUrl, apiKey, configured } = await getErpConfig(prisma)

  // DRY RUN — no real credentials, so report what WOULD be sent without sending.
  if (!configured || !apiUrl || !apiKey) {
    return { configured: false, dryRun: true, sent: 0 }
  }

  const base = apiUrl.replace(/\/+$/, '')
  const cleanPath = path.startsWith('/') ? path : `/${path}`

  try {
    const response = await fetch(`${base}${cleanPath}`, {
      method: 'POST',
      headers: {
        // Send both auth styles so either ERP auth scheme works.
        Authorization: `Bearer ${apiKey}`,
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ records }),
      signal: AbortSignal.timeout(15_000),
    })

    if (!response.ok) {
      return {
        configured: true,
        dryRun: false,
        sent: 0,
        status: response.status,
        error: `ERP ${cleanPath} returned HTTP ${response.status}`,
      }
    }

    return { configured: true, dryRun: false, sent: records.length, status: response.status }
  } catch (err) {
    return {
      configured: true,
      dryRun: false,
      sent: 0,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ─── Orchestrator ───────────────────────────────────────────

export interface PushFeedResult {
  count: number
  configured: boolean
  dryRun: boolean
  sent: number
  sample?: Record<string, any>
  error?: string
}

export interface PushErpResult {
  feeds: Record<string, PushFeedResult>
  pushed: number
}

/**
 * Load the source items for one outbound feed and map them to ERP payloads.
 * Defensive: a missing source module yields an empty payload list.
 */
async function loadFeedPayloads(
  prisma: PrismaClient,
  feed: ErpOutboundFeed,
): Promise<Record<string, any>[]> {
  const mod = await prisma.departmentModule.findFirst({
    where: { type: feed.sourceModuleType },
  })
  if (!mod) return []

  const items = await prisma.moduleItem.findMany({ where: { moduleId: mod.id } })
  const mapper = MAPPERS[feed.key]
  if (!mapper) return []
  return items.map((item) => mapper(item.data as AnyData))
}

/**
 * Routing-aware OUTBOUND orchestrator. Loads the ERP integration + its outbound
 * config, then for each requested feed (or all ENABLED feeds when `feedKeys` is
 * omitted) loads the source module's items, maps them to ERP payloads, and
 * pushes them to the resolved path (outbound[key].erpPath || feed.defaultPath).
 *
 * Explicitly-requested feeds are pushed even if disabled (so an admin can test
 * a single feed); the default-all path only includes ENABLED feeds.
 *
 * Fully defensive: a missing source module reports { count:0 }; a single feed
 * failing never aborts the whole push.
 */
export async function pushErp(
  prisma: PrismaClient,
  feedKeys?: string[],
): Promise<PushErpResult> {
  const integration = await prisma.integration.findFirst({
    where: { type: 'ERP_KAREVE_SYNC' },
  })
  const outbound = getOutbound(integration)

  const explicit = Array.isArray(feedKeys) && feedKeys.length > 0
  const requested = explicit ? new Set(feedKeys) : null

  const feeds: Record<string, PushFeedResult> = {}
  let pushed = 0

  for (const feed of ERP_OUTBOUND_FEEDS) {
    const entry = outbound[feed.key]

    // Selection: explicit request honors the key regardless of enabled state;
    // otherwise only ENABLED feeds are pushed.
    const selected = explicit ? requested!.has(feed.key) : Boolean(entry?.enabled)
    if (!selected) continue

    try {
      const payloads = await loadFeedPayloads(prisma, feed)
      const path = entry?.erpPath || feed.defaultPath
      const pushResult = await pushToErp(prisma, path, payloads)

      feeds[feed.key] = {
        count: payloads.length,
        configured: pushResult.configured,
        dryRun: pushResult.dryRun,
        sent: pushResult.sent,
        sample: payloads[0],
        error: pushResult.error,
      }
      pushed += pushResult.sent
    } catch (err) {
      console.error(`[erp] outbound feed "${feed.key}" failed, skipping:`, err)
      feeds[feed.key] = {
        count: 0,
        configured: false,
        dryRun: true,
        sent: 0,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  return { feeds, pushed }
}
