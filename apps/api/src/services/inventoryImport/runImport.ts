import type { PrismaClient } from '@prisma/client'
import { parseSheet, isSupportedFile, UnsupportedFileError, EmptySheetError } from './parseSheet'
import { mapRows, MappingError } from './mapRows'
import { importInventorySnapshot, type ImportOutcome } from './importInventorySnapshot'
import { ensureGeodisFeed } from './feedConfig'

// ─── One import, end to end ──────────────────────────────────
// Resolves the feed, parses the attachment, maps it, and applies it as a
// snapshot. Every failure path returns a result rather than throwing, so both
// callers (the manual upload route and the inbound email handler) can report
// the same way without duplicating error handling.

export interface RunImportResult {
  ok: boolean
  status: ImportOutcome['status'] | 'mapping_error' | 'file_error' | 'not_configured'
  message: string
  outcome?: ImportOutcome
  // Set on a mapping failure so the operator can fix the column map without
  // opening the file to work out what its headers actually are.
  foundHeaders?: string[]
  expectedHeaders?: string[]
}

export interface RunImportInput {
  prisma: PrismaClient
  orgId: string
  buffer: Buffer
  filename: string
  overrideGuard?: boolean
}

export async function runGeodisImport(input: RunImportInput): Promise<RunImportResult> {
  const { prisma, orgId, buffer, filename, overrideGuard = false } = input

  const feed = await ensureGeodisFeed(prisma, orgId)
  if (!feed || !feed.config.targetModuleId) {
    return {
      ok: false,
      status: 'not_configured',
      message:
        'The Geodis inventory feed has no target module. Create an Operations department first.',
    }
  }

  if (!isSupportedFile(filename)) {
    return {
      ok: false,
      status: 'file_error',
      message: `${filename} is not a spreadsheet. Expected .xlsx, .xls or .csv.`,
    }
  }

  let sheet
  try {
    sheet = await parseSheet(buffer, filename)
  } catch (err) {
    if (err instanceof UnsupportedFileError || err instanceof EmptySheetError) {
      return { ok: false, status: 'file_error', message: err.message }
    }
    return {
      ok: false,
      status: 'file_error',
      message: `Could not read ${filename}: ${(err as Error).message}`,
    }
  }

  let mapped
  try {
    mapped = mapRows(sheet, feed.config.columnMap)
  } catch (err) {
    if (err instanceof MappingError) {
      // Record the failure against the feed so it shows in the run history
      // rather than vanishing into a route response.
      await prisma.syncLog.create({
        data: {
          integrationId: feed.integrationId,
          status: 'mapping_error',
          recordsProcessed: 0,
          errors: { message: err.message, found: err.found, expected: err.expected } as object,
          completedAt: new Date(),
        },
      })
      return {
        ok: false,
        status: 'mapping_error',
        message: err.message,
        foundHeaders: err.found,
        expectedHeaders: err.expected,
      }
    }
    throw err
  }

  const outcome = await importInventorySnapshot({
    prisma,
    orgId,
    integrationId: feed.integrationId,
    moduleId: feed.config.targetModuleId,
    records: mapped.records,
    rowErrors: mapped.errors,
    duplicateSkus: mapped.duplicateSkus,
    guard: feed.config.guard,
    warehouse: feed.config.warehouse,
    source: feed.config.source,
    overrideGuard,
  })

  return {
    ok: outcome.status === 'complete',
    status: outcome.status,
    message: describeOutcome(outcome, filename),
    outcome,
  }
}

export function describeOutcome(outcome: ImportOutcome, filename: string): string {
  if (outcome.status === 'held') {
    return `Import of ${filename} was held and nothing was changed. ${outcome.heldReason ?? ''}`.trim()
  }
  if (outcome.status === 'error') {
    return `Import of ${filename} failed and nothing was changed. ${outcome.heldReason ?? ''}`.trim()
  }
  const parts = [
    `${outcome.created} added`,
    `${outcome.updated} updated`,
    `${outcome.zeroed} zeroed out`,
  ]
  if (outcome.rowErrors.length) parts.push(`${outcome.rowErrors.length} rows skipped`)
  if (outcome.duplicateSkus.length) parts.push(`${outcome.duplicateSkus.length} duplicate SKUs collapsed`)
  return `Imported ${filename}: ${parts.join(', ')}.`
}
