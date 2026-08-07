import type { PrismaClient } from '@prisma/client'
import { partsInZone, zonedWallClockToUtc, PROJECT_TZ } from '../cadence'
import { generatePortfolioReport, generateProjectReport } from './generate'
import { distributeReport } from './distribute'
import type { ReportType } from './payload'

// ─── Scheduled reports ───────────────────────────────────────
// Runs hourly and decides for itself whether this is the hour to act, the same
// shape as the check-in engine. Everything is expressed in America/New_York:
// "Monday 07:00" means Monday at 7am in New York whether or not the server
// agrees, and the schedule must not drift by an hour twice a year.
//
// Idempotent by construction. Before generating anything it looks for a report
// of the same type, scope, and period that already exists. A double-run, a
// restart mid-job, or a redeploy at 07:00 on a Monday costs nothing.

export const DEPARTMENT_DIGEST_HOUR_ET = 7 // spec §4.6: emailed Monday 07:00 ET
export const STATUS_UPDATE_HOUR_ET = 8
export const EXECUTIVE_ROLLUP_HOUR_ET = 8
const MONDAY = 1

export interface ScheduleResult {
  generated: number
  distributed: number
  skipped: number
  errors: string[]
}

/** Midnight ET on the given ET calendar date, as a UTC instant. */
function etMidnight(year: number, month: number, day: number): Date {
  return zonedWallClockToUtc(year, month, day, 0, 0, PROJECT_TZ)
}

/**
 * The seven ET days ending at the start of today. A Monday-morning digest
 * covers the previous Monday through Sunday, not a rolling 168 hours — the
 * period boundaries are what make two runs produce the same report.
 *
 * The start is stepped back seven *calendar* days and then resolved to ET
 * midnight. Subtracting 7 × 86,400,000 ms would be wrong twice a year: a week
 * containing a DST change is 167 or 169 hours, so the fixed-ms subtraction
 * lands at 23:00 or 01:00 rather than midnight.
 */
export function weeklyPeriod(now: Date): { start: Date; end: Date } {
  const p = partsInZone(now, PROJECT_TZ)
  const end = etMidnight(p.year, p.month, p.day)

  // Calendar arithmetic in plain UTC — Date.UTC normalises month and year
  // rollover — then read the resulting date back and resolve it in ET.
  const back = new Date(Date.UTC(p.year, p.month - 1, p.day - 7))
  const start = etMidnight(back.getUTCFullYear(), back.getUTCMonth() + 1, back.getUTCDate())

  return { start, end }
}

/** The previous whole ET calendar month. */
export function monthlyPeriod(now: Date): { start: Date; end: Date } {
  const p = partsInZone(now, PROJECT_TZ)
  const end = etMidnight(p.year, p.month, 1)
  const prevMonth = p.month === 1 ? 12 : p.month - 1
  const prevYear = p.month === 1 ? p.year - 1 : p.year
  return { start: etMidnight(prevYear, prevMonth, 1), end }
}

/**
 * Has this exact report already been produced? Matched on type, scope and
 * period start rather than on "was one made today", so a retry an hour later
 * still recognises its own earlier work.
 */
async function alreadyExists(
  prisma: PrismaClient,
  where: {
    orgId: string
    reportType: ReportType
    scopeDepartmentId: string | null
    projectId?: string | null
    periodStart: Date
  },
): Promise<boolean> {
  const found = await prisma.projectReport.findFirst({
    where: {
      orgId: where.orgId,
      reportType: where.reportType,
      scopeDepartmentId: where.scopeDepartmentId,
      ...(where.projectId !== undefined ? { projectId: where.projectId } : {}),
      periodStart: where.periodStart,
    },
    select: { id: true },
  })
  return !!found
}

