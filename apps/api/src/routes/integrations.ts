import { Router, Request, Response } from 'express'
import crypto from 'crypto'
import { prisma } from '../index'
import { encrypt, decrypt, encryptJson, decryptJson } from '../lib/encryption'
import {
  generateState,
  validateState,
  exchangeMicrosoftToken,
  exchangeGoogleToken,
} from '../lib/oauth'
import { syncErp, syncErpOpenOrders } from '../lib/erpSync'
import { getErpConfig, erpBaseCandidates, looksLikeJson } from '../lib/erpClient'
import {
  ERP_FEEDS,
  getRouting,
  setRoutingOnConfig,
  type RouteEntry,
  ERP_OUTBOUND_FEEDS,
  getOutbound,
  setOutboundOnConfig,
  type OutboundEntry,
} from '../lib/erpRouting'
import { pushErp, pushToErp } from '../lib/erpPush'
import { mapOpenOrderForErp } from '../lib/erpOpenOrders'

export const integrationRoutes: ReturnType<typeof Router> = Router()
export const webhookRoutes: ReturnType<typeof Router> = Router()

const FRONTEND_URL = () => process.env.FRONTEND_URL || 'http://localhost:5173'

// ─── ERP live-connection probe (shared by /connect and /test) ───────────────
// Verifies the saved credentials can actually READ DATA from the ERP. A public
// /health endpoint says nothing about whether the API key works, so we probe
// the real data endpoints the sync uses. Only a 2xx counts as live-verified.
interface ErpProbeResult {
  ok: boolean
  endpoint?: string
  authRejected: boolean
  reachable: boolean
  lastError: string | null
  // The ERP's own error message (e.g. "API key is inactive"), surfaced so the
  // user sees the real reason instead of a generic "rejected" message.
  serverMessage?: string | null
}

// Pull the human-readable error out of an ERP JSON error body. The ERP wraps
// errors as { error: { code, message } } (and sometimes a top-level message).
function extractErpMessage(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw)
    return parsed?.error?.message || parsed?.message || null
  } catch {
    return null
  }
}

async function probeErpLive(apiUrl: string, apiKey: string): Promise<ErpProbeResult> {
  const authHeaders = {
    'X-API-Key': apiKey,
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json',
  }
  // Probe the endpoints the SKU sync actually reads, across both base
  // candidates (URL as given, then with /api/v1 appended).
  const dataPaths = ['/products', '/inventory', '/skus']
  let authRejected = false
  let reachable = false
  let lastError: string | null = null
  let serverMessage: string | null = null
  for (const base of erpBaseCandidates(apiUrl)) {
    for (const path of dataPaths) {
      try {
        const response = await fetch(`${base}${path}`, {
          headers: authHeaders,
          signal: AbortSignal.timeout(8000),
        })
        const raw = await response.text().catch(() => '')
        // A 200 that returns HTML (an SPA index.html for an unknown route) is
        // NOT a live data endpoint — only count JSON as verified.
        if (response.ok && looksLikeJson(response.headers.get('content-type'), raw)) {
          return {
            ok: true,
            endpoint: `${base}${path}`,
            authRejected: false,
            reachable: true,
            lastError: null,
            serverMessage: null,
          }
        }
        reachable = true
        if (response.status === 401 || response.status === 403) authRejected = true
        const detail = extractErpMessage(raw)
        if (detail) serverMessage = detail
        const nonJson = response.ok ? ' — non-JSON response (wrong API base?)' : ''
        lastError = `HTTP ${response.status} from ${base}${path}${detail ? ` — ${detail}` : nonJson}`
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err)
      }
    }
  }
  return { ok: false, authRejected, reachable, lastError, serverMessage }
}

function erpProbeError(probe: ErpProbeResult, base: string): string {
  if (probe.authRejected) {
    const detail = probe.serverMessage ? ` The ERP said: "${probe.serverMessage}".` : ''
    return `The ERP rejected the API key (HTTP 401/403).${detail} Check that the API key is correct, active, and has permission to read data.`
  }
  if (probe.reachable) {
    return `Reached the server, but no ERP data endpoint responded (${probe.lastError}). Check that the API URL is the ERP's data API base — it should serve /skus or /products.`
  }
  return `Could not reach the ERP at ${base} (${probe.lastError}). Check that the API URL is correct and publicly reachable.`
}

