// apps/web/src/features/billing/lib/format.ts

// ─── Presentation maths ──────────────────────────────────────
// Everything the Overview screen computes lives here rather than inside a
// component, because apps/web has no render-testing tooling — so logic inside
// a component is logic nobody can test. Keeping components thin is what makes
// the coverage gap survivable.

/**
 * Cents → a localised currency string.
 *
 * The ONLY currency renderer in this module. Money arrives as integer cents
 * from the API and must never become a float on the way to the screen: the
 * figure shown has to match the figure charged, to the cent.
 */
export function formatMoney(cents: number, currency = 'usd'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    .format(new Date(iso))
}

/**
 * Whole days from `now` until `iso`, floored at zero.
 *
 * Never negative: "renews in -3 days" is the kind of thing that ships and then
 * gets screenshotted. A date in the past is 0 — the caller decides what to say
 * about it.
 */
export function daysUntil(iso: string | null, now: Date = new Date()): number | null {
  if (!iso) return null
  const ms = new Date(iso).getTime() - now.getTime()
  if (Number.isNaN(ms)) return null
  return Math.max(0, Math.floor(ms / 86_400_000))
}

/// Above this many seats a per-seat bar stops being readable and starts being
/// a texture, so it becomes a single continuous bar instead.
const SEGMENT_CEILING = 24

export interface SeatBar {
  mode: 'segmented' | 'continuous'
  /// One entry per purchased seat, true when occupied. Empty in continuous mode.
  segments: boolean[]
  /// 0-1, clamped. Used by continuous mode and by the accessible label.
  fraction: number
}

export function seatSegments(purchased: number, consumed: number): SeatBar {
  const safePurchased = Math.max(0, purchased)
  // Clamped because a bar drawn past 100% breaks the layout and asserts
  // something false. Overselling is forbidden by a database trigger, so if this
  // ever clamps, the number is wrong rather than the drawing.
  const safeConsumed = Math.min(Math.max(0, consumed), safePurchased)
  const fraction = safePurchased === 0 ? 0 : safeConsumed / safePurchased

  if (safePurchased === 0) return { mode: 'segmented', segments: [], fraction: 0 }
  if (safePurchased > SEGMENT_CEILING) return { mode: 'continuous', segments: [], fraction }

  return {
    mode: 'segmented',
    segments: Array.from({ length: safePurchased }, (_, i) => i < safeConsumed),
    fraction,
  }
}
