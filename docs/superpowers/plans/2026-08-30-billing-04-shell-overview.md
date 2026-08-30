# Nexus Billing — Phase 4a: Settings Shell + Overview

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A real Billing tab in Settings that renders the org's plan, status and seat usage from live data — the first thing anyone can actually see of the billing module.

**Architecture:** A seventh section in the existing `SettingsPage`, gated on `billing:read` exactly as Access and Audit already are. Everything renders from `GET /api/v1/billing/entitlements`, the one endpoint that exists. No mocks, no placeholder data — a panel with nothing to show says so.

**Tech Stack:** React 18 + Vite + TypeScript · TanStack Query v5 · axios · lucide-react · Tailwind utility classes over CSS variables

**Spec:** `docs/superpowers/plans/2026-08-25-billing-00-master.md` §4.1 and §4.6. Design language: the Ahmad Design System skill.

## Global Constraints

- **Light-only.** Nexus has no dark mode — no `data-theme`, no `prefers-color-scheme`, no `.dark` anywhere in `apps/web`. The design system is deliberately light with warm shadows and restrained radii. **Do not introduce a dark theme for one tab.** The master plan's "dark and light both pass review" criterion is superseded for this module and becomes light-only. Apply the design skill's *craft* — depth, motion, typographic care — within the existing light system.
- **Accent is module-scoped.** `.billing-module { --accent: #7C3AED; ... }` overrides the token for this subtree only. **Never edit the global `--accent`** in `design-system.css` — every other screen depends on `#2F80ED`. This is master-plan delta D7.
- **The client renders; it never decides.** Entitlements arrive so the UI shows the right thing. Every gated action is re-checked server-side. Nothing in this phase may branch on entitlements to grant access to anything.
- **Money is formatted with `Intl.NumberFormat`, never string concatenation**, and only through the `Money` component. A raw `toFixed` in `features/billing` is a defect.
- **Every figure uses `font-variant-numeric: tabular-nums`** so digits don't jitter as they animate or update.
- **Skeletons, never spinners.** Empty states get an illustration and a sentence, never a blank panel.
- **Respect `prefers-reduced-motion`.** Every animation in this phase must degrade to no motion — count-ups render their final value immediately, entrance animations resolve to opacity 1.
- **Typecheck gate is zero errors.** Baseline at `09d708c`: `npx tsc --noEmit -p tsconfig.json` in `apps/api` = 0; `pnpm --filter @nexus/web build` green; `npx vitest run` = 702 / 45 files.
- Do NOT run `pnpm db:push`, `prisma migrate`, or anything touching the database. This phase is frontend only.
- One branch, one PR off `main`. `git fetch` first — the Replit Agent pushes to `main`.

## What exists to build against

```ts
// GET /api/v1/billing/entitlements  — requires permission `billing:read`
interface Entitlements {
  tier: 'starter'|'growth'|'professional'|'enterprise' | null
  status: 'trialing'|'active'|'past_due'|'canceled'|'incomplete'|'incomplete_expired'|'paused' | null
  accessLevel: 'full' | 'read_only' | 'locked'
  features: Record<FeatureKey, boolean>
  limits: {
    seats: { purchased: number; consumed: number; available: number }
    activeBriefs: number | null      // null = unlimited
    apiCallsPerMonth: number | null  // null = unlimited
  }
  inGracePeriod: boolean
  gracePeriodEndsAt: string | null   // ISO 8601
}
```

**An org with no subscription returns `tier: null`, `accessLevel: 'locked'`, all features false, seats `{0,0,0}`.** That is the state your workspace is in today, so it is the state this UI must handle *first* and best — not as an afterthought.

Existing pieces to reuse, not reinvent:
- `apps/web/src/features/settings/pages/SettingsPage.tsx` — the tab shell, its `SECTIONS` array and permission filter
- `apps/web/src/features/settings/components/SettingsPrimitives.tsx` — `Section`, `Alert`, `SectionSkeleton`
- `apps/web/src/lib/api.ts` — the axios instance with `withCredentials` and the 401 interceptor
- `apps/web/src/features/settings/api/settingsApi.ts` — the `normalise()` error envelope pattern; copy the shape, do not import from settings