// Persist the live-verification outcome onto the integration config (non-secret
// metadata) so the UI can honestly show "live verified" vs "sample data mode"
// without re-probing on every render.
async function persistErpLiveResult(probe: ErpProbeResult, base: string): Promise<void> {
  const integration = await prisma.integration.findFirst({ where: { type: 'ERP_KAREVE_SYNC' } })
  if (!integration) return
  const existing = (integration.config ?? {}) as Record<string, unknown>
  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      config: {
        ...existing,
        liveVerified: probe.ok,
        lastTestAt: new Date().toISOString(),
        lastTestError: probe.ok ? null : erpProbeError(probe, base),
      } as Record<string, unknown>,
    },
  })
}

integrationRoutes.get('/', async (_req: Request, res: Response) => {
  try {
    const integrations = await prisma.integration.findMany({
      orderBy: { createdAt: 'asc' },
    })
    res.json(integrations)
  } catch (error) {
    console.error('[integrations] GET / error:', error)
    res.status(500).json({ error: 'Failed to fetch integrations' })
  }
})

// ─── Connect integration ────────────────────────────────────
integrationRoutes.post('/:type/connect', async (req: Request, res: Response) => {
  try {
    const type = req.params.type as string

    // ── Microsoft OAuth ──────────────────────────────────────
    if (type.startsWith('MICROSOFT_')) {
      const clientId = process.env.MICROSOFT_CLIENT_ID
      const tenantId = process.env.MICROSOFT_TENANT_ID
      const redirectUri = process.env.MICROSOFT_REDIRECT_URI

      if (!clientId || !tenantId || !redirectUri) {
        return res.status(400).json({
          error: 'configuration_required',
          provider: 'microsoft',
          message: 'Microsoft OAuth credentials are not configured.',
          required: [
            { key: 'MICROSOFT_CLIENT_ID', description: 'Azure AD application (client) ID' },
            { key: 'MICROSOFT_TENANT_ID', description: 'Azure AD tenant ID (use "common" for multi-tenant)' },
            { key: 'MICROSOFT_CLIENT_SECRET', description: 'Azure AD client secret value' },
            { key: 'MICROSOFT_REDIRECT_URI', description: `OAuth callback URL, e.g. https://your-app.replit.app/auth/callback/microsoft` },
          ],
        })
      }

      const state = generateState('microsoft')
      const scopes =
        'openid profile offline_access Mail.Read Mail.Send Mail.ReadWrite Files.ReadWrite.All ChannelMessage.Send Chat.ReadWrite User.Read'

      const params = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        scope: scopes,
        response_mode: 'query',
        state,
      })

      const authUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`
      return res.json({ authUrl })
    }

    // ── Google OAuth ─────────────────────────────────────────
    if (type.startsWith('GOOGLE_')) {
      const clientId = process.env.GOOGLE_CLIENT_ID
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET
      const redirectUri = process.env.GOOGLE_REDIRECT_URI

      if (!clientId || !clientSecret || !redirectUri) {
        return res.status(400).json({
          error: 'configuration_required',
          provider: 'google',
          message: 'Google OAuth credentials are not configured.',
          required: [
            { key: 'GOOGLE_CLIENT_ID', description: 'Google OAuth 2.0 client ID' },
            { key: 'GOOGLE_CLIENT_SECRET', description: 'Google OAuth 2.0 client secret' },
            { key: 'GOOGLE_REDIRECT_URI', description: `OAuth callback URL, e.g. https://your-app.replit.app/auth/callback/google` },
          ],
        })
      }

      const state = generateState('google')

      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: [
          'https://www.googleapis.com/auth/gmail.readonly',
          'https://www.googleapis.com/auth/gmail.send',
          'https://www.googleapis.com/auth/gmail.modify',
          'https://www.googleapis.com/auth/spreadsheets',
          'https://www.googleapis.com/auth/drive.file',
        ].join(' '),
        access_type: 'offline',
        prompt: 'consent',
        state,
      })

      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
      return res.json({ authUrl })
    }

    // ── Zapier Webhook ───────────────────────────────────────
    if (type === 'ZAPIER') {
      const webhookId = crypto.randomUUID()
      const webhookUrl = `${req.protocol}://${req.get('host')}/api/v1/webhooks/zapier/${webhookId}`
      const encryptedConfig = encryptJson({ webhookId })

      await prisma.integration.updateMany({
        where: { type },
        data: {
          status: 'CONNECTED',
          config: encryptedConfig,
        },
      })

      return res.json({ webhookUrl })
    }

    // ── ERP KarEve Sync ──────────────────────────────────────
    if (type === 'ERP_KAREVE_SYNC') {
      const { apiUrl, apiKey } = req.body

      if (!apiUrl || !apiKey) {
        return res.status(400).json({ error: 'apiUrl and apiKey are required' })
      }

      const encryptedConfig = encryptJson({ apiUrl, apiKey })

      // Preserve any existing routing AND outbound config while rewriting the
      // creds blob, so reconnecting / rotating credentials never clobbers the
      // admin's inbound routing or outbound push settings.
      const existing = await prisma.integration.findFirst({ where: { type } })
      const existingConfig =
        (existing?.config as
          | {
              routing?: Record<string, Partial<RouteEntry>>
              outbound?: Record<string, Partial<OutboundEntry>>
            }
          | null) ?? {}
      const existingRouting = existingConfig.routing ?? {}
      const existingOutbound = existingConfig.outbound ?? {}
      // Layer creds → routing → outbound; each setter preserves prior keys.
      const config = setOutboundOnConfig(
        setRoutingOnConfig(encryptedConfig, existingRouting),
        existingOutbound,
      )

      // The integration stays CONNECTED so the routing UI and sample-data sync
      // remain available; whether LIVE ERP data is reachable is tracked
      // separately by the probe below and surfaced honestly in the UI.
      await prisma.integration.updateMany({
        where: { type },
        data: {
          status: 'CONNECTED',
          config,
        },
      })

      // Validate the saved credentials against the real data endpoints and
      // record the outcome, so the response (and the UI) tells the user the
      // truth instead of a blanket "connected".
      const base = apiUrl.replace(/\/+$/, '')
      const probe = await probeErpLive(apiUrl, apiKey)
      await persistErpLiveResult(probe, base)

      return res.json({
        connected: true,
        live: probe.ok,
        message: probe.ok
          ? `Connected — ERP returned live data at ${probe.endpoint}.`
          : undefined,
        error: probe.ok ? undefined : erpProbeError(probe, base),
      })
    }

    // ── Default: generic connect ─────────────────────────────
    const integration = await prisma.integration.updateMany({
      where: { type },
      data: { status: 'CONNECTED', config: req.body.config || {} },
    })
    res.json({ success: true, integration })
  } catch (error) {
    console.error('[integrations] POST /:type/connect error:', error)
    res.status(500).json({ error: 'Failed to connect integration' })
  }
})

