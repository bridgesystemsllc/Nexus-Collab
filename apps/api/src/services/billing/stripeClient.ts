// apps/api/src/services/billing/stripeClient.ts
import Stripe from 'stripe'
import { isLocalDevelopment } from '../../lib/devOnly'
import { BillingUnconfiguredError } from './provider'

// ─── The Stripe singleton ────────────────────────────────────
// This is the ONLY file in the repo permitted to import the Stripe SDK
// package directly (the line just above this comment). Everything else —
// stripeMappers, stripeProvider, and everyone above the BillingProvider
// seam — reaches Stripe only through `getStripeClient()`, so the SDK's types
// and quirks stay contained to one place. After any change here, grep the
// source tree for that import statement; it must come back with exactly
// this one hit.

// Pinned, not read from the account. `apiVersion` is the contract between our
// code and the *shape* of every response we parse: if we let it default to
// "whatever the Stripe dashboard is currently set to", an operator changing
// that setting in the Stripe UI — for a reason that has nothing to do with
// this codebase — silently changes response shapes under us with no diff, no
// deploy, and no test failure to catch it. Pinning to the version this SDK's
// bundled types (`stripe@17.7.0`) were generated against keeps "the types
// TypeScript checks" and "the shape Stripe actually sends" the same thing.
// Bumping it is a deliberate, reviewed change alongside a `stripe` upgrade —
// never a side effect of clicking around in the Stripe dashboard.
const PINNED_API_VERSION: Stripe.StripeConfig['apiVersion'] = '2025-02-24.acacia'

let cached: Stripe | null = null

/// True for a key that identifies itself as live-mode. Stripe's own
/// convention: `sk_live_...` / `sk_test_...` (and the restricted-key
/// equivalents `rk_live_...` / `rk_test_...`).
function isLiveKey(key: string): boolean {
  return key.startsWith('sk_live_') || key.startsWith('rk_live_')
}

function isTestKey(key: string): boolean {
  return key.startsWith('sk_test_') || key.startsWith('rk_test_')
}

/// Refuses a key whose mode disagrees with where the process is running.
///
/// A live key on a developer's laptop is one fat-fingered checkout away from
/// a real charge on a real card — there is no legitimate reason for
/// `sk_live_` to be loaded outside a real deployment. A test key in a real
/// deployment is the opposite failure: it silently takes real customers'
/// money and puts it nowhere, because test-mode charges never settle. Both
/// are configuration mistakes worth refusing loudly, at startup-adjacent
/// construction time, rather than discovering either via a support ticket or
/// a reconciliation gap weeks later.
function assertKeyMatchesEnvironment(key: string): void {
  const local = isLocalDevelopment()
  if (isLiveKey(key) && local) {
    throw new Error(
      'STRIPE_SECRET_KEY is a live-mode key (sk_live_/rk_live_) but this process is running in local ' +
        'development. Refusing to construct a Stripe client that could place a real charge. Use a ' +
        'test-mode key (sk_test_/rk_test_) locally.',
    )
  }
  if (isTestKey(key) && !local) {
    throw new Error(
      'STRIPE_SECRET_KEY is a test-mode key (sk_test_/rk_test_) but this process is not running in ' +
        'local development. Refusing to construct a Stripe client that would silently take no real ' +
        'payments in a real deployment. Use a live-mode key (sk_live_/rk_live_) here.',
    )
  }
  // A key matching neither prefix (e.g. a malformed value) is left to Stripe
  // itself to reject on first use — we only assert on the modes we recognise.
}

/// Lazy on purpose: constructing the module must never throw just because an
/// install has no Stripe key. Only a caller that actually needs Stripe pays
/// for — and can catch — that failure.
export function getStripeClient(): Stripe {
  if (cached) return cached

  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new BillingUnconfiguredError()

  // Never log `key` or any slice of it, including here in an error path —
  // logging even a prefix like `sk_live_` narrows the search space for the
  // rest of the secret and gives no debugging value a code review of this
  // file doesn't already give.
  assertKeyMatchesEnvironment(key)

  cached = new Stripe(key, { apiVersion: PINNED_API_VERSION, typescript: true })
  return cached
}

/** Test hook. Never call this from application code. */
export function resetStripeClientForTests(): void {
  cached = null
}
