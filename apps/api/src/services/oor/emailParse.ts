// ─── Attached email parsing ─────────────────────────────────
// An email reaches a PO line one of three ways: pasted as text, uploaded as
// .eml, or pulled from the connected mailbox. All three land in the same shape
// so the Emails tab renders one thing.
//
// This is a deliberately small header parser rather than a mail library. What
// arrives here is overwhelmingly a forwarded vendor reply someone selected and
// copied out of Outlook, which is not RFC-clean and never will be — so the
// parser reads what it recognises and keeps the rest as the body instead of
// rejecting it. Losing the vendor's ETA because the paste had no Message-ID
// would defeat the point.

export interface ParsedEmail {
  messageId: string | null
  subject: string | null
  fromAddress: string | null
  toAddresses: string[]
  ccAddresses: string[]
  sentAt: Date | null
  bodyText: string
}

const HEADER_PATTERN = /^([A-Za-z-]+):\s*(.*)$/

const splitAddresses = (value: string): string[] =>
  value
    .split(/[,;]/)
    .map((a) => a.trim())
    .filter(Boolean)

/** Outlook writes "Sent:" where RFC mail writes "Date:"; both mean the same. */
const DATE_HEADERS = new Set(['date', 'sent'])

export function parsePastedEmail(raw: string): ParsedEmail {
  const text = String(raw ?? '').replace(/\r\n/g, '\n')
  const lines = text.split('\n')

  const headers = new Map<string, string>()
  let bodyStart = 0

  // Headers only count while they are unbroken from the top. A "Subject:" that
  // appears forty lines into a quoted reply chain belongs to the body.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (line.trim() === '') {
      bodyStart = i + 1
      break
    }
    const match = line.match(HEADER_PATTERN)
    if (!match) {
      bodyStart = i
      break
    }
    const key = match[1]!.toLowerCase()
    if (!headers.has(key)) headers.set(key, match[2]!.trim())
    bodyStart = i + 1
  }

  const dateHeader = [...headers.entries()].find(([k]) => DATE_HEADERS.has(k))?.[1]
  const sentAt = dateHeader ? new Date(dateHeader) : null

  return {
    messageId: headers.get('message-id') ?? null,
    subject: headers.get('subject') ?? null,
    fromAddress: headers.get('from') ?? null,
    toAddresses: splitAddresses(headers.get('to') ?? ''),
    ccAddresses: splitAddresses(headers.get('cc') ?? ''),
    sentAt: sentAt && !Number.isNaN(sentAt.getTime()) ? sentAt : null,
    bodyText: lines.slice(bodyStart).join('\n').trim(),
  }
}

/**
 * A .eml file is the same grammar with folded headers: a line starting with
 * whitespace continues the one above it. Unfolding first means the same parser
 * handles both, rather than two parsers drifting apart.
 */
export function parseEmlBuffer(buffer: Buffer): ParsedEmail & { attachmentCount: number } {
  const text = buffer.toString('utf8').replace(/\r\n/g, '\n')
  const unfolded = text.replace(/\n[ \t]+/g, ' ')
  const parsed = parsePastedEmail(unfolded)

  // Counting boundaries is enough for the activity chip. Extracting the parts
  // themselves is the mailbox connector's job, not this parser's.
  const boundary = text.match(/boundary="?([^";\n]+)"?/i)?.[1]
  let attachmentCount = 0
  if (boundary) {
    const parts = text.split(`--${boundary}`)
    attachmentCount = parts.filter((p) => /content-disposition:\s*attachment/i.test(p)).length
  }

  return { ...parsed, attachmentCount }
}