// ─── Test an integration connection ─────────────────────────
// The UI's "Test Connection" button posts here AFTER credentials are saved, so
// the test uses the stored (encrypted) credentials rather than anything in the
// body. For the ERP it actually reaches out to the configured URL; for other
// integrations it reports whether the integration is currently connected.
integrationRoutes.post('/:type/test', async (req: Request, res: Response) => {
  try {
    const { type } = req.params

    if (type === 'ERP_KAREVE_SYNC') {
      const { apiUrl, apiKey, configured } = await getErpConfig(prisma)
      if (!configured || !apiUrl || !apiKey) {
        return res.status(400).json({
          ok: false,
          error: 'No ERP credentials saved yet. Enter an API URL and API key, click Save Credentials, then test.',
        })
      }

      // Validate against the REAL data endpoints the sync uses (shared with
      // /connect) and persist the outcome so the UI reflects live vs sample mode.
      const base = apiUrl.replace(/\/+$/, '')
      const probe = await probeErpLive(apiUrl, apiKey)
      await persistErpLiveResult(probe, base)

      if (probe.ok) {
        return res.json({
          ok: true,
          message: `Connected — ERP returned live data at ${probe.endpoint}.`,
          endpoint: probe.endpoint,
        })
      }

      return res.status(502).json({ ok: false, error: erpProbeError(probe, base) })
    }

    // Generic integrations: treat a CONNECTED status as a passing test.
    const integration = await prisma.integration.findFirst({ where: { type } })
    if (!integration || integration.status !== 'CONNECTED') {
      return res.status(400).json({ ok: false, error: 'This integration is not connected yet.' })
    }
    return res.json({ ok: true, message: 'Connection is active.' })
  } catch (error) {
    console.error('[integrations] POST /:type/test error:', error)
    res.status(500).json({ ok: false, error: 'Failed to test connection.' })
  }
})

