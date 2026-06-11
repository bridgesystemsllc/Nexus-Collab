// ─── Brief Status — single source of truth ──────────────────
// Shared across NewBriefModal, BriefDetailView, rd.tsx BriefsTab,
// everything page, and BriefAutocomplete.

export const BRIEF_STATUSES = [
  'Start Brief',
  'Brief Submitted',
  'In Formulation',
  'Stability Testing',
  'Formula Approved',
  'Completed',
] as const

export type BriefStatus = (typeof BRIEF_STATUSES)[number]

export const DEFAULT_BRIEF_STATUS: BriefStatus = 'Start Brief'

// Note: --accent-light exists in design-system.css but is identical to
// --info-light (used by Brief Submitted), so Start Brief uses a distinct
// purple to stay visually distinguishable.
export const BRIEF_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  'Start Brief': { bg: 'rgba(139,92,246,0.15)', text: '#8B5CF6' },
  'Brief Submitted': { bg: 'var(--info-light)', text: '#3B82F6' },
  'In Formulation': { bg: 'var(--warning-light)', text: '#F59E0B' },
  'Stability Testing': { bg: 'var(--danger-light)', text: '#EF4444' },
  'Formula Approved': { bg: 'var(--success-light)', text: '#10B981' },
  Completed: { bg: 'var(--bg-hover)', text: '#6B7280' },
}