---

## File Structure

| File | Created / Modified | Responsibility |
|---|---|---|
| `apps/web/src/features/billing/api/billingApi.ts` | Create | Typed client for `/billing/*`, reusing the `ApiError` envelope |
| `apps/web/src/features/billing/hooks/useEntitlements.ts` | Create | TanStack Query hook, 60s stale time |
| `apps/web/src/features/billing/styles/billing.css` | Create | Module-scoped accent, JetBrains Mono, keyframes, reduced-motion guard |
| `apps/web/src/features/billing/components/Money.tsx` | Create | The **only** currency renderer |
| `apps/web/src/features/billing/components/CountUp.tsx` | Create | Number count-up honouring reduced-motion |
| `apps/web/src/features/billing/components/StatusPill.tsx` | Create | Status → colour + label, with a live dot for active |
| `apps/web/src/features/billing/components/SeatUsageBar.tsx` | Create | Segmented bar, animated fill |
| `apps/web/src/features/billing/components/KpiCell.tsx` | Create | One KPI, count-up figure + label |
| `apps/web/src/features/billing/components/DunningBanner.tsx` | Create | `past_due` — non-dismissible, grace countdown |
| `apps/web/src/features/billing/components/NoSubscriptionState.tsx` | Create | The empty state your workspace sees today |
| `apps/web/src/features/billing/sections/OverviewSection.tsx` | Create | Composes the above |
| `apps/web/src/features/settings/pages/SettingsPage.tsx` | Modify | Add the `billing` section gated on `billing:read` |
| `apps/web/src/main.tsx` *(or wherever design-system.css is imported)* | Modify | Import `billing.css` |

---

## Design direction

**This screen's one job:** answer "what am I on, is it healthy, and how much of it am I using?" in under two seconds.

**Hero element:** the tier name and status pill. Everything else is supporting.

**The three KPIs:** Seats used / purchased · Monthly recurring total · Days until renewal. In the no-subscription state these collapse to a single honest empty state rather than three zeros.

**Motion (all reduced-motion aware):**
1. Staggered fade-up on mount, 60ms between cards.
2. KPI figures count up from zero over 600ms with `--ease-spring`.
3. The seat usage bar fills from 0 to its width over 700ms, easing out.

**The "wow" detail:** the seat usage bar is segmented — one cell per purchased seat when the count is ≤ 24, a continuous bar above that — so a 12-of-15 workspace reads its own capacity at a glance without parsing a number. Filled cells carry a faint accent glow; the first unfilled cell pulses gently once on mount to draw the eye to headroom.

**Restraint:** no gradients on text, no glass over glass, no decorative iconography. This is a money screen; it should feel like a bank statement designed by Apple, not a dashboard demo.

## Testing reality — read before writing a test

`apps/web` has `vitest` and a `test` script, and existing suites (`modules/projects/lib/*.test.ts`) are **pure-function tests in the node environment**. There is **no jsdom, no `@testing-library/react`, no `happy-dom`**.

**Ruling:** do not add render-testing tooling in this phase. Instead, every non-trivial decision a component makes is extracted into a pure function in `features/billing/lib/`, and *that* is tested. Components become thin, and the logic that could actually be wrong is covered.

This is a stated coverage gap: **component rendering, hover/focus states and animation are verified by eye, not by test.** Say so in the PR body rather than implying the suite covers them.

---

# PR B9+B10 — `feat/billing-ui-overview`

```bash
cd ~/Nexus-Collab && git fetch origin && git checkout -b feat/billing-ui-overview origin/main
```

---

### Task 1: Pure presentation logic

**Files:**
- Create: `apps/web/src/features/billing/lib/format.ts`, `.../lib/format.test.ts`
- Create: `apps/web/src/features/billing/lib/present.ts`, `.../lib/present.test.ts`

