import crypto from 'crypto'
import type { Request } from 'express'
import { prisma } from '../index'
import { encryptJson, decryptJson } from './encryption'

// ─── Microsoft Graph (per-user, delegated) ───────────────────
// Each NEXUS member connects their OWN Microsoft work account so the app can
// read their own Outlook mail and OneDrive files on their behalf. Tokens are
// stored per-member (MicrosoftAccount model), encrypted at rest, and refreshed
// silently when the access token expires.

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

// Delegated scopes for the foundation + the two downstream attach features.
// Read-only by design; offline_access is required to get a refresh token.
export const MS_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'User.Read',
  'Mail.Read',
  'Files.Read',
]

// Thrown when a member has no connected Microsoft account (or the refresh
// token is no longer valid). Routes surface this as a 412 so the UI can prompt
// the user to (re)connect rather than showing a hard error.
export class MicrosoftNotConnectedError extends Error {
  constructor(message = 'MICROSOFT_NOT_CONNECTED') {
    super(message)
    this.name = 'MicrosoftNotConnectedError'
  }
}

// Accept either the AZURE_* names (shared with Microsoft sign-in) or the older
// MICROSOFT_* names already used by the org-level integrations route.
export function getMsConfig() {
  return {
    tenantId: process.env.AZURE_TENANT_ID || process.env.MICROSOFT_TENANT_ID || '',
    clientId: process.env.AZURE_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID || '',
    clientSecret: process.env.AZURE_CLIENT_SECRET || process.env.MICROSOFT_CLIENT_SECRET || '',
  }
}

export function isMicrosoftConfigured(): boolean {
  const { tenantId, clientId, clientSecret } = getMsConfig()
  return !!(tenantId && clientId && clientSecret)
}

// The redirect URI must match EXACTLY what is registered in the Entra app.
// In Replit the public domain comes from REPLIT_DOMAINS (the request host is
// localhost behind the Vite proxy). An explicit override wins when set.
export function getRedirectUri(req: Request): string {
  if (process.env.MICROSOFT_GRAPH_REDIRECT_URI) return process.env.MICROSOFT_GRAPH_REDIRECT_URI
  const domain = (process.env.REPLIT_DOMAINS || '').split(',')[0]?.trim()
  const base = domain ? `https://${domain}` : `${req.protocol}://${req.get('host')}`
  return `${base}/api/v1/integrations/microsoft/callback`
}

// ─── OAuth state (CSRF) ──────────────────────────────────────
// The state is an opaque random nonce. Its binding to the acting member and its
// single-use semantics are enforced server-side via the session store (see the
// connect/callback routes) — the value itself carries no trust.
export function createStateNonce(): string {
  return crypto.randomBytes(32).toString('hex')
}

// Constant-time comparison of two same-purpose strings.
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return crypto.timingSafeEqual(ab, bb)
}

