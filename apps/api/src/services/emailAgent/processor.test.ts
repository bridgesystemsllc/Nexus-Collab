import { describe, it, expect, vi, beforeEach } from 'vitest'

// The safety boundary this file exists to protect: an email claimed by a
// supplier data feed must be imported deterministically and must NEVER reach
// the Claude parser or the autonomous executor. If this suite ever fails,
// machine-generated spreadsheets are being interpreted as human instructions.

const parseEmailWithClaude = vi.fn()
const executeActionPlan = vi.fn()
const setExecutorPrisma = vi.fn()
const sendConfirmationEmail = vi.fn()
const fetchEmailById = vi.fn()
const matchFeed = vi.fn()
const handleFeedEmail = vi.fn()

vi.mock('./fetcher', () => ({ fetchEmailById: (...a: any[]) => fetchEmailById(...a) }))
vi.mock('./claudeParser', () => ({
  parseEmailWithClaude: (...a: any[]) => parseEmailWithClaude(...a),
}))
vi.mock('./executor', () => ({
  executeActionPlan: (...a: any[]) => executeActionPlan(...a),
  setExecutorPrisma: (...a: any[]) => setExecutorPrisma(...a),
}))
vi.mock('./confirmationSender', () => ({
  sendConfirmationEmail: (...a: any[]) => sendConfirmationEmail(...a),
}))
vi.mock('../inventoryImport/feedRouter', () => ({ matchFeed: (...a: any[]) => matchFeed(...a) }))
vi.mock('../inventoryImport/handleFeedEmail', () => ({
  handleFeedEmail: (...a: any[]) => handleFeedEmail(...a),
}))

import { processIncomingEmail, setProcessorPrisma } from './processor'

const FEED_EMAIL = {
  messageId: 'msg-1',
  subject: 'Daily Inventory Report',
  from: { email: 'noreply@geodis.com', name: 'Geodis' },
  bodyText: 'Attached is your daily stock position.',
  attachments: [
    { id: 'a1', name: 'stock.csv', contentType: 'text/csv', size: 120, contentBytes: 'SXRlbQo=' },
  ],
  receivedAt: new Date().toISOString(),
}

const HUMAN_EMAIL = {
  ...FEED_EMAIL,
  messageId: 'msg-2',
  subject: 'Please create a brief for the Ambi relaunch',
  from: { email: 'ahmad@bridgesystemsllc.com', name: 'Ahmad' },
  attachments: [],
}

function fakePrisma(): any {
  const emailAgentLog = {
    findFirst: vi.fn(async () => null),
    create: vi.fn(async () => ({ id: 'log-1' })),
    update: vi.fn(async () => ({})),
  }
  return {
    emailAgentLog,
    member: { findFirst: vi.fn(async () => null) },
    department: { findFirst: vi.fn(async () => null) },
    departmentModule: { findMany: vi.fn(async () => []) },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.AUTHORIZED_SENDERS
  setProcessorPrisma(fakePrisma())
})

describe('processIncomingEmail — feed emails bypass the AI pipeline', () => {
  it('routes a matched email to the importer and never calls the executor', async () => {
    fetchEmailById.mockResolvedValue(FEED_EMAIL)
    matchFeed.mockResolvedValue({
      type: 'GEODIS_INVENTORY_FEED',
      integrationId: 'int-1',
      config: { warehouse: 'GEODIS' },
      attachmentName: 'stock.csv',
    })
    handleFeedEmail.mockResolvedValue({ ok: true, status: 'complete', message: 'Imported.' })

    await processIncomingEmail('msg-1')

    expect(handleFeedEmail).toHaveBeenCalledTimes(1)
    // The whole point of the branch:
    expect(parseEmailWithClaude).not.toHaveBeenCalled()
    expect(executeActionPlan).not.toHaveBeenCalled()
    expect(sendConfirmationEmail).not.toHaveBeenCalled()
  })

  it('decodes the attachment from base64 before handing it to the importer', async () => {
    fetchEmailById.mockResolvedValue(FEED_EMAIL)
    matchFeed.mockResolvedValue({
      type: 'GEODIS_INVENTORY_FEED',
      integrationId: 'int-1',
      config: { warehouse: 'GEODIS' },
      attachmentName: 'stock.csv',
    })
    handleFeedEmail.mockResolvedValue({ ok: true, status: 'complete', message: 'ok' })

    await processIncomingEmail('msg-1')

    const arg = handleFeedEmail.mock.calls[0][0]
    expect(arg.attachment.name).toBe('stock.csv')
    expect(Buffer.isBuffer(arg.attachment.content)).toBe(true)
    expect(arg.attachment.content.toString('utf8')).toBe('Item\n')
  })

  it('passes a null attachment when the named file is not on the message', async () => {
    fetchEmailById.mockResolvedValue({ ...FEED_EMAIL, attachments: [] })
    matchFeed.mockResolvedValue({
      type: 'GEODIS_INVENTORY_FEED',
      integrationId: 'int-1',
      config: { warehouse: 'GEODIS' },
      attachmentName: '',
    })
    handleFeedEmail.mockResolvedValue({ ok: false, status: 'file_error', message: 'no file' })

    await processIncomingEmail('msg-1')

    expect(handleFeedEmail.mock.calls[0][0].attachment).toBeNull()
    expect(executeActionPlan).not.toHaveBeenCalled()
  })

  it('still bypasses the executor when the import itself fails', async () => {
    fetchEmailById.mockResolvedValue(FEED_EMAIL)
    matchFeed.mockResolvedValue({
      type: 'GEODIS_INVENTORY_FEED',
      integrationId: 'int-1',
      config: { warehouse: 'GEODIS' },
      attachmentName: 'stock.csv',
    })
    handleFeedEmail.mockResolvedValue({ ok: false, status: 'held', message: 'held' })

    await processIncomingEmail('msg-1')

    expect(parseEmailWithClaude).not.toHaveBeenCalled()
    expect(executeActionPlan).not.toHaveBeenCalled()
  })
})