**Interfaces:**
- Produces: `formatMoney(cents, currency?)`, `formatDate(iso)`, `daysUntil(iso, now)`, `seatSegments(purchased, consumed)`, `statusPresentation(status, accessLevel)`, `graceCopy(endsAtIso, now)`. Tasks 3-4 consume all of them.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/src/features/billing/lib/format.test.ts
import { describe, it, expect } from 'vitest'
import { formatMoney, daysUntil, seatSegments } from './format'

// Currency and seat maths are the two places a billing UI lies to someone.
// Both are pure here so they can be tested rather than eyeballed.

describe('formatMoney', () => {
  it('renders whole dollars from cents', () => expect(formatMoney(5900)).toBe('$59.00'))
  it('renders zero as $0.00, never as blank or a dash', () => expect(formatMoney(0)).toBe('$0.00'))
  it('groups thousands', () => expect(formatMoney(1234567)).toBe('$12,345.67'))
  it('never loses a trailing cent to float maths', () => {
    // 2341 cents is the prorated figure in the spec's own example; a float
    // round-trip renders it $23.40 and the number on screen stops matching
    // the number charged.
    expect(formatMoney(2341)).toBe('$23.41')
  })
  it('honours a non-USD currency', () => expect(formatMoney(5900, 'cad')).toContain('59.00'))
})

describe('daysUntil', () => {
  const now = new Date('2026-08-30T12:00:00Z')
  it('counts whole days ahead', () => expect(daysUntil('2026-09-09T12:00:00Z', now)).toBe(10))
  it('is 0 on the day itself', () => expect(daysUntil('2026-08-30T23:00:00Z', now)).toBe(0))
  it('never returns negative — a past date is 0, not -3', () => {
    // "Renews in -3 days" is the kind of thing that ships.
    expect(daysUntil('2026-08-27T12:00:00Z', now)).toBe(0)
  })
  it('returns null for a null date rather than NaN', () => expect(daysUntil(null, now)).toBeNull())
})

describe('seatSegments', () => {
  it('returns one segment per seat when the count is small', () => {
    const s = seatSegments(15, 12)
    expect(s.mode).toBe('segmented')
    expect(s.segments).toHaveLength(15)
    expect(s.segments.filter((f) => f).length).toBe(12)
  })
  it('switches to a continuous bar above the segment ceiling', () => {
    const s = seatSegments(250, 100)
    expect(s.mode).toBe('continuous')
    expect(s.fraction).toBeCloseTo(0.4)
  })
  it('clamps an oversold state to full rather than overflowing', () => {
    // Should be unreachable — the DB trigger forbids it — but a bar drawn at
    // 120% width breaks the layout and tells the user something false.
    const s = seatSegments(10, 12)
    expect(s.fraction).toBe(1)
    expect(s.segments.filter((f) => f).length).toBe(10)
  })
  it('handles the zero-seat case without dividing by zero', () => {
    const s = seatSegments(0, 0)
    expect(s.fraction).toBe(0)
    expect(s.segments).toHaveLength(0)
  })
})
```

```ts
// apps/web/src/features/billing/lib/present.test.ts
import { describe, it, expect } from 'vitest'
import { statusPresentation, graceCopy } from './present'

describe('statusPresentation', () => {
  it('shows active as a success pill with a live dot', () => {
    const p = statusPresentation('active', 'full')
    expect(p.tone).toBe('success')
    expect(p.live).toBe(true)
    expect(p.label).toBe('Active')
  })
  it('shows trialing as accent, not success — a trial is not a paying state', () => {
    expect(statusPresentation('trialing', 'full').tone).toBe('accent')
  })
  it('shows past_due as a warning while access is still full', () => {
    const p = statusPresentation('past_due', 'full')
    expect(p.tone).toBe('warning')
    expect(p.live).toBe(false)
  })
  it('escalates past_due to danger once access is read-only', () => {
    // The visual must change when the grace period actually lapses; a static
    // amber pill through both states hides the moment it starts mattering.
    expect(statusPresentation('past_due', 'read_only').tone).toBe('danger')
  })
  it('shows canceled as neutral, not danger, while access remains', () => {
    expect(statusPresentation('canceled', 'full').tone).toBe('neutral')
  })
  it('describes no subscription without inventing a status', () => {
    const p = statusPresentation(null, 'locked')
    expect(p.label).toBe('No subscription')
    expect(p.tone).toBe('neutral')
  })
})