export async function runReportSchedule(
  prisma: PrismaClient,
  opts: { now?: Date } = {},
): Promise<ScheduleResult> {
  const now = opts.now ?? new Date()
  const et = partsInZone(now, PROJECT_TZ)
  const result: ScheduleResult = { generated: 0, distributed: 0, skipped: 0, errors: [] }

  const orgs = await prisma.organization.findMany({ select: { id: true } })

  for (const org of orgs) {
    // ── Department digests — Monday 07:00 ET ──
    if (et.weekday === MONDAY && et.hour === DEPARTMENT_DIGEST_HOUR_ET) {
      const period = weeklyPeriod(now)
      const departments = await prisma.department.findMany({
        where: { orgId: org.id, archived: false },
        select: { id: true, name: true },
      })
      for (const dept of departments) {
        try {
          if (await alreadyExists(prisma, {
            orgId: org.id, reportType: 'DEPARTMENT_DIGEST',
            scopeDepartmentId: dept.id, periodStart: period.start,
          })) { result.skipped++; continue }

          const report = await generatePortfolioReport(prisma, {
            reportType: 'DEPARTMENT_DIGEST',
            departmentId: dept.id,
            orgId: org.id,
            period,
            now,
          })
          result.generated++
          const sent = await distributeReport(prisma, report.reportId, { now })
          if (sent.sent) result.distributed++
        } catch (err: any) {
          result.errors.push(`${dept.name} digest: ${err?.message ?? err}`)
        }
      }
    }

    // ── Portfolio status update — Monday 08:00 ET ──
    if (et.weekday === MONDAY && et.hour === STATUS_UPDATE_HOUR_ET) {
      const period = weeklyPeriod(now)
      try {
        if (await alreadyExists(prisma, {
          orgId: org.id, reportType: 'STATUS_UPDATE',
          scopeDepartmentId: null, periodStart: period.start,
        })) {
          result.skipped++
        } else {
          const report = await generatePortfolioReport(prisma, {
            reportType: 'STATUS_UPDATE', departmentId: null, orgId: org.id, period, now,
          })
          result.generated++
          const sent = await distributeReport(prisma, report.reportId, { now })
          if (sent.sent) result.distributed++
        }
      } catch (err: any) {
        result.errors.push(`status update: ${err?.message ?? err}`)
      }
    }

    // ── Executive rollup — 1st of the month, 08:00 ET ──
    if (et.day === 1 && et.hour === EXECUTIVE_ROLLUP_HOUR_ET) {
      const period = monthlyPeriod(now)
      try {
        if (await alreadyExists(prisma, {
          orgId: org.id, reportType: 'EXECUTIVE_ROLLUP',
          scopeDepartmentId: null, periodStart: period.start,
        })) {
          result.skipped++
        } else {
          const report = await generatePortfolioReport(prisma, {
            reportType: 'EXECUTIVE_ROLLUP', departmentId: null, orgId: org.id, period, now,
          })
          result.generated++
          const sent = await distributeReport(prisma, report.reportId, { now })
          if (sent.sent) result.distributed++
        }
      } catch (err: any) {
        result.errors.push(`executive rollup: ${err?.message ?? err}`)
      }
    }
  }

  // ── Closeouts — every run, for projects that completed without one ──
  // Not tied to an hour: a project completes when it completes, and the record
  // of what it delivered should not wait for Monday.
  result.errors.push(...(await generateMissingCloseouts(prisma, now, result)))

  return result
}

async function generateMissingCloseouts(
  prisma: PrismaClient,
  now: Date,
  result: ScheduleResult,
): Promise<string[]> {
  const errors: string[] = []

  const completed = await prisma.project.findMany({
    where: {
      status: 'COMPLETED',
      deletedAt: null,
      // Only recent completions, so enabling this feature does not fire a
      // backlog of closeouts at everyone for projects finished long ago.
      actualEndDate: { gte: new Date(now.getTime() - 30 * 86_400_000) },
      reports: { none: { reportType: 'CLOSEOUT' } },
    },
    select: { id: true, title: true, orgId: true },
    take: 20,
  })

  for (const project of completed) {
    try {
      const report = await generateProjectReport(prisma, {
        projectId: project.id,
        reportType: 'CLOSEOUT',
        orgId: project.orgId,
        now,
      })
      result.generated++
      const sent = await distributeReport(prisma, report.reportId, { now })
      if (sent.sent) result.distributed++
    } catch (err: any) {
      errors.push(`closeout ${project.title}: ${err?.message ?? err}`)
    }
  }

  return errors
}
