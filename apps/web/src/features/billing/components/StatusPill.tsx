import { statusPresentation, type Tone } from '../lib/present'

// Tone → colour pair. Every value here is an existing Nexus token; the pill
// borrows the module's palette rather than inventing one of its own, so a
// billing status reads consistently with the same tone used everywhere else
// in the app.
const TONE_COLORS: Record<Tone, { fg: string; bg: string }> = {
  success: { fg: 'var(--success)', bg: 'var(--success-light)' },
  warning: { fg: 'var(--warning)', bg: 'var(--warning-light)' },
  danger:  { fg: 'var(--danger)',  bg: 'var(--danger-light)' },
  accent:  { fg: 'var(--accent)',  bg: 'var(--accent-light)' },
  neutral: { fg: 'var(--text-secondary)', bg: 'var(--bg-subtle)' },
}

/**
 * The subscription status pill.
 *
 * All the deciding — what the label says, what tone it takes, whether it
 * earns the live dot — already happened in `statusPresentation`. This just
 * paints the answer.
 */
export function StatusPill({
  status, accessLevel,
}: { status: string | null; accessLevel: 'full' | 'read_only' | 'locked' }) {
  const { label, tone, live } = statusPresentation(status, accessLevel)
  const { fg, bg } = TONE_COLORS[tone]

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full font-semibold uppercase"
      style={{
        color: fg,
        background: bg,
        fontSize: '11px',
        letterSpacing: '0.06em',
        padding: '3px 10px',
        borderRadius: '999px',
      }}
    >
      {live && (
        <span
          className="live-dot inline-block shrink-0 rounded-full"
          style={{ width: '6px', height: '6px', background: fg }}
        />
      )}
      {label}
    </span>
  )
}