describe('graceCopy', () => {
  const now = new Date('2026-08-30T12:00:00Z')
  it('names the deadline in days when several remain', () => {
    expect(graceCopy('2026-09-04T12:00:00Z', now)).toContain('5 days')
  })
  it('uses the singular on the last day', () => {
    expect(graceCopy('2026-08-31T12:00:00Z', now)).toContain('1 day')
  })
  it('says access ends today rather than "in 0 days"', () => {
    expect(graceCopy('2026-08-30T20:00:00Z', now)).toMatch(/today/i)
  })
  it('states access is already restricted once the grace period has passed', () => {
    expect(graceCopy('2026-08-28T12:00:00Z', now)).toMatch(/read-only|restricted/i)
  })
})
```

- [ ] **Step 2: Run to verify both fail**

Run: `cd ~/Nexus-Collab/apps/web && npx vitest run src/features/billing/lib`
Expected: FAIL — cannot resolve `./format` and `./present`

- [ ] **Step 3: Implement `format.ts`**

```ts
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
  return Math.max(0, Math.ceil(ms / 86_400_000))
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
```

- [ ] **Step 4: Implement `present.ts`**

```ts
// apps/web/src/features/billing/lib/present.ts
import { daysUntil } from './format'

export type Tone = 'success' | 'warning' | 'danger' | 'accent' | 'neutral'

export interface StatusPresentation {
  label: string
  tone: Tone
  /// Whether to render the pulsing live dot. Only a genuinely healthy paying
  /// subscription earns it — it is a signal, not decoration.
  live: boolean
}

/**
 * Subscription status → what the pill says and how it looks.
 *
 * Takes accessLevel as well as status because the two together are what the
 * user actually experiences. A past_due subscription inside its grace period
 * and one past it are the same status and completely different situations; a
 * single amber pill across both hides the moment it starts to matter.
 */
export function statusPresentation(
  status: string | null,
  accessLevel: 'full' | 'read_only' | 'locked',
): StatusPresentation {
  if (!status) return { label: 'No subscription', tone: 'neutral', live: false }

  switch (status) {
    case 'active':   return { label: 'Active', tone: 'success', live: true }
    // A trial is not a paying state, and colouring it green tells the operator
    // revenue exists where it does not.
    case 'trialing': return { label: 'Trial', tone: 'accent', live: false }
    case 'past_due':
      return accessLevel === 'full'
        ? { label: 'Payment failed', tone: 'warning', live: false }
        : { label: 'Payment overdue', tone: 'danger', live: false }
    case 'canceled':
      return accessLevel === 'full'
        ? { label: 'Cancels at period end', tone: 'neutral', live: false }
        : { label: 'Canceled', tone: 'neutral', live: false }
    case 'paused':             return { label: 'Paused', tone: 'neutral', live: false }
    case 'incomplete':         return { label: 'Awaiting payment', tone: 'warning', live: false }
    case 'incomplete_expired': return { label: 'Setup expired', tone: 'danger', live: false }
    default:                   return { label: status, tone: 'neutral', live: false }
  }
}

/** The dunning banner's sentence. Never "in 0 days". */
export function graceCopy(endsAtIso: string | null, now: Date = new Date()): string {
  const days = daysUntil(endsAtIso, now)
  if (days === null) return 'Your workspace is read-only until the outstanding invoice is paid.'
  if (days === 0) {
    const past = endsAtIso ? new Date(endsAtIso).getTime() < now.getTime() : false
    return past
      ? 'Your workspace is now read-only until the outstanding invoice is paid.'
      : 'Full access ends today unless the outstanding invoice is paid.'
  }
  return `Full access continues for ${days} ${days === 1 ? 'day' : 'days'} while we retry the payment.`
}
```

- [ ] **Step 5: Run to verify both pass**

Run: `cd ~/Nexus-Collab/apps/web && npx vitest run src/features/billing/lib`
Expected: PASS — 19 passed

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/billing/lib
git commit -m "feat(billing-ui): pure presentation logic for money, seats and status"
```