// ─── Microsoft OAuth callback ───────────────────────────────
integrationRoutes.get('/microsoft/callback', async (req: Request, res: Response) => {
  try {
    const code = req.query.code as string | undefined
    const state = req.query.state as string | undefined

    if (!code || !state) {
      return res.redirect(`${FRONTEND_URL()}/integrations?error=invalid_state`)
    }

    if (!validateState(state, 'microsoft')) {
      return res.redirect(`${FRONTEND_URL()}/integrations?error=invalid_state`)
    }

    const tokens = await exchangeMicrosoftToken(code)

    const encryptedTokens = encryptJson({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
    })

    await prisma.integration.updateMany({
      where: { type: { startsWith: 'MICROSOFT_' } },
      data: {
        status: 'CONNECTED',
        config: encryptedTokens,
        lastSyncAt: new Date(),
      },
    })

    res.redirect(`${FRONTEND_URL()}/integrations?connected=microsoft`)
  } catch (error) {
    console.error('[integrations] Microsoft callback error:', error)
    res.redirect(`${FRONTEND_URL()}/integrations?error=microsoft_auth_failed`)
  }
})

// ─── Google OAuth callback ──────────────────────────────────
integrationRoutes.get('/google/callback', async (req: Request, res: Response) => {
  try {
    const code = req.query.code as string | undefined
    const state = req.query.state as string | undefined

    if (!code || !state) {
      return res.redirect(`${FRONTEND_URL()}/integrations?error=invalid_state`)
    }

    if (!validateState(state, 'google')) {
      return res.redirect(`${FRONTEND_URL()}/integrations?error=invalid_state`)
    }

    const tokens = await exchangeGoogleToken(code)

    const encryptedTokens = encryptJson({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
    })

    await prisma.integration.updateMany({
      where: { type: { in: ['GOOGLE_GMAIL', 'GOOGLE_SHEETS'] } },
      data: {
        status: 'CONNECTED',
        config: encryptedTokens,
        lastSyncAt: new Date(),
      },
    })

    res.redirect(`${FRONTEND_URL()}/integrations?connected=google`)
  } catch (error) {
    console.error('[integrations] Google callback error:', error)
    res.redirect(`${FRONTEND_URL()}/integrations?error=google_auth_failed`)
  }
})

// ─── ERP data-flow routing ──────────────────────────────────
//
// Routing controls which ERP feeds flow into which Nexus modules and whether
// each feed is enabled. It is stored UNENCRYPTED under Integration.config.routing
// alongside the encrypted creds blob.

// Shape one feed's current routing for an API response.
function feedRoutingResponse(integration: Awaited<ReturnType<typeof prisma.integration.findFirst>>) {
  const routing = getRouting(integration)
  return ERP_FEEDS.map((feed) => {
    const entry = routing[feed.key]
    return {
      key: feed.key,
      label: feed.label,
      description: feed.description,
      enabled: entry.enabled,
      targetModuleId: entry.targetModuleId,
      targetModuleType: entry.targetModuleType,
      erpPath: entry.erpPath ?? null,
    }
  })
}

// GET routing — read-only, any authenticated user.
integrationRoutes.get('/:type/routing', async (req: Request, res: Response) => {
  try {
    if (req.params.type !== 'ERP_KAREVE_SYNC') {
      return res.status(404).json({ error: 'Routing is only available for ERP_KAREVE_SYNC' })
    }
    const integration = await prisma.integration.findFirst({
      where: { type: req.params.type as string },
    })
    if (!integration) return res.status(404).json({ error: 'Integration not found' })

    res.json({
      feeds: feedRoutingResponse(integration),
      connected: integration.status === 'CONNECTED',
    })
  } catch (error) {
    console.error('[integrations] GET /:type/routing error:', error)
    res.status(500).json({ error: 'Failed to fetch routing' })
  }
})

