import type { PrismaClient } from '@prisma/client'
import { gradeInventory } from '../../lib/inventoryStatus'
import type { InventoryRecord, RowError } from './mapRows'
import type { FeedGuard } from './feedConfig'

// ─── Snapshot import ─────────────────────────────────────────
// Applies a supplier stock file as a FULL SNAPSHOT: the file is the complete
// truth for that warehouse. Any SKU the module holds but the file omits is
// zeroed and flagged, never deleted — "this went to zero" is the signal
// operations actually needs, and deleting would destroy the history.
//
// Because a snapshot can zero out hundreds of rows, a truncated or
// half-generated report is the dangerous failure mode. The guard below is the
// only thing standing between a bad export and a wiped stock position, so it
// runs before anything is written and holds the entire import rather than
// applying part of it.

export type ImportStatus = 'complete' | 'held' | 'error'

export interface ImportOutcome {
  status: ImportStatus
  created: number
  updated: number
  zeroed: number
  recordsProcessed: number
  // Populated when status is 'held' — the human-readable reason.
  heldReason?: string
  rowErrors: RowError[]
  duplicateSkus: string[]
}

export interface ImportInput {
  prisma: PrismaClient
  integrationId: string
  moduleId: string
  records: InventoryRecord[]
  rowErrors?: RowError[]
  duplicateSkus?: string[]
  guard: FeedGuard
  warehouse: string
  source: string
  // Set when the operator has reviewed a held run and chosen to apply it.
  overrideGuard?: boolean
}

// The row count of the most recent successful run, used as the guard baseline.
// Null when this feed has never completed a run, in which case there is
// nothing to compare against and the import proceeds.
export async function lastGoodRowCount(
  prisma: PrismaClient,
  integrationId: string,
): Promise<number | null> {
  const last = await prisma.syncLog.findFirst({
    where: { integrationId, status: 'complete' },
    orderBy: { startedAt: 'desc' },
  })
  return last ? last.recordsProcessed : null
}

export interface GuardVerdict {
  ok: boolean
  reason?: string
}

// Pure guard evaluation, separated so it is testable without a database.
export function evaluateGuard(
  recordCount: number,
  badRowCount: number,
  baseline: number | null,
  guard: FeedGuard,
): GuardVerdict {
  const totalRows = recordCount + badRowCount
  if (totalRows === 0) {
    return { ok: false, reason: 'The file contained no usable rows.' }
  }

  const badRatio = badRowCount / totalRows
  if (badRatio > guard.maxBadRowRatio) {
    return {
      ok: false,
      reason:
        `${badRowCount} of ${totalRows} rows (${Math.round(badRatio * 100)}%) could not be read, ` +
        `above the ${Math.round(guard.maxBadRowRatio * 100)}% limit. The file looks malformed.`,
    }
  }

  // No baseline means this is the first successful import; there is nothing
  // meaningful to compare against, so let it through.
  if (baseline == null || baseline === 0) return { ok: true }

  const minimum = baseline * guard.minRowRatio
  if (recordCount < minimum) {
    return {
      ok: false,
      reason:
        `Only ${recordCount} rows received against ${baseline} in the last good import ` +
        `(${Math.round((recordCount / baseline) * 100)}%, below the ` +
        `${Math.round(guard.minRowRatio * 100)}% floor). The report looks truncated, so ` +
        `nothing was changed.`,
    }
  }

  return { ok: true }
}