describe('processIncomingEmail — feed authorization', () => {
  it('admits a feed sender that is NOT on AUTHORIZED_SENDERS', async () => {
    // The feed's own sender rule is the grant. Adding the 3PL to
    // AUTHORIZED_SENDERS would also hand it the autonomous executor.
    process.env.AUTHORIZED_SENDERS = 'ahmad@bridgesystemsllc.com'
    fetchEmailById.mockResolvedValue(FEED_EMAIL)
    matchFeed.mockResolvedValue({
      type: 'GEODIS_INVENTORY_FEED',
      integrationId: 'int-1',
      config: { warehouse: 'GEODIS' },
      attachmentName: 'stock.csv',
    })
    handleFeedEmail.mockResolvedValue({ ok: true, status: 'complete', message: 'ok' })

    await processIncomingEmail('msg-1')

    expect(handleFeedEmail).toHaveBeenCalledTimes(1)
  })

  it('still rejects an unauthorized human sender', async () => {
    process.env.AUTHORIZED_SENDERS = 'ahmad@bridgesystemsllc.com'
    fetchEmailById.mockResolvedValue({ ...HUMAN_EMAIL, from: { email: 'stranger@example.com' } })
    matchFeed.mockResolvedValue(null)

    await processIncomingEmail('msg-2')

    expect(parseEmailWithClaude).not.toHaveBeenCalled()
    expect(handleFeedEmail).not.toHaveBeenCalled()
  })
})

describe('processIncomingEmail — human emails are unaffected', () => {
  it('sends an unmatched email through the Claude pipeline as before', async () => {
    fetchEmailById.mockResolvedValue(HUMAN_EMAIL)
    matchFeed.mockResolvedValue(null)
    parseEmailWithClaude.mockResolvedValue({
      intent_summary: 'Create a brief',
      confidence: 0.9,
      requires_clarification: false,
    })
    executeActionPlan.mockResolvedValue([{ success: true }])

    await processIncomingEmail('msg-2')

    expect(parseEmailWithClaude).toHaveBeenCalledTimes(1)
    expect(executeActionPlan).toHaveBeenCalledTimes(1)
    expect(handleFeedEmail).not.toHaveBeenCalled()
  })

  it('does not execute when the parser asks for clarification', async () => {
    fetchEmailById.mockResolvedValue(HUMAN_EMAIL)
    matchFeed.mockResolvedValue(null)
    parseEmailWithClaude.mockResolvedValue({
      requires_clarification: true,
      clarification_question: 'Which brand?',
      confidence: 0.4,
    })

    await processIncomingEmail('msg-2')

    expect(executeActionPlan).not.toHaveBeenCalled()
    expect(sendConfirmationEmail).toHaveBeenCalledTimes(1)
  })
})

describe('processIncomingEmail — deduplication', () => {
  it('skips a message that was already processed, feed or not', async () => {
    const prisma = fakePrisma()
    prisma.emailAgentLog.findFirst = vi.fn(async () => ({ id: 'existing' }))
    setProcessorPrisma(prisma)

    fetchEmailById.mockResolvedValue(FEED_EMAIL)
    matchFeed.mockResolvedValue({
      type: 'GEODIS_INVENTORY_FEED',
      integrationId: 'int-1',
      config: { warehouse: 'GEODIS' },
      attachmentName: 'stock.csv',
    })

    await processIncomingEmail('msg-1')

    expect(handleFeedEmail).not.toHaveBeenCalled()
    expect(parseEmailWithClaude).not.toHaveBeenCalled()
  })
})