// PATCH routing — ADMIN / OPS_MANAGER only (with a dev escape hatch).
integrationRoutes.patch('/:type/routing', async (req: Request, res: Response) => {
  try {
    if (req.params.type !== 'ERP_KAREVE_SYNC') {
      return res.status(404).json({ error: 'Routing is only available for ERP_KAREVE_SYNC' })
    }

    // Role gate: allow ADMIN / OPS_MANAGER. If no member resolved (e.g. local
    // dev with no session), allow only when NODE_ENV !== 'production'.
    const member = (req as any).member as { role?: string } | undefined
    const role = member?.role
    const privileged = role === 'ADMIN' || role === 'OPS_MANAGER'
    const devUnauthenticated = !member && process.env.NODE_ENV !== 'production'
    if (!privileged && !devUnauthenticated) {
      return res.status(403).json({ error: 'Forbidden: requires ADMIN or OPS_MANAGER' })
    }

    const body = (req.body ?? {}) as { routing?: Record<string, Partial<RouteEntry>> }
    const patch = body.routing
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      return res.status(400).json({ error: 'Body must include a routing object' })
    }

    const validKeys = new Set(ERP_FEEDS.map((f) => f.key))
    for (const key of Object.keys(patch)) {
      if (!validKeys.has(key)) {
        return res.status(400).json({ error: `Unknown feed key: ${key}` })
      }
    }

    // Validate any provided targetModuleId actually exists.
    for (const [key, entry] of Object.entries(patch)) {
      if (entry && entry.targetModuleId) {
        const mod = await prisma.departmentModule.findUnique({
          where: { id: entry.targetModuleId },
        })
        if (!mod) {
          return res.status(400).json({ error: `targetModuleId for feed "${key}" does not exist` })
        }
      }
    }

    const integration = await prisma.integration.findFirst({
      where: { type: req.params.type as string },
    })
    if (!integration) return res.status(404).json({ error: 'Integration not found' })

    const config = setRoutingOnConfig(integration.config, patch)
    await prisma.integration.update({
      where: { id: integration.id },
      data: { config },
    })

    const updated = await prisma.integration.findUnique({ where: { id: integration.id } })
    res.json({
      feeds: feedRoutingResponse(updated),
      connected: updated?.status === 'CONNECTED',
    })
  } catch (error) {
    console.error('[integrations] PATCH /:type/routing error:', error)
    res.status(500).json({ error: 'Failed to update routing' })
  }
})

// ─── ERP OUTBOUND push config (Nexus → ERP) ─────────────────
//
// Outbound config controls which Nexus modules may be PUSHED to the ERP and
// whether each feed is enabled. It is stored UNENCRYPTED under
// Integration.config.outbound, alongside the encrypted creds blob and the
// inbound `.routing`. All default to DISABLED (opt-in by an admin).

// Shape the outbound feeds for an API response, including a live item count of
// each feed's source module.
async function feedOutboundResponse(
  integration: Awaited<ReturnType<typeof prisma.integration.findFirst>>,
) {
  const outbound = getOutbound(integration)
  return Promise.all(
    ERP_OUTBOUND_FEEDS.map(async (feed) => {
      const entry = outbound[feed.key]
      const mod = await prisma.departmentModule.findFirst({
        where: { type: feed.sourceModuleType },
      })
      const itemCount = mod
        ? await prisma.moduleItem.count({ where: { moduleId: mod.id } })
        : 0
      return {
        key: feed.key,
        label: feed.label,
        description: feed.description,
        enabled: entry.enabled,
        erpPath: entry.erpPath ?? null,
        itemCount,
      }
    }),
  )
}

// GET outbound — read-only, any authenticated user.
integrationRoutes.get('/:type/outbound', async (req: Request, res: Response) => {
  try {
    if (req.params.type !== 'ERP_KAREVE_SYNC') {
      return res.status(404).json({ error: 'Outbound is only available for ERP_KAREVE_SYNC' })
    }
    const integration = await prisma.integration.findFirst({
      where: { type: req.params.type as string },
    })
    if (!integration) return res.status(404).json({ error: 'Integration not found' })

    const { configured } = await getErpConfig(prisma)
    res.json({
      connected: integration.status === 'CONNECTED',
      configured,
      feeds: await feedOutboundResponse(integration),
    })
  } catch (error) {
    console.error('[integrations] GET /:type/outbound error:', error)
    res.status(500).json({ error: 'Failed to fetch outbound config' })
  }
})

