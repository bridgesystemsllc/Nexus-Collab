import { describe, it, expect } from 'vitest'
import { parsePastedEmail, parseEmlBuffer } from './emailParse'

describe('parsePastedEmail', () => {
  it('reads the headers a forwarded vendor reply actually carries', () => {
    const parsed = parsePastedEmail(
      [
        'From: supplier@vendor.com',
        'To: ops@kareve.com, planning@kareve.com',
        'Cc: buyer@kareve.com',
        'Subject: RE: PO V09302025 — tube ETA',
        'Date: Mon, 24 Aug 2026 09:15:00 -0400',
        '',
        'Tubes ship the 12th.',
        'Confirmed with the plant.',
      ].join('\n'),
    )
    expect(parsed.fromAddress).toBe('supplier@vendor.com')
    expect(parsed.toAddresses).toEqual(['ops@kareve.com', 'planning@kareve.com'])
    expect(parsed.ccAddresses).toEqual(['buyer@kareve.com'])
    expect(parsed.subject).toBe('RE: PO V09302025 — tube ETA')
    expect(parsed.sentAt?.toISOString()).toBe('2026-08-24T13:15:00.000Z')
    expect(parsed.bodyText).toBe('Tubes ship the 12th.\nConfirmed with the plant.')
  })

  it('accepts the Sent: header Outlook writes instead of Date:', () => {
    const parsed = parsePastedEmail('From: a@b.com\nSent: Mon, 24 Aug 2026 09:15:00 -0400\n\nbody')
    expect(parsed.sentAt?.toISOString()).toBe('2026-08-24T13:15:00.000Z')
  })

  it('keeps a paste with no headers at all as the body, rather than rejecting it', () => {
    const parsed = parsePastedEmail('the vendor says the tubes ship on the 12th')
    expect(parsed.subject).toBeNull()
    expect(parsed.fromAddress).toBeNull()
    expect(parsed.bodyText).toBe('the vendor says the tubes ship on the 12th')
  })

  it('does not mistake a quoted reply chain lower down for headers', () => {
    const parsed = parsePastedEmail(
      ['From: a@b.com', 'Subject: First', '', 'See below.', '', 'From: c@d.com', 'Subject: Second'].join('\n'),
    )
    expect(parsed.subject).toBe('First')
    expect(parsed.bodyText).toContain('From: c@d.com')
  })

  it('survives an unparseable date without losing the email', () => {
    const parsed = parsePastedEmail('From: a@b.com\nDate: sometime last week\n\nbody')
    expect(parsed.sentAt).toBeNull()
    expect(parsed.bodyText).toBe('body')
  })

  it('handles an empty paste', () => {
    expect(parsePastedEmail('').bodyText).toBe('')
  })
})

describe('parseEmlBuffer', () => {
  it('unfolds continued headers so a wrapped subject survives', () => {
    const eml = [
      'Message-ID: <abc123@vendor.com>',
      'From: supplier@vendor.com',
      'Subject: RE: PO V09302025 tube ETA and the',
      '  revised carton quantity',
      'Date: Mon, 24 Aug 2026 09:15:00 -0400',
      '',
      'Body here.',
    ].join('\r\n')
    const parsed = parseEmlBuffer(Buffer.from(eml, 'utf8'))
    expect(parsed.messageId).toBe('<abc123@vendor.com>')
    expect(parsed.subject).toBe('RE: PO V09302025 tube ETA and the revised carton quantity')
    expect(parsed.bodyText).toBe('Body here.')
  })

  it('counts attachments without extracting them', () => {
    const eml = [
      'From: a@b.com',
      'Subject: With files',
      'Content-Type: multipart/mixed; boundary="XYZ"',
      '',
      '--XYZ',
      'Content-Type: text/plain',
      '',
      'see attached',
      '--XYZ',
      'Content-Disposition: attachment; filename="eta.pdf"',
      '',
      'JVBER',
      '--XYZ',
      'Content-Disposition: attachment; filename="po.xlsx"',
      '',
      'UEsDB',
      '--XYZ--',
    ].join('\r\n')
    expect(parseEmlBuffer(Buffer.from(eml, 'utf8')).attachmentCount).toBe(2)
  })

  it('reports no attachments for a plain email', () => {
    expect(parseEmlBuffer(Buffer.from('From: a@b.com\r\n\r\nhi', 'utf8')).attachmentCount).toBe(0)
  })
})
