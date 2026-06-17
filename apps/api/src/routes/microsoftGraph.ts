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
  graphGet,
  graphPost,
  MicrosoftNotConnectedError,
} from '../lib/microsoftGraph'
import { upsertMemberFromMicrosoft } from '../auth/session'

// OAuth state stored server-side in the session: single-use. `flow` tells the
// shared callback whether this was a primary login (no prior member) or a
// per-user "connect" of an already-signed-in member (bound to memberId).
interface MsOAuthState {
  nonce: string
  flow: 'login' | 'connect'
  memberId?: string
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
  ;(req.session as any).msOAuth = { nonce, flow: 'connect', memberId, createdAt: Date.now() } as MsOAuthState

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

  // Validate state: present, fresh, and matches the single-use nonce (CSRF).
  const baseValid =
    !!code &&
    !!state &&
    !!stored &&
    Date.now() - stored.createdAt <= STATE_TTL_MS &&
    safeEqual(state, stored.nonce)

  if (!baseValid) {
    return res.redirect(APP_REDIRECT('error', 'invalid_state'))
  }

  try {
    const redirectUri = getRedirectUri(req)
    const tokens = await exchangeCode(code, redirectUri)
    const profile = await fetchProfile(tokens.access_token)

    // ── Primary login: provision/resolve the member and start a session.
    if (stored!.flow === 'login') {
      const loggedInMember = await upsertMemberFromMicrosoft(profile)
      // Signing in also connects Graph (same scopes), so Outlook/OneDrive work
      // immediately without a separate "connect" step. (DB-only; safe to do
      // before regenerating the session.)
      await saveTokensForMember(loggedInMember.id, tokens, profile)
      // Defeat session fixation: issue a brand-new session id before storing
      // the authenticated identity.
      return req.session.regenerate((regenErr) => {
        if (regenErr) {
          console.error('[microsoft] failed to regenerate session:', regenErr)
          return res.redirect(APP_REDIRECT('error', 'session_persist_failed'))
        }
        ;(req.session as any).userId = loggedInMember.id
        req.session.save((err) => {
          if (err) {
            console.error('[microsoft] failed to persist login session:', err)
            return res.redirect(APP_REDIRECT('error', 'session_persist_failed'))
          }
          res.redirect('/')
        })
      })
    }

    // ── Connect flow: the bound member must still be the acting member.
    if (stored!.flow === 'connect') {
      const member = (req as any).member
      if (!member?.id || member.id !== stored!.memberId) {
        return res.redirect(APP_REDIRECT('error', 'invalid_state'))
      }
      await saveTokensForMember(stored!.memberId!, tokens, profile)
      return res.redirect(APP_REDIRECT('connected'))
    }

    // Unknown/malformed flow — reject rather than guess.
    return res.redirect(APP_REDIRECT('error', 'invalid_state'))
  } catch (err) {
    console.error('[microsoft] callback exchange failed:', err)
    const reason = (err as Error)?.message === 'NO_ORGANIZATION' ? 'no_workspace' : 'exchange_failed'
    res.redirect(APP_REDIRECT('error', reason))
  }
})

// ─── Mail search ─────────────────────────────────────────────
// Searches the acting member's OWN Outlook mailbox via Graph and returns a
// trimmed list of messages the UI can attach to a task/project. Returns 412
// when the member hasn't connected (or the connection lapsed) so the client can
// show the "connect Microsoft" prompt instead of crashing.
microsoftGraphRoutes.get('/mail/search', async (req: Request, res: Response) => {
  const memberId = memberIdOrUnauthorized(req, res)
  if (!memberId) return

  const q = String(req.query.q ?? '').trim()
  if (!q) return res.json({ messages: [] })

  try {
    // Quote the term for Graph KQL ($search), stripping embedded quotes.
    const search = encodeURIComponent(`"${q.replace(/"/g, '')}"`)
    const select = encodeURIComponent('id,subject,from,receivedDateTime,bodyPreview,webLink')
    const data = await graphGet<{ value: any[] }>(
      memberId,
      `/me/messages?$search=${search}&$top=20&$select=${select}`,
    )
    const messages = (data.value ?? []).map((m) => ({
      id: m.id,
      subject: m.subject || '(no subject)',
      from_name: m.from?.emailAddress?.name ?? null,
      from_email: m.from?.emailAddress?.address ?? null,
      received_at: m.receivedDateTime ?? null,
      snippet: m.bodyPreview ?? '',
      web_link: m.webLink ?? null,
    }))
    res.json({ messages })
  } catch (err) {
    if (err instanceof MicrosoftNotConnectedError) {
      return res.status(412).json({
        error: 'microsoft_not_connected',
        message: 'Connect your Microsoft account to search Outlook.',
      })
    }
    console.error('[microsoft] mail search error:', err)
    res.status(500).json({ error: 'Failed to search Outlook' })
  }
})