// PATCH outbound — ADMIN / OPS_MANAGER only (with a dev escape hatch).
integrationRoutes.patch('/:type/outbound', async (req: Request, res: Response) => {
  try {
    if (req.params.type !== 'ERP_KAREVE_SYNC') {
      return res.status(404).json({ error: 'Outbound is only available for ERP_KAREVE_SYNC' })
    }

    // Role gate: allow ADMIN / OPS_MANAGER. If no member resolved (e.g. local
    // dev with no session), allow only when NODE_ENV !== 'production'.
    const member = (req as any).member as { role?: string } | undefined
    const role = member?.role
    const privileged = role === 'ADMIN' || role === 'OPS_MANAGER'
    const devUnauthenticated = !member && process.env.NODE_ENV !== 'production'
    if (!privileged && !devUnauthenticated) {
      return res.status(403).json({ error: 'Forbidden: requires ADMIN or OPS_MANAGER' })
    }

    const body = (req.body ?? {}) as { outbound?: Record<string, Partial<OutboundEntry>> }
    const patch = body.outbound
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      return res.status(400).json({ error: 'Body must include an outbound object' })
    }

    const validKeys = new Set(ERP_OUTBOUND_FEEDS.map((f) => f.key))
    for (const key of Object.keys(patch)) {
      if (!validKeys.has(key)) {
        return res.status(400).json({ error: `Unknown outbound feed key: ${key}` })
      }
    }

    const integration = await prisma.integration.findFirst({
      where: { type: req.params.type as string },
    })
    if (!integration) return res.status(404).json({ error: 'Integration not found' })

    const config = setOutboundOnConfig(integration.config, patch)
    await prisma.integration.update({
      where: { id: integration.id },
      data: { config },
    })

    const updated = await prisma.integration.findUnique({ where: { id: integration.id } })
    const { configured } = await getErpConfig(prisma)
    res.json({
      connected: updated?.status === 'CONNECTED',
      configured,
      feeds: await feedOutboundResponse(updated),
    })
  } catch (error) {
    console.error('[integrations] PATCH /:type/outbound error:', error)
    res.status(500).json({ error: 'Failed to update outbound config' })
  }
})

// POST push — ADMIN / OPS_MANAGER only (with a dev escape hatch). Pushes the
// enabled outbound feeds (or the explicitly-requested feeds) to the ERP and
// records a SyncLog noting the OUTBOUND direction.
integrationRoutes.post('/:type/push', async (req: Request, res: Response) => {
  try {
    if (req.params.type !== 'ERP_KAREVE_SYNC') {
      return res.status(404).json({ error: 'Push is only available for ERP_KAREVE_SYNC' })
    }

    // Role gate: same as routing/outbound PATCH.
    const member = (req as any).member as { role?: string } | undefined
    const role = member?.role
    const privileged = role === 'ADMIN' || role === 'OPS_MANAGER'
    const devUnauthenticated = !member && process.env.NODE_ENV !== 'production'
    if (!privileged && !devUnauthenticated) {
      return res.status(403).json({ error: 'Forbidden: requires ADMIN or OPS_MANAGER' })
    }

    const body = (req.body ?? {}) as { feeds?: string[] }
    let feedKeys: string[] | undefined
    if (body.feeds !== undefined) {
      if (
        !Array.isArray(body.feeds) ||
        !body.feeds.every((f) => typeof f === 'string')
      ) {
        return res.status(400).json({ error: 'feeds must be an array of feed keys' })
      }
      const validKeys = new Set(ERP_OUTBOUND_FEEDS.map((f) => f.key))
      for (const key of body.feeds) {
        if (!validKeys.has(key)) {
          return res.status(400).json({ error: `Unknown outbound feed key: ${key}` })
        }
      }
      feedKeys = body.feeds
    }

    const integration = await prisma.integration.findFirst({
      where: { type: req.params.type as string },
    })
    if (!integration) return res.status(404).json({ error: 'Integration not found' })

    const syncLog = await prisma.syncLog.create({
      data: { integrationId: integration.id, status: 'RUNNING' },
    })

    try {
      const result = await pushErp(prisma, feedKeys)

      // A push is a DRY RUN when the ERP is not configured (no feed sent real
      // data). Surface this so the UI can label it "dry run (ERP not connected)".
      const anyFeed = Object.values(result.feeds)
      const dryRun = anyFeed.length > 0 ? anyFeed.every((f) => f.dryRun) : true
      const errors = anyFeed
        .map((f) => f.error)
        .filter((e): e is string => Boolean(e))

      await prisma.syncLog.update({
        where: { id: syncLog.id },
        data: {
          status: errors.length ? 'FAILED' : 'COMPLETE',
          completedAt: new Date(),
          recordsProcessed: result.pushed,
          // Tag the direction + outcome so logs distinguish push from sync.
          errors: {
            direction: 'OUTBOUND',
            dryRun,
            feeds: feedKeys ?? 'all-enabled',
            ...(errors.length ? { messages: errors } : {}),
          },
        },
      })

      return res.json({ success: true, syncLogId: syncLog.id, dryRun, ...result })
    } catch (err) {
      await prisma.syncLog.update({
        where: { id: syncLog.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errors: { direction: 'OUTBOUND', message: String(err) },
        },
      })
      throw err
    }
  } catch (error) {
    console.error('[integrations] POST /:type/push error:', error)
    res.status(500).json({ error: 'Failed to push to ERP' })
  }
})