---

### Task 2: The API client and the query hook

**Files:** Create `apps/web/src/features/billing/api/billingApi.ts` and `apps/web/src/features/billing/hooks/useEntitlements.ts`

**Interfaces:** Produces `fetchEntitlements(): Promise<Entitlements>`, the `Entitlements` type, and `useEntitlements()`. Tasks 4-5 consume the hook.

- [ ] **Step 1: Write `billingApi.ts`**

Mirror the error handling in `apps/web/src/features/settings/api/settingsApi.ts` — same `normalise()` shape, same `ApiError` from `@/features/users/api/usersApi`. **Copy the pattern; do not import the settings client**, so billing does not couple to a module it has nothing to do with.

```ts
import { api } from '@/lib/api'
import { ApiError } from '@/features/users/api/usersApi'

export type TierKey = 'starter' | 'growth' | 'professional' | 'enterprise'
export type SubscriptionStatus =
  | 'trialing' | 'active' | 'past_due' | 'canceled'
  | 'incomplete' | 'incomplete_expired' | 'paused'
export type AccessLevel = 'full' | 'read_only' | 'locked'

export interface Entitlements {
  tier: TierKey | null
  status: SubscriptionStatus | null
  accessLevel: AccessLevel
  features: Record<string, boolean>
  limits: {
    seats: { purchased: number; consumed: number; available: number }
    activeBriefs: number | null
    apiCallsPerMonth: number | null
  }
  inGracePeriod: boolean
  gracePeriodEndsAt: string | null
}

function normalise(err: any): never {
  const status = err?.response?.status ?? 0
  const e = err?.response?.data?.error
  if (e) {
    const { code, message, fields, requestId, ...extra } = e
    throw new ApiError(status, code ?? 'UNKNOWN', message ?? 'Request failed', fields, extra)
  }
  throw new ApiError(status, 'NETWORK', err?.message ?? 'Could not reach the server')
}

export async function fetchEntitlements(): Promise<Entitlements> {
  try {
    return (await api.get('/billing/entitlements')).data as Entitlements
  } catch (err) { return normalise(err) }
}
```

- [ ] **Step 2: Write `useEntitlements.ts`**

```ts
import { useQuery } from '@tanstack/react-query'
import { fetchEntitlements } from '../api/billingApi'

// 60s stale time mirrors the server's own entitlement cache TTL. Refetching
// faster would not produce fresher data — it would just add load for an answer
// the API is already holding.
export function useEntitlements() {
  return useQuery({
    queryKey: ['billing', 'entitlements'],
    queryFn: fetchEntitlements,
    staleTime: 60_000,
  })
}
```

- [ ] **Step 3: Typecheck and commit**

Run: `cd ~/Nexus-Collab && pnpm --filter @nexus/web build`
Expected: green.

```bash
git add apps/web/src/features/billing/api apps/web/src/features/billing/hooks
git commit -m "feat(billing-ui): entitlements client and query hook"
```

---

### Task 3: Module styling and the display primitives

**Files:** Create `apps/web/src/features/billing/styles/billing.css`, and components `Money.tsx`, `CountUp.tsx`, `StatusPill.tsx`, `SeatUsageBar.tsx`, `KpiCell.tsx`. Modify `apps/web/src/main.tsx` to import the stylesheet.

- [ ] **Step 1: Write `billing.css`**