// ─── Authorize URL ───────────────────────────────────────────
export function buildAuthUrl(redirectUri: string, state: string): string {
  const { tenantId, clientId } = getMsConfig()
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: MS_SCOPES.join(' '),
    state,
    prompt: 'select_account',
  })
  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`
}

// ─── Token endpoints ─────────────────────────────────────────
interface MsTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  scope?: string
}

async function tokenRequest(body: Record<string, string>): Promise<MsTokenResponse> {
  const { tenantId } = getMsConfig()
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  })
  if (!res.ok) {
    throw new Error(`Microsoft token request failed (${res.status}): ${await res.text()}`)
  }
  return (await res.json()) as MsTokenResponse
}

export function exchangeCode(code: string, redirectUri: string): Promise<MsTokenResponse> {
  const { clientId, clientSecret } = getMsConfig()
  return tokenRequest({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    scope: MS_SCOPES.join(' '),
  })
}

function refreshTokens(refreshToken: string): Promise<MsTokenResponse> {
  const { clientId, clientSecret } = getMsConfig()
  return tokenRequest({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    scope: MS_SCOPES.join(' '),
  })
}

// ─── Profile ─────────────────────────────────────────────────
export interface MsProfile {
  id?: string
  displayName?: string
  mail?: string
  userPrincipalName?: string
}

export async function fetchProfile(accessToken: string): Promise<MsProfile> {
  const res = await fetch(`${GRAPH_BASE}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Graph /me failed (${res.status}): ${await res.text()}`)
  return (await res.json()) as MsProfile
}

// ─── Token store (per member) ────────────────────────────────
interface StoredTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

export async function saveTokensForMember(
  memberId: string,
  tokens: MsTokenResponse,
  profile: MsProfile,
) {
  const accountEmail = profile.mail || profile.userPrincipalName || 'unknown'
  const expiresAt = Date.now() + tokens.expires_in * 1000
  const tokenData = encryptJson({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || '',
    expiresAt,
  })
  const data = {
    accountEmail,
    accountName: profile.displayName || null,
    tokenData: tokenData as unknown as object,
    scope: tokens.scope || MS_SCOPES.join(' '),
  }
  await prisma.microsoftAccount.upsert({
    where: { memberId },
    create: { memberId, ...data },
    update: data,
  })
}

export async function getMicrosoftAccount(memberId: string) {
  return prisma.microsoftAccount.findUnique({ where: { memberId } })
}

export async function disconnectMember(memberId: string) {
  await prisma.microsoftAccount.deleteMany({ where: { memberId } })
}

// Returns a valid access token for the member, silently refreshing when the
// stored one is expired (60s safety buffer). Throws MicrosoftNotConnectedError
// if the member never connected or the refresh token is rejected.
export async function getAccessTokenForMember(memberId: string): Promise<string> {
  const rec = await prisma.microsoftAccount.findUnique({ where: { memberId } })
  if (!rec) throw new MicrosoftNotConnectedError()

  const stored = decryptJson<StoredTokens>(rec.tokenData as any)
  if (Date.now() < stored.expiresAt - 60_000) return stored.accessToken

  if (!stored.refreshToken) {
    await disconnectMember(memberId)
    throw new MicrosoftNotConnectedError()
  }

  try {
    const refreshed = await refreshTokens(stored.refreshToken)
    const expiresAt = Date.now() + refreshed.expires_in * 1000
    const tokenData = encryptJson({
      accessToken: refreshed.access_token,
      // MS may rotate the refresh token; keep the previous one if not returned.
      refreshToken: refreshed.refresh_token || stored.refreshToken,
      expiresAt,
    })
    await prisma.microsoftAccount.update({
      where: { memberId },
      data: { tokenData: tokenData as unknown as object },
    })
    return refreshed.access_token
  } catch (err) {
    // Refresh token expired/revoked → require a fresh connect.
    await disconnectMember(memberId)
    throw new MicrosoftNotConnectedError()
  }
}

// Authenticated GET against Microsoft Graph for the given member. Downstream
// features (Outlook/OneDrive) build on this. `pathWithQuery` starts with '/'.
export async function graphGet<T = any>(memberId: string, pathWithQuery: string): Promise<T> {
  const token = await getAccessTokenForMember(memberId)
  const res = await fetch(`${GRAPH_BASE}${pathWithQuery}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 401) {
    // Token rejected despite refresh attempt → force reconnect.
    throw new MicrosoftNotConnectedError()
  }
  if (!res.ok) {
    throw new Error(`Graph request failed (${res.status}): ${await res.text()}`)
  }
  return (await res.json()) as T
}

// Authenticated POST against Microsoft Graph for the given member. Returns the
// parsed JSON body, or null for empty responses (202 Accepted / 204 No Content,
// e.g. /sendMail and /reply, which return no body).
export async function graphPost<T = any>(memberId: string, pathWithQuery: string, body: unknown): Promise<T | null> {
  const token = await getAccessTokenForMember(memberId)
  const res = await fetch(`${GRAPH_BASE}${pathWithQuery}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  if (res.status === 401) throw new MicrosoftNotConnectedError()
  if (!res.ok) {
    throw new Error(`Graph request failed (${res.status}): ${await res.text()}`)
  }
  if (res.status === 202 || res.status === 204) return null
  const text = await res.text()
  return (text ? JSON.parse(text) : null) as T | null
}
