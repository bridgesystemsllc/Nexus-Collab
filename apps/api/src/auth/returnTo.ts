/**
 * Validates a returnTo URL to prevent open-redirect attacks.
 *
 * Returns the raw value only when it is a string, 1..2048 chars, starts with "/",
 * does not start with "//" or "/\\", contains no "\\", no control chars, no scheme,
 * and does not start with "/api/". Everything else returns null.
 */
export function safeReturnTo(raw: unknown): string | null {
  if (typeof raw !== 'string') return null

  const len = raw.length
  if (len < 1 || len > 2048) return null

  // Must start with exactly one forward slash (not // or /\)
  if (!raw.startsWith('/')) return null
  if (raw.startsWith('//')) return null
  if (raw.startsWith('/\\')) return null

  // No backslashes anywhere (prevents /a\b path injection)
  if (raw.includes('\\')) return null

  // No control characters (ASCII 0-31 or 127)
  for (let i = 0; i < len; i++) {
    const code = raw.charCodeAt(i)
    if (code < 32 || code === 127) return null
  }

  // No scheme (javascript:, data:, etc.) - a scheme would have colon before any slash or question mark
  const colonIdx = raw.indexOf(':')
  if (colonIdx !== -1) {
    // Find the first path delimiter (slash after leading /, or question mark)
    const slashAfterFirst = raw.indexOf('/', 1)
    const queryStart = raw.indexOf('?')
    
    // If colon comes before the query string starts (or no query), and before any other slash,
    // it could be a scheme like javascript: or data:
    const firstDelim = Math.min(
      slashAfterFirst === -1 ? Infinity : slashAfterFirst,
      queryStart === -1 ? Infinity : queryStart
    )
    if (colonIdx < firstDelim) return null
  }

  // Must not start with /api/ (prevents redirect to internal endpoints)
  if (raw.startsWith('/api/')) return null

  return raw
}
