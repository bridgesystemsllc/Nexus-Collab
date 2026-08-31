import { describe, it, expect } from 'vitest'
import { matchFeed, selectAttachment, type RoutableEmail } from './feedRouter'
import { GEODIS_FEED_TYPE, DEFAULT_GEODIS_CONFIG } from './feedConfig'

// Minimal stand-in for the Prisma client: matchFeed only reads integrations.
function fakePrisma(integrations: any[]): any {
  return { integration: { findMany: async () => integrations } }
}

const geodisIntegration = (config: any = DEFAULT_GEODIS_CONFIG) => ({
  id: 'int-1',
  orgId: 'org-1',
  type: GEODIS_FEED_TYPE,
  config,
})

function email(overrides: Partial<RoutableEmail> = {}): RoutableEmail {
  return {
    subject: 'Daily Inventory Report',
    from: { email: 'noreply@geodis.com', name: 'Geodis' },
    attachments: [{ name: 'stock.xlsx' }],
    ...overrides,
  }
}

describe('selectAttachment', () => {
  it('picks the spreadsheet, not a signature image attached alongside it', () => {
    const chosen = selectAttachment(
      email({ attachments: [{ name: 'logo.png' }, { name: 'stock.xlsx' }] }),
    )
    expect(chosen).toBe('stock.xlsx')
  })

  it('accepts csv', () => {
    expect(selectAttachment(email({ attachments: [{ name: 'stock.csv' }] }))).toBe('stock.csv')
  })

  it('returns null when nothing is a spreadsheet', () => {
    expect(selectAttachment(email({ attachments: [{ name: 'report.pdf' }] }))).toBeNull()
    expect(selectAttachment(email({ attachments: [] }))).toBeNull()
  })
})

describe('matchFeed — positive matching', () => {
  it('claims an email matching both sender and subject', async () => {
    const match = await matchFeed(fakePrisma([geodisIntegration()]), email())
    expect(match).not.toBeNull()
    expect(match!.type).toBe(GEODIS_FEED_TYPE)
    expect(match!.orgId).toBe('org-1')
    expect(match!.attachmentName).toBe('stock.xlsx')
  })

  it('matches case-insensitively', async () => {
    const match = await matchFeed(
      fakePrisma([geodisIntegration()]),
      email({ subject: 'DAILY INVENTORY REPORT', from: { email: 'NoReply@GEODIS.com' } }),
    )
    expect(match).not.toBeNull()
  })

  it('claims a matching email even with no usable attachment', async () => {
    // Passing a supplier's automated report to the AI executor would be worse
    // than reporting a missing file, so the feed still takes ownership.
    const match = await matchFeed(
      fakePrisma([geodisIntegration()]),
      email({ attachments: [{ name: 'report.pdf' }] }),
    )
    expect(match).not.toBeNull()
    expect(match!.attachmentName).toBe('')
  })
})

describe('matchFeed — negative matching', () => {
  it('ignores a human email from a colleague', async () => {
    const match = await matchFeed(
      fakePrisma([geodisIntegration()]),
      email({
        subject: 'Can you make a task for the Ambi relaunch?',
        from: { email: 'ahmad@bridgesystemsllc.com' },
        attachments: [],
      }),
    )
    expect(match).toBeNull()
  })

  it('ignores the right sender with an unrelated subject', async () => {
    const match = await matchFeed(
      fakePrisma([geodisIntegration()]),
      email({ subject: 'Invoice 88213 attached' }),
    )
    expect(match).toBeNull()
  })

  it('ignores the right subject from the wrong sender', async () => {
    const match = await matchFeed(
      fakePrisma([geodisIntegration()]),
      email({ from: { email: 'someone@example.com' } }),
    )
    expect(match).toBeNull()
  })

  it('returns null when no feeds are configured', async () => {
    expect(await matchFeed(fakePrisma([]), email())).toBeNull()
  })
})

describe('matchFeed — misconfiguration safety', () => {
  it('fails closed when the same shared-mailbox rule matches multiple workspaces', async () => {
    await expect(matchFeed(
      fakePrisma([
        geodisIntegration(),
        { ...geodisIntegration(), id: 'int-2', orgId: 'org-2' },
      ]),
      email(),
    )).rejects.toThrow('AMBIGUOUS_INVENTORY_FEED_MATCH')
  })

  it('refuses to match when the feed has no constraints at all', async () => {
    // An unconstrained feed would swallow every email in the shared mailbox,
    // silently disabling the assistant for human requests.
    const unconstrained = geodisIntegration({
      ...DEFAULT_GEODIS_CONFIG,
      match: { fromContains: '', subjectContains: '' },
    })
    // normalizeFeedConfig restores defaults for blank strings, so assert on
    // the behaviour that matters: a genuinely unrelated email is not claimed.
    const match = await matchFeed(
      fakePrisma([unconstrained]),
      email({
        subject: 'lunch tomorrow?',
        from: { email: 'colleague@bridgesystemsllc.com' },
        attachments: [],
      }),
    )
    expect(match).toBeNull()
  })

  it('honours a sender-only rule', async () => {
    const senderOnly = geodisIntegration({
      ...DEFAULT_GEODIS_CONFIG,
      match: { fromContains: 'geodis.com', subjectContains: undefined },
    })
    const match = await matchFeed(
      fakePrisma([senderOnly]),
      email({ subject: 'anything at all' }),
    )
    expect(match).not.toBeNull()
  })
})
