import { getGraphClient } from './graphClient'
import { isMicrosoftConfigured } from '../../lib/microsoftGraph'

// ─── Graph mail subscription lifecycle ───────────────────────
// Nothing else in the codebase creates or renews the subscription that drives
// /api/v1/email-agent/webhook. Microsoft caps mailbox subscriptions at roughly
// 4230 minutes (under three days), after which notifications simply stop — no
// error, no callback, no signal anywhere. Any feature built on inbound mail
// therefore needs this or it works for three days and then dies quietly.

// Slightly under the documented 4230-minute ceiling, to tolerate clock skew
// between us and Microsoft when they validate the requested expiry.
const SUBSCRIPTION_MINUTES = 4200

// Renew anything expiring inside this window. Comfortably larger than the
// 12-hour job interval so a single missed run cannot drop the subscription.
const RENEW_WITHIN_MS = 24 * 60 * 60 * 1000

export interface SubscriptionState {
  configured: boolean
  subscriptionId?: string
  expiresAt?: string
  action: 'created' | 'renewed' | 'reused' | 'skipped' | 'failed'
  reason?: string
}

function notificationUrl(): string | null {
  if (process.env.AGENT_WEBHOOK_URL) return process.env.AGENT_WEBHOOK_URL
  // Mirrors how getRedirectUri derives a public base on Replit. Graph requires
  // a publicly reachable HTTPS URL, so localhost can never work — we return
  // null rather than registering a callback Microsoft will reject.
  const domain = (process.env.REPLIT_DOMAINS || '').split(',')[0]?.trim()
  if (!domain) return null
  return `https://${domain}/api/v1/email-agent/webhook`
}

function expiryFromNow(minutes = SUBSCRIPTION_MINUTES): string {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString()
}

// True when every prerequisite for a subscription is present. Local
// development has none of these, so callers no-op silently instead of logging
// failures on every boot.
export function isSubscriptionConfigured(): boolean {
  return (
    isMicrosoftConfigured() &&
    !!process.env.AGENT_MAILBOX &&
    !!process.env.AGENT_WEBHOOK_SECRET &&
    !!notificationUrl()
  )
}

// Find or create a live subscription for the agent mailbox. Idempotent: safe
// to call on every boot and from the renewal job.
export async function ensureSubscription(): Promise<SubscriptionState> {
  if (!isSubscriptionConfigured()) {
    return {
      configured: false,
      action: 'skipped',
      reason:
        'Requires Graph credentials, AGENT_MAILBOX, AGENT_WEBHOOK_SECRET and a public webhook URL.',
    }
  }

  const mailbox = process.env.AGENT_MAILBOX as string
  const url = notificationUrl() as string
  const resource = `/users/${mailbox}/mailFolders('inbox')/messages`

  try {
    const client = await getGraphClient()
    const existing = await client.api('/subscriptions').get()
    const ours = (existing?.value || []).find(
      (s: any) => s.resource === resource && s.notificationUrl === url,
    )

    if (ours) {
      const expiresAt = new Date(ours.expirationDateTime).getTime()
      if (expiresAt - Date.now() > RENEW_WITHIN_MS) {
        return {
          configured: true,
          subscriptionId: ours.id,
          expiresAt: ours.expirationDateTime,
          action: 'reused',
        }
      }

      const renewed = await client
        .api(`/subscriptions/${ours.id}`)
        .patch({ expirationDateTime: expiryFromNow() })
      return {
        configured: true,
        subscriptionId: renewed.id,
        expiresAt: renewed.expirationDateTime,
        action: 'renewed',
      }
    }

    const created = await client.api('/subscriptions').post({
      changeType: 'created',
      notificationUrl: url,
      resource,
      expirationDateTime: expiryFromNow(),
      // Echoed back on every notification and verified by the webhook, so a
      // stranger who guesses the URL cannot inject fake notifications.
      clientState: process.env.AGENT_WEBHOOK_SECRET,
    })

    return {
      configured: true,
      subscriptionId: created.id,
      expiresAt: created.expirationDateTime,
      action: 'created',
    }
  } catch (err: any) {
    console.error('[EmailAgent] Subscription ensure failed:', err?.message || err)
    return { configured: true, action: 'failed', reason: err?.message || String(err) }
  }
}

// Extend every subscription pointing at our webhook that expires soon. Kept
// separate from ensureSubscription so the scheduled job renews what exists
// without recreating a subscription that was intentionally removed.
export async function renewSubscriptions(): Promise<SubscriptionState[]> {
  if (!isSubscriptionConfigured()) {
    return [{ configured: false, action: 'skipped', reason: 'Not configured' }]
  }

  const url = notificationUrl() as string

  try {
    const client = await getGraphClient()
    const existing = await client.api('/subscriptions').get()
    const ours = (existing?.value || []).filter((s: any) => s.notificationUrl === url)

    if (ours.length === 0) {
      // Nothing to renew — recreate, otherwise a lapsed subscription would
      // never come back and inbound mail would stay dead.
      return [await ensureSubscription()]
    }

    const results: SubscriptionState[] = []
    for (const sub of ours) {
      const expiresAt = new Date(sub.expirationDateTime).getTime()
      if (expiresAt - Date.now() > RENEW_WITHIN_MS) {
        results.push({
          configured: true,
          subscriptionId: sub.id,
          expiresAt: sub.expirationDateTime,
          action: 'reused',
        })
        continue
      }
      try {
        const renewed = await client
          .api(`/subscriptions/${sub.id}`)
          .patch({ expirationDateTime: expiryFromNow() })
        results.push({
          configured: true,
          subscriptionId: renewed.id,
          expiresAt: renewed.expirationDateTime,
          action: 'renewed',
        })
      } catch (err: any) {
        // An expired subscription cannot be patched; recreate instead.
        console.warn(`[EmailAgent] Renew failed for ${sub.id}, recreating:`, err?.message)
        results.push(await ensureSubscription())
      }
    }
    return results
  } catch (err: any) {
    console.error('[EmailAgent] Subscription renew failed:', err?.message || err)
    return [{ configured: true, action: 'failed', reason: err?.message || String(err) }]
  }
}