// ─── Refresh open orders (Production Tracking → pull ERP PO feed) ───
// Fired by the Refresh button in the Open-Order view. Pulls the ERP open-order
// feed and upserts it into the PRODUCTION_TRACKING module (synthetic feed when
// the ERP is unconfigured). Independent of the full multi-feed sync.
integrationRoutes.post('/erp/refresh-open-orders', async (_req: Request, res: Response) => {
  try {
    const result = await syncErpOpenOrders(prisma)
    res.json({ ok: true, ...result })
  } catch (err) {
    console.error('[integrations] POST /erp/refresh-open-orders error:', err)
    res.status(502).json({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
})

// ─── Push a single open order's PO status/notes to the ERP ──────────
// Fired from the order drawer after a PO-status / urgency / note change.
// Dry-run when the ERP is unconfigured (never fakes a send).
integrationRoutes.post('/erp/push-open-order/:itemId', async (req: Request, res: Response) => {
  try {
    const item = await prisma.moduleItem.findUnique({ where: { id: req.params.itemId as string } })
    if (!item) return res.status(404).json({ ok: false, error: 'item not found' })
    const integration = await prisma.integration.findFirst({ where: { type: 'ERP_KAREVE_SYNC' } })
    const path = getOutbound(integration).openOrders?.erpPath || '/open-orders'
    const result = await pushToErp(prisma, path, [mapOpenOrderForErp(item.data as any)])
    res.json({ ok: true, ...result })
  } catch (err) {
    console.error('[integrations] POST /erp/push-open-order error:', err)
    res.status(502).json({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
})

// ─── Disconnect integration ─────────────────────────────────
integrationRoutes.post('/:type/disconnect', async (req: Request, res: Response) => {
  try {
    await prisma.integration.updateMany({
      where: { type: req.params.type as string },
      data: { status: 'DISCONNECTED', config: {} },
    })
    res.json({ success: true })
  } catch (error) {
    console.error('[integrations] POST /:type/disconnect error:', error)
    res.status(500).json({ error: 'Failed to disconnect integration' })
  }
})

// ─── Manual sync trigger ────────────────────────────────────
integrationRoutes.post('/:type/sync', async (req: Request, res: Response) => {
  try {
    const integration = await prisma.integration.findFirst({ where: { type: req.params.type as string } })
    if (!integration) return res.status(404).json({ error: 'Integration not found' })

    // Create sync log
    const syncLog = await prisma.syncLog.create({
      data: {
        integrationId: integration.id,
        status: 'RUNNING',
      },
    })

    // Update integration status
    await prisma.integration.update({
      where: { id: integration.id },
      data: { status: 'SYNCING' },
    })

    // Run the adapter out-of-band. The ERP integration pulls each enabled feed
    // into its configured Nexus module; other integrations remain simulated.
    //
    // This MUST be bulletproof: it runs after the HTTP response has been sent,
    // so any unhandled rejection here would crash the API process (and the
    // workflow would auto-restart, leaving the integration stuck in SYNCING —
    // which the UI renders as "Not connected"). Every await is wrapped, and the
    // failure path itself is guarded so it can never reject.
    const runSync = async () => {
      try {
        let recordsProcessed = Math.floor(Math.random() * 100)
        if (integration.type === 'ERP_KAREVE_SYNC') {
          const result = await syncErp(prisma)
          recordsProcessed = result.recordsProcessed
        }
        await prisma.syncLog.update({
          where: { id: syncLog.id },
          data: { status: 'COMPLETE', completedAt: new Date(), recordsProcessed },
        })
        await prisma.integration.update({
          where: { id: integration.id },
          data: {
            status: 'CONNECTED',
            lastSyncAt: new Date(),
            syncCount: { increment: 1 },
          },
        })
      } catch (err) {
        console.error('[integrations] ERP sync adapter error:', err)
        // Record the failure but keep the integration CONNECTED — the sync
        // adapter falls back to sample data rather than truly disconnecting, so
        // flipping to ERROR/SYNCING would misleadingly show "Not connected".
        try {
          await prisma.syncLog.update({
            where: { id: syncLog.id },
            data: { status: 'FAILED', completedAt: new Date(), errors: { message: String(err) } },
          })
          await prisma.integration.update({
            where: { id: integration.id },
            data: { status: 'CONNECTED' },
          })
        } catch (recordErr) {
          console.error('[integrations] failed to record sync failure:', recordErr)
        }
      }
    }
    setTimeout(() => {
      void runSync()
    }, 2000)

    res.json({ success: true, syncLogId: syncLog.id })
  } catch (error) {
    console.error('[integrations] POST /:type/sync error:', error)
    res.status(500).json({ error: 'Failed to trigger sync' })
  }
})

// ─── Get sync status ────────────────────────────────────────
integrationRoutes.get('/:type/status', async (req: Request, res: Response) => {
  try {
    const integration = await prisma.integration.findFirst({ where: { type: req.params.type as string } })
    if (!integration) return res.status(404).json({ error: 'Integration not found' })
    res.json({ status: integration.status, lastSyncAt: integration.lastSyncAt, syncCount: integration.syncCount })
  } catch (error) {
    console.error('[integrations] GET /:type/status error:', error)
    res.status(500).json({ error: 'Failed to get integration status' })
  }
})

// ─── Get sync logs ──────────────────────────────────────────
integrationRoutes.get('/:type/logs', async (req: Request, res: Response) => {
  try {
    const integration = await prisma.integration.findFirst({ where: { type: req.params.type as string } })
    if (!integration) return res.status(404).json({ error: 'Integration not found' })

    const logs = await prisma.syncLog.findMany({
      where: { integrationId: integration.id },
      orderBy: { startedAt: 'desc' },
      take: 20,
    })
    res.json(logs)
  } catch (error) {
    console.error('[integrations] GET /:type/logs error:', error)
    res.status(500).json({ error: 'Failed to fetch sync logs' })
  }
})

// ─── Zapier Webhook Receiver (separate router) ──────────────
webhookRoutes.post('/zapier/:webhookId', async (req: Request, res: Response) => {
  try {
    const { webhookId } = req.params

    // Find the Zapier integration whose encrypted config contains this webhookId
    const integrations = await prisma.integration.findMany({
      where: { type: 'ZAPIER', status: 'CONNECTED' },
    })

    let matchedIntegration: typeof integrations[0] | null = null

    for (const integration of integrations) {
      try {
        const config = integration.config as { iv: string; encrypted: string; tag: string }
        if (!config?.iv || !config?.encrypted || !config?.tag) continue
        const decrypted = decryptJson<{ webhookId: string }>(config)
        if (decrypted.webhookId === webhookId) {
          matchedIntegration = integration
          break
        }
      } catch {
        // Decryption failed for this record — skip it
        continue
      }
    }

    if (!matchedIntegration) {
      return res.status(404).json({ error: 'Webhook not found' })
    }

    // Log the incoming webhook
    await prisma.syncLog.create({
      data: {
        integrationId: matchedIntegration.id,
        status: 'COMPLETE',
        completedAt: new Date(),
        recordsProcessed: 1,
      },
    })

    // Update integration stats
    await prisma.integration.update({
      where: { id: matchedIntegration.id },
      data: {
        lastSyncAt: new Date(),
        syncCount: { increment: 1 },
      },
    })

    res.json({ received: true, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('[webhooks] POST /zapier/:webhookId error:', error)
    res.status(500).json({ error: 'Webhook processing failed' })
  }
})
