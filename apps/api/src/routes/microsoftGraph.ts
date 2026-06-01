import { Router, Request, Response } from 'express'
import {
  isMicrosoftConfigured,
  getRedirectUri,
  buildAuthUrl,
  createStateNonce,
  safeEqual,
  exchangeCode,
  fetchProfile,
  saveTokensForMember,
  getMicrosoftAccount,
  disconnectMember,
} from '../lib/microsoftGraph'

// OAuth state stored server-side in the session: single-use, member-bound.
interface MsOAuthState {
  nonce: string
  memberId: string
  createdAt: number
}
const STATE_TTL_MS = 10 * 60 * 1000

// Per-user Microsoft Graph connection routes, mounted at
// /api/v1/integrations/microsoft. These power the "Connect your Microsoft
// account" foundation that Outlook + OneDrive attach features build on.
export const microsoftGraphRoutes: ReturnType<typeof Router> = Router()

// The SPA uses store-based routing, so we just bounce the browser back to the
// app root with a status flag the UI can react to.
const APP_REDIRECT = (status: string, reason?: string) => {
  const params = new URLSearchParams({ ms: status })
  if (reason) params.set('reason', reason)
  return `/?${params.toString()}`
}

function memberIdOrUnauthorized(req: Request, res: Response): string | null {
  const member = (req as any).member
  if (!member?.id) {
    res.status(401).json({ error: 'Unauthorized' })
    return null
  }
  return member.id as string
}

// ─── Status ──────────────────────────────────────────────────
microsoftGraphRoutes.get('/me', async (req: Request, res: Response) => {
  const memberId = memberIdOrUnauthorized(req, res)
  if (!memberId) return
  if (!isMicrosoftConfigured()) {
    return res.json({ connected: false, configured: false, accountEmail: null, accountName: null })
  }
  try {
    const acct = await getMicrosoftAccount(memberId)
    res.json({
      connected: !!acct,
      configured: true,
      accountEmail: acct?.accountEmail ?? null,
      accountName: acct?.accountName ?? null,
    })
  } catch (err) {
    console.error('[microsoft] GET /me error:', err)
    res.status(500).json({ error: 'Failed to load Microsoft status' })
  }
})

// ─── Connect (browser navigation → redirect to Entra) ────────
microsoftGraphRoutes.get('/connect', (req: Request, res: Response) => {
  const memberId = memberIdOrUnauthorized(req, res)
  if (!memberId) return
  if (!isMicrosoftConfigured()) {
    return res.status(400).json({
      error: 'microsoft_not_configured',
      message: 'Microsoft is not configured. Add AZURE_TENANT_ID, AZURE_CLIENT_ID and AZURE_CLIENT_SECRET.',
    })
  }
  if (!req.session) {
    return res.status(500).json({ error: 'Session unavailable' })
  }

  const redirectUri = getRedirectUri(req)
  const nonce = createStateNonce()
  // Bind the flow to this member in the server-side session (single-use).
  ;(req.session as any).msOAuth = { nonce, memberId, createdAt: Date.now() } as MsOAuthState

  // Persist the session BEFORE redirecting away so the callback can read it.
  req.session.save((err) => {
    if (err) {
      console.error('[microsoft] failed to persist OAuth state:', err)
      return res.redirect(APP_REDIRECT('error', 'state_persist_failed'))
    }
    res.redirect(buildAuthUrl(redirectUri, nonce))
  })
})

// ─── OAuth callback ──────────────────────────────────────────
microsoftGraphRoutes.get('/callback', async (req: Request, res: Response) => {
  const { code, state, error, error_description } = req.query as Record<string, string>

  // Read and immediately consume the stored state (single-use), regardless of
  // outcome, so a captured state can never be replayed.
  const stored = (req.session as any)?.msOAuth as MsOAuthState | undefined
  if (req.session) {
    delete (req.session as any).msOAuth
  }

  if (error) {
    console.error('[microsoft] callback returned error:', error, error_description)
    return res.redirect(APP_REDIRECT('error', error_description || error))
  }

  // Validate state: present, fresh, matches the nonce, and bound to the
  // currently authenticated member.
  const member = (req as any).member
  const stateValid =
    !!code &&
    !!state &&
    !!stored &&
    Date.now() - stored.createdAt <= STATE_TTL_MS &&
    safeEqual(state, stored.nonce) &&
    !!member?.id &&
    member.id === stored.memberId

  if (!stateValid) {
    return res.redirect(APP_REDIRECT('error', 'invalid_state'))
  }

  try {
    const redirectUri = getRedirectUri(req)
    const tokens = await exchangeCode(code, redirectUri)
    const profile = await fetchProfile(tokens.access_token)
    await saveTokensForMember(stored!.memberId, tokens, profile)
    res.redirect(APP_REDIRECT('connected'))
  } catch (err) {
    console.error('[microsoft] callback exchange failed:', err)
    res.redirect(APP_REDIRECT('error', 'exchange_failed'))
  }
})

// ─── Disconnect ──────────────────────────────────────────────
microsoftGraphRoutes.post('/disconnect', async (req: Request, res: Response) => {
  const memberId = memberIdOrUnauthorized(req, res)
  if (!memberId) return
  try {
    await disconnectMember(memberId)
    res.json({ ok: true })
  } catch (err) {
    console.error('[microsoft] disconnect error:', err)
    res.status(500).json({ error: 'Failed to disconnect Microsoft account' })
  }
})
