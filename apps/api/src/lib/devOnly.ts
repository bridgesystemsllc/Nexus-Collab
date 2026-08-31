// apps/api/src/lib/devOnly.ts

// ─── Local-development detection ─────────────────────────────
// Single source of truth for "is this process actually running on a
// developer's machine" — as opposed to merely "not NODE_ENV=production",
// which is also true of a Replit preview deployment. That distinction matters
// wherever the answer gates something dangerous (e.g. refusing a live Stripe
// key outside local dev): a preview environment is still a shared, reachable
// deployment, not a laptop.
//
// Mirrors the two-signal check `auth/session.ts` already uses to gate the
// dev-login shortcut: NODE_ENV must be non-production AND the process must
// not be running under Replit's deployment infrastructure. Either signal
// alone is enough to say "not local", so a single misconfiguration (e.g.
// someone forgetting to set REPLIT_DEPLOYMENT) cannot widen what counts as
// local development.
export function isLocalDevelopment(): boolean {
  return process.env.NODE_ENV !== 'production' && !process.env.REPLIT_DEPLOYMENT
}
