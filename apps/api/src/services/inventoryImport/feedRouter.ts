import type { PrismaClient } from '@prisma/client'
import { normalizeFeedConfig, GEODIS_FEED_TYPE, type FeedConfig } from './feedConfig'
import { isSupportedFile } from './parseSheet'

// ─── Inbound mail → data feed routing ────────────────────────
// Decides whether an email arriving at the shared agent mailbox is a supplier
// data feed rather than a human request.
//
// This is the safety boundary for the whole feature. The agent mailbox is wired
// to an autonomous Claude parser that creates tasks and briefs; handing it a
// stock report would produce nonsense actions from a machine-generated file.
// A match here means the caller MUST take the deterministic import path and
// MUST NOT fall through to the executor.

export interface RoutableEmail {
  subject: string
  from: { email: string; name?: string }
  attachments: { name: string; contentType?: string; size?: number }[]
}

export interface MatchedFeed {
  type: string
  integrationId: string
  orgId: string
  config: FeedConfig
  // Name of the attachment that will be imported.
  attachmentName: string
}

// Feed types that route to the deterministic inventory importer. Adding a
// second 3PL means adding its type here and an Integration row.
const INVENTORY_FEED_TYPES = [GEODIS_FEED_TYPE]

function matchesRule(email: RoutableEmail, config: FeedConfig): boolean {
  const from = (email.from.email || '').toLowerCase()
  const subject = (email.subject || '').toLowerCase()
  const wantFrom = config.match.fromContains?.toLowerCase()
  const wantSubject = config.match.subjectContains?.toLowerCase()

  // A feed with no constraints at all would swallow every email in the
  // mailbox, including genuine human requests. Refuse to match rather than
  // let a misconfiguration silently disable the assistant.
  if (!wantFrom && !wantSubject) return false

  if (wantFrom && !from.includes(wantFrom)) return false
  if (wantSubject && !subject.includes(wantSubject)) return false
  return true
}

// Picks the attachment to import. Suppliers routinely attach a logo or a
// signature image alongside the report, so the first attachment is not
// necessarily the right one — take the first with a spreadsheet extension.
export function selectAttachment(email: RoutableEmail): string | null {
  const candidate = email.attachments.find((a) => a.name && isSupportedFile(a.name))
  return candidate?.name ?? null
}

// Returns the matching feed, or null when this email is ordinary mail that
// should continue to the normal agent pipeline.
export async function matchFeed(
  prisma: PrismaClient,
  email: RoutableEmail,
): Promise<MatchedFeed | null> {
  const integrations = await prisma.integration.findMany({
    where: { type: { in: INVENTORY_FEED_TYPES } },
  })

  const matches: MatchedFeed[] = []
  for (const integration of integrations) {
    const config = normalizeFeedConfig(integration.config)
    if (!matchesRule(email, config)) continue

    const attachmentName = selectAttachment(email)
    // The sender and subject matched, so this IS the feed — it just arrived
    // without a usable file. Claim it anyway: passing a supplier's automated
    // report to the AI executor is worse than reporting a missing attachment.
    matches.push({
      type: integration.type,
      integrationId: integration.id,
      orgId: integration.orgId,
      config,
      attachmentName: attachmentName ?? '',
    })
  }

  if (matches.length > 1) {
    throw new Error('AMBIGUOUS_INVENTORY_FEED_MATCH')
  }
  return matches[0] ?? null
}