```css
/* ─── Billing module ─────────────────────────────────────────
   Scoped overrides only. The global --accent stays #2F80ED because every
   other screen in Nexus depends on it; billing gets Electric Indigo, the
   accent the design system assigns to ERP and operations contexts.

   Nexus is a light-only application — there is no data-theme or
   prefers-color-scheme anywhere in apps/web — so this module is designed for
   light and does not introduce a competing dark surface for one tab.
   ────────────────────────────────────────────────────────── */
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap');

.billing-module {
  --accent: #7C3AED;
  --accent-hover: #6D28D9;
  --accent-light: #F3EEFE;
  --accent-subtle: rgba(124, 58, 237, 0.08);
  --accent-glow: rgba(124, 58, 237, 0.20);
}

/* Every figure on this screen. Tabular figures stop digits from jittering as
   a value counts up or refetches — the difference between a number animating
   and a number twitching. */
.billing-module .numeric {
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1;
  letter-spacing: -0.02em;
}

.billing-module .billing-card {
  background: var(--bg-surface, #fff);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-sm);
  transition: box-shadow var(--transition-normal), border-color var(--transition-normal),
              transform var(--transition-normal);
}
.billing-module .billing-card--interactive:hover {
  border-color: var(--border-strong, var(--border));
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}

/* Staggered entrance. --i is set per card; 60ms apart is enough to read as
   sequence without anyone waiting on it. */
@keyframes billingFadeUp {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
.billing-module .fade-up {
  opacity: 0;
  animation: billingFadeUp 380ms var(--ease-spring) forwards;
  animation-delay: calc(var(--i, 0) * 60ms);
}

/* The live dot: only an active, paying subscription earns it. */
@keyframes billingPulse {
  0%, 100% { opacity: 1;   transform: scale(1); }
  50%      { opacity: 0.45; transform: scale(0.85); }
}
.billing-module .live-dot { animation: billingPulse 2s var(--ease-smooth) infinite; }

/* Seat bar. Filled cells carry a faint accent glow; the first empty cell
   pulses once on mount to point at the headroom. */
.billing-module .seat-cell {
  height: 8px; border-radius: 2px; flex: 1 1 0;
  background: var(--border);
  transition: background var(--transition-normal), box-shadow var(--transition-normal);
}
.billing-module .seat-cell--filled {
  background: var(--accent);
  box-shadow: 0 0 6px var(--accent-glow);
}
@keyframes billingHeadroom {
  0%, 70%, 100% { background: var(--border); }
  85%           { background: var(--accent-subtle); }
}
.billing-module .seat-cell--headroom { animation: billingHeadroom 2.4s var(--ease-smooth) 1; }

.billing-module .seat-fill {
  height: 8px; border-radius: 4px; background: var(--accent);
  box-shadow: 0 0 8px var(--accent-glow);
  transition: width 700ms var(--ease-spring);
}

/* Anyone who has asked the OS to stop moving things gets a static screen —
   final values, no entrance, no pulse. Not a reduced version; none. */
@media (prefers-reduced-motion: reduce) {
  .billing-module .fade-up { opacity: 1; animation: none; }
  .billing-module .live-dot,
  .billing-module .seat-cell--headroom { animation: none; }
  .billing-module .seat-fill { transition: none; }
  .billing-module .billing-card--interactive:hover { transform: none; }
}
```

Add `import './styles/design-system.css'`'s neighbour in `apps/web/src/main.tsx`:
```ts
import './features/billing/styles/billing.css'
```

- [ ] **Step 2: Write the primitives**

`Money.tsx` — the only place currency reaches the DOM:
```tsx
import { formatMoney } from '../lib/format'
export function Money({ cents, currency = 'usd', className = '' }: {
  cents: number; currency?: string; className?: string
}) {
  return <span className={`numeric ${className}`}>{formatMoney(cents, currency)}</span>
}
```

`CountUp.tsx` — honours reduced motion by rendering the final value immediately:
```tsx
import { useEffect, useRef, useState } from 'react'

export function CountUp({ value, duration = 600, className = '' }: {
  value: number; duration?: number; className?: string
}) {
  const reduce = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const [shown, setShown] = useState(reduce ? value : 0)
  const raf = useRef<number>()

  useEffect(() => {
    if (reduce) { setShown(value); return }
    const start = performance.now()
    const from = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration)
      // easeOutCubic — fast then settling, so the final value feels arrived at
      // rather than stopped.
      setShown(Math.round(from + (value - from) * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => { if (raf.current) cancelAnimationFrame(raf.current) }
  }, [value, duration, reduce])

  return <span className={`numeric ${className}`}>{shown}</span>
}
```

