import type { PrismaClient } from '@prisma/client'
import { isMailConfigured, sendTeamEmail } from '../../emailAgent/sendMail'
import { renderReportEmail } from './html'
import type { ReportType } from './payload'

// ─── Report distribution ─────────────────────────────────────
// Who a report goes to is derived from the project, not from a list someone has
// to maintain: the PM, the sponsor, and each participating department's lane
// lead. A distribution list that has to be curated is a distribution list that
// goes stale and quietly stops reaching the people who need it.
//
// The outcome is recorded on the report either way. A send that failed and a
// send that never happened must not look the same later.

export interface DistributionEntry {
  channel: 'EMAIL' | 'IN_APP'
  target: string
  status: 'SENT' | 'FAILED' | 'SKIPPED'
  at: string
  reason?: string
}

/**
 * Recipients for a project report: PM, sponsor, and lane leads, deduplicated
 * by email. Members without an email are dropped rather than failing the send.
 */
export async function resolveProjectRecipients(
  prisma: PrismaClient,
  projectId: string,
): Promise<{ email: string; name?: string }[]> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      projectManager: { select: { name: true, email: true } },
      executiveSponsor: { select: { name: true, email: true } },
      departments: { select: { laneLead: { select: { name: true, email: true } } } },
    },
  })
  if (!project) return []

  const candidates = [
    project.projectManager,
    project.executiveSponsor,
    ...project.departments.map((d) => d.laneLead),
  ]
  return dedupe(candidates)
}

/**
 * Recipients for a department report: that department's lead and its lane leads
 * across active projects. Portfolio reports (no department) go to admins and
 * ops managers.
 */
export async function resolveScopeRecipients(
  prisma: PrismaClient,
  orgId: string,
  departmentId: string | null,
): Promise<{ email: string; name?: string }[]> {
  if (departmentId) {
    const members = await prisma.member.findMany({
      where: {
        orgId,
        departmentId,
        role: { in: ['ADMIN', 'OPS_MANAGER', 'DEPT_LEAD', 'PROJECT_LEAD'] },
      },
      select: { name: true, email: true },
    })
    return dedupe(members)
  }

  const members = await prisma.member.findMany({
    where: { orgId, role: { in: ['ADMIN', 'OPS_MANAGER'] } },
    select: { name: true, email: true },
  })
  return dedupe(members)
}

function dedupe(
  people: ({ name: string | null; email: string | null } | null | undefined)[],
): { email: string; name?: string }[] {
  const seen = new Map<string, { email: string; name?: string }>()
  for (const p of people) {
    if (!p?.email) continue
    const key = p.email.toLowerCase()
    if (!seen.has(key)) seen.set(key, { email: p.email, ...(p.name ? { name: p.name } : {}) })
  }
  return [...seen.values()]
}

export interface DistributeResult {
  sent: boolean
  recipientCount: number
  reason?: string
}

/**
 * Send a stored report and record the outcome on the row.
 *
 * Never throws: distribution is the last step of a job that has already done
 * useful work, and a mail outage must not lose a generated report or stop the
 * next department's digest.
 */
export async function distributeReport(
  prisma: PrismaClient,
  reportId: string,
  opts: { now?: Date; baseUrl?: string | null } = {},
): Promise<DistributeResult> {
  const now = opts.now ?? new Date()
  const stamp = now.toISOString()

  const report = await prisma.projectReport.findUnique({
    where: { id: reportId },
    select: {
      id: true, title: true, reportType: true, narrative: true, payload: true,
      projectId: true, scopeDepartmentId: true, orgId: true,
    },
  })
  if (!report) return { sent: false, recipientCount: 0, reason: 'Report not found' }

  const record = async (entries: DistributionEntry[]) => {
    await prisma.projectReport.update({
      where: { id: report.id },
      data: { distribution: entries as unknown as object },
    })
  }

  if (!isMailConfigured()) {
    const reason = 'Email is not configured (Graph credentials or AGENT_MAILBOX missing)'
    await record([{ channel: 'EMAIL', target: '', status: 'SKIPPED', at: stamp, reason }])
    return { sent: false, recipientCount: 0, reason }
  }

  const recipients = report.projectId
    ? await resolveProjectRecipients(prisma, report.projectId)
    : await resolveScopeRecipients(prisma, report.orgId, report.scopeDepartmentId)

  if (recipients.length === 0) {
    const reason = 'No recipients with an email address on this scope'
    await record([{ channel: 'EMAIL', target: '', status: 'SKIPPED', at: stamp, reason }])
    return { sent: false, recipientCount: 0, reason }
  }

  const base = opts.baseUrl ?? process.env.FRONTEND_URL ?? null
  const html = renderReportEmail({
    title: report.title,
    reportType: report.reportType as ReportType,
    narrative: report.narrative,
    payload: report.payload as Record<string, any>,
    viewUrl: base ? `${base.replace(/\/$/, '')}/?report=${report.id}` : null,
  })

  try {
    await sendTeamEmail({ subject: report.title, html, recipients })
    await record(
      recipients.map((r) => ({
        channel: 'EMAIL' as const, target: r.email, status: 'SENT' as const, at: stamp,
      })),
    )
    return { sent: true, recipientCount: recipients.length }
  } catch (err: any) {
    const reason = err?.message ?? 'Unknown mail error'
    console.error(`[reports] distribution failed for ${report.id}:`, reason)
    await record(
      recipients.map((r) => ({
        channel: 'EMAIL' as const, target: r.email, status: 'FAILED' as const, at: stamp, reason,
      })),
    )
    return { sent: false, recipientCount: recipients.length, reason }
  }
}