export async function importInventorySnapshot(input: ImportInput): Promise<ImportOutcome> {
  const {
    prisma, integrationId, moduleId, records,
    rowErrors = [], duplicateSkus = [], guard, warehouse, source, overrideGuard = false,
  } = input

  const syncLog = await prisma.syncLog.create({
    data: { integrationId, status: 'running', recordsProcessed: 0 },
  })

  const finish = async (
    status: ImportStatus,
    outcome: Omit<ImportOutcome, 'status'>,
    errors?: unknown,
  ): Promise<ImportOutcome> => {
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status,
        recordsProcessed: outcome.recordsProcessed,
        errors: errors ? (errors as object) : undefined,
        completedAt: new Date(),
      },
    })
    if (status === 'complete') {
      await prisma.integration.update({
        where: { id: integrationId },
        data: { status: 'CONNECTED', lastSyncAt: new Date(), syncCount: { increment: 1 } },
      })
    } else {
      await prisma.integration
        .update({ where: { id: integrationId }, data: { status: 'ERROR' } })
        .catch(() => {})
    }
    return { status, ...outcome }
  }

  const baseline = await lastGoodRowCount(prisma, integrationId)
  const verdict = evaluateGuard(records.length, rowErrors.length, baseline, guard)

  if (!verdict.ok && !overrideGuard) {
    return finish(
      'held',
      {
        created: 0, updated: 0, zeroed: 0,
        recordsProcessed: records.length,
        heldReason: verdict.reason,
        rowErrors, duplicateSkus,
      },
      { heldReason: verdict.reason, rowErrors },
    )
  }

  const now = new Date().toISOString()

  try {
    const counts = await prisma.$transaction(async (tx) => {
      const existing = await tx.moduleItem.findMany({ where: { moduleId } })
      const bySku = new Map<string, (typeof existing)[number]>()
      for (const item of existing) {
        const sku = (item.data as any)?.sku
        if (sku) bySku.set(String(sku), item)
      }

      let created = 0
      let updated = 0
      const seen = new Set<string>()

      for (const rec of records) {
        seen.add(rec.sku)
        const match = bySku.get(rec.sku)
        const prev = (match?.data as any) || {}

        // Demand is never in a 3PL stock feed; it is maintained locally in
        // Nexus, so it and any other locally-managed field must survive.
        const { coverageMonths, status } = gradeInventory(rec.available, prev.monthlyDemand)

        const data = {
          ...prev,
          sku: rec.sku,
          name: rec.name || prev.name || rec.sku,
          brand: rec.brand || prev.brand || '',
          onHand: rec.onHand,
          committed: rec.committed,
          available: rec.available,
          coverageMonths,
          status,
          warehouse,
          source,
          lastSyncedAt: now,
          // The SKU is back in the file, so it is no longer missing.
          missingSince: null,
        }

        if (match) {
          await tx.moduleItem.update({ where: { id: match.id }, data: { data, status } })
          updated++
        } else {
          await tx.moduleItem.create({ data: { moduleId, data, status } })
          created++
        }
      }

      // Everything the module holds that this snapshot did not mention is now
      // zero at that warehouse. Keep the row and stamp when it first dropped
      // off, so the history stays readable.
      let zeroed = 0
      for (const [sku, item] of bySku) {
        if (seen.has(sku)) continue
        const prev = (item.data as any) || {}
        if (prev.onHand === 0 && prev.available === 0 && prev.missingSince) continue

        const { coverageMonths, status } = gradeInventory(0, prev.monthlyDemand)
        await tx.moduleItem.update({
          where: { id: item.id },
          data: {
            data: {
              ...prev,
              onHand: 0,
              committed: 0,
              available: 0,
              coverageMonths,
              status,
              warehouse,
              source,
              lastSyncedAt: now,
              missingSince: prev.missingSince ?? now,
            },
            status,
          },
        })
        zeroed++
      }

      return { created, updated, zeroed }
    })

    return finish('complete', {
      ...counts,
      recordsProcessed: records.length,
      rowErrors,
      duplicateSkus,
    }, rowErrors.length ? { rowErrors } : undefined)
  } catch (err: any) {
    // The transaction rolled back, so the module is untouched.
    return finish(
      'error',
      {
        created: 0, updated: 0, zeroed: 0,
        recordsProcessed: 0,
        heldReason: err?.message,
        rowErrors, duplicateSkus,
      },
      { message: err?.message },
    )
  }
}