`StatusPill.tsx`, `SeatUsageBar.tsx`, `KpiCell.tsx` consume `statusPresentation` and `seatSegments` from Task 1 and render them. `SeatUsageBar` must expose an accessible label (`role="img"` with `aria-label="12 of 15 seats in use"`) — the bar is decorative to a screen reader without it. `KpiCell` renders a `CountUp` figure, a `--text-xs` uppercase label with `0.06em` tracking, and an optional sublabel.

- [ ] **Step 3: Build, then commit**

Run: `cd ~/Nexus-Collab && pnpm --filter @nexus/web build`

```bash
git add apps/web/src/features/billing/styles apps/web/src/features/billing/components apps/web/src/main.tsx
git commit -m "feat(billing-ui): module styling and display primitives"
```

---

### Task 4: The Overview section

**Files:** Create `DunningBanner.tsx`, `NoSubscriptionState.tsx`, `sections/OverviewSection.tsx`

**The state your workspace is actually in — build this first.** `tier: null`, `accessLevel: 'locked'`, seats `{0,0,0}`. `NoSubscriptionState` renders a centred card: a short line ("No subscription on this workspace"), a sentence explaining what that means for access, and a **disabled** "Choose a plan" button with a `title` explaining the Plans tab arrives with the next release. Do not render three zeroed KPI cells — zeros imply a subscription that costs nothing.

**With a subscription**, `OverviewSection` renders in this order:
1. `DunningBanner` — only when `status === 'past_due'`. Non-dismissible, `--danger` border, `graceCopy()` sentence, and an "Update payment method" button that is **disabled with an explanatory title** until the Payment tab exists. A live button that goes nowhere is worse than an honest disabled one.
2. Hero card — tier display name at `--text-2xl`, `StatusPill`, renewal date.
3. Three `KpiCell`s — seats used/purchased with the `SeatUsageBar` beneath, monthly recurring total, days until renewal.

Monthly recurring total is **not** in `/entitlements`. Do not invent it from a hardcoded price table. Render it as `—` with a `title` saying it arrives with the subscription endpoint, or omit the cell entirely and render two KPIs. **State which you chose in the PR body.**

- [ ] **Steps:** compose from Tasks 1-3, `pnpm --filter @nexus/web build`, commit `feat(billing-ui): overview section with dunning and empty states`.

---

### Task 5: Wire it into Settings and verify live

**Files:** Modify `apps/web/src/features/settings/pages/SettingsPage.tsx`

- [ ] **Step 1:** Add to `SECTIONS`, after `audit`:
```ts
{ key: 'billing', label: 'Billing', icon: CreditCard, permission: 'billing:read' },
```
Import `CreditCard` from `lucide-react`, extend the `SectionKey` union, and render `{active === 'billing' && <div className="billing-module"><OverviewSection /></div>}`. **The `billing-module` wrapper is what scopes the accent** — without it the section inherits Nexus blue.

- [ ] **Step 2: Verify against the running app**

```bash
cd ~/Nexus-Collab && pnpm --filter @nexus/web build     # must be green
curl -s -c /tmp/j -o /dev/null localhost:3000/api/dev-login
curl -s -b /tmp/j localhost:3000/api/v1/billing/entitlements | python3 -m json.tool
```
Then open `http://localhost:5273/?view=settings&section=billing` and confirm: the tab appears, the no-subscription empty state renders (not three zeros), the accent is indigo not blue, and nothing in the console errors.

- [ ] **Step 3:** Commit `feat(billing-ui): add the Billing tab to Settings`.

---

## Exit criteria

- [ ] `pnpm --filter @nexus/web build` green.
- [ ] `npx vitest run` in `apps/web` passes, including the 19 new pure-logic tests.
- [ ] The Billing tab appears for a member with `billing:read` and is absent without it.
- [ ] The no-subscription state renders honestly — no zeroed KPIs, no fabricated price.
- [ ] Accent is `#7C3AED` inside the module and `#2F80ED` everywhere else. `git diff` shows **no change** to `design-system.css`.
- [ ] Every figure carries `tabular-nums`; no raw `toFixed` in `features/billing`.
- [ ] With `prefers-reduced-motion: reduce`, nothing animates and every figure shows its final value.
- [ ] No control is live that leads nowhere; disabled controls explain why via `title`.