// Fetch a single message's full content so the UI can render it in-app (instead
// of bouncing the user to Outlook on the web). Returns 412 when not connected.
microsoftGraphRoutes.get('/mail/:id', async (req: Request, res: Response) => {
  const memberId = memberIdOrUnauthorized(req, res)
  if (!memberId) return
  const id = encodeURIComponent(String(req.params.id))
  try {
    const select = encodeURIComponent('id,subject,from,toRecipients,ccRecipients,receivedDateTime,body,webLink')
    const m = await graphGet<any>(memberId, `/me/messages/${id}?$select=${select}`)
    res.json({
      id: m.id,
      subject: m.subject || '(no subject)',
      from_name: m.from?.emailAddress?.name ?? null,
      from_email: m.from?.emailAddress?.address ?? null,
      to: (m.toRecipients ?? []).map((r: any) => r.emailAddress?.address).filter(Boolean),
      cc: (m.ccRecipients ?? []).map((r: any) => r.emailAddress?.address).filter(Boolean),
      received_at: m.receivedDateTime ?? null,
      body_content_type: m.body?.contentType ?? 'html',
      body_content: m.body?.content ?? '',
      web_link: m.webLink ?? null,
    })
  } catch (err) {
    if (err instanceof MicrosoftNotConnectedError) {
      return res.status(412).json({ error: 'microsoft_not_connected', message: 'Connect your Microsoft account to read this email.' })
    }
    console.error('[microsoft] mail get error:', err)
    res.status(500).json({ error: 'Failed to load email' })
  }
})

// Reply to a message in-app. Graph's /reply sends to the original sender with
// the user's comment prepended above the quoted thread.
microsoftGraphRoutes.post('/mail/:id/reply', async (req: Request, res: Response) => {
  const memberId = memberIdOrUnauthorized(req, res)
  if (!memberId) return
  const id = encodeURIComponent(String(req.params.id))
  const comment = String(req.body?.comment ?? '').trim()
  const replyAll = req.body?.replyAll === true
  if (!comment) return res.status(400).json({ error: 'comment is required' })
  try {
    await graphPost(memberId, `/me/messages/${id}/${replyAll ? 'replyAll' : 'reply'}`, { comment })
    res.json({ sent: true })
  } catch (err) {
    if (err instanceof MicrosoftNotConnectedError) {
      return res.status(412).json({ error: 'microsoft_not_connected', message: 'Connect your Microsoft account to reply.' })
    }
    console.error('[microsoft] mail reply error:', err)
    res.status(500).json({ error: 'Failed to send reply' })
  }
})

// ─── OneDrive ────────────────────────────────────────────────
// Browse and search the acting member's OWN OneDrive via Graph so they can
// attach a file reference (a link to the file in OneDrive — we never copy the
// bytes). Both endpoints return 412 when the member hasn't connected so the UI
// can show the "connect Microsoft" prompt instead of crashing.

const ONEDRIVE_SELECT = 'id,name,size,webUrl,folder,file,lastModifiedDateTime'

// Trim a Graph driveItem down to the fields the picker needs.
function mapDriveItem(it: any) {
  return {
    id: it.id,
    name: it.name ?? '(unnamed)',
    is_folder: !!it.folder,
    child_count: it.folder?.childCount ?? 0,
    size: it.size ?? 0,
    mime_type: it.file?.mimeType ?? null,
    web_url: it.webUrl ?? null,
    last_modified: it.lastModifiedDateTime ?? null,
  }
}

function handleOneDriveError(err: unknown, res: Response, action: string) {
  if (err instanceof MicrosoftNotConnectedError) {
    return res.status(412).json({
      error: 'microsoft_not_connected',
      message: 'Connect your Microsoft account to browse OneDrive.',
    })
  }
  console.error(`[microsoft] onedrive ${action} error:`, err)
  res.status(500).json({ error: `Failed to ${action} OneDrive` })
}

// List a folder's children. No folderId → the drive root.
microsoftGraphRoutes.get('/onedrive/children', async (req: Request, res: Response) => {
  const memberId = memberIdOrUnauthorized(req, res)
  if (!memberId) return

  const folderId = String(req.query.folderId ?? '').trim()
  const select = encodeURIComponent(ONEDRIVE_SELECT)
  const base = folderId
    ? `/me/drive/items/${encodeURIComponent(folderId)}/children`
    : '/me/drive/root/children'

  try {
    const data = await graphGet<{ value: any[] }>(memberId, `${base}?$select=${select}&$top=100`)
    res.json({ items: (data.value ?? []).map(mapDriveItem) })
  } catch (err) {
    handleOneDriveError(err, res, 'browse')
  }
})

// Search the member's whole drive by name/content.
microsoftGraphRoutes.get('/onedrive/search', async (req: Request, res: Response) => {
  const memberId = memberIdOrUnauthorized(req, res)
  if (!memberId) return

  const q = String(req.query.q ?? '').trim()
  if (!q) return res.json({ items: [] })

  try {
    // Escape single quotes for the OData function literal (q='...').
    const term = encodeURIComponent(q.replace(/'/g, "''"))
    const select = encodeURIComponent(ONEDRIVE_SELECT)
    const data = await graphGet<{ value: any[] }>(
      memberId,
      `/me/drive/root/search(q='${term}')?$select=${select}&$top=50`,
    )
    res.json({ items: (data.value ?? []).map(mapDriveItem) })
  } catch (err) {
    handleOneDriveError(err, res, 'search')
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
