import crypto from 'crypto'

interface OAuthTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
}

// ─── State Parameter (CSRF protection) ────────────────────────
const pendingStates = new Map<string, { provider: string; orgId: string; createdAt: number }>()

export function generateState(provider: string, orgId: string): string {
  const state = crypto.randomBytes(32).toString('hex')
  pendingStates.set(state, { provider, orgId, createdAt: Date.now() })
  // Clean up states older than 10 minutes
  for (const [key, value] of pendingStates) {
    if (Date.now() - value.createdAt > 10 * 60 * 1000) pendingStates.delete(key)
  }
  return state
}

export function validateState(state: string, expectedProvider: string, expectedOrgId: string): boolean {
  const entry = pendingStates.get(state)
  if (!entry) return false
  if (entry.provider !== expectedProvider) return false
  if (entry.orgId !== expectedOrgId) return false
  if (Date.now() - entry.createdAt > 10 * 60 * 1000) {
    pendingStates.delete(state)
    return false
  }
  pendingStates.delete(state)
  return true
}

// ─── Microsoft Token Exchange ─────────────────────────────────
export async function exchangeMicrosoftToken(code: string): Promise<{
  access_token: string
  refresh_token: string
  expires_in: number
}> {
  const tenantId = process.env.MICROSOFT_TENANT_ID
  const response = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID || '',
        client_secret: process.env.MICROSOFT_CLIENT_SECRET || '',
        code,
        redirect_uri: process.env.MICROSOFT_REDIRECT_URI || '',
        grant_type: 'authorization_code',
        scope: 'openid profile offline_access Mail.Read Mail.Send Mail.ReadWrite Files.ReadWrite.All ChannelMessage.Send Chat.ReadWrite User.Read',
      }),
    }
  )
  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Microsoft token exchange failed: ${err}`)
  }
  return (await response.json()) as OAuthTokenResponse as {
    access_token: string
    refresh_token: string
    expires_in: number
  }
}

export async function refreshMicrosoftToken(refreshToken: string): Promise<{
  access_token: string
  refresh_token: string
  expires_in: number
}> {
  const tenantId = process.env.MICROSOFT_TENANT_ID
  const response = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID || '',
        client_secret: process.env.MICROSOFT_CLIENT_SECRET || '',
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
        scope: 'openid profile offline_access Mail.Read Mail.Send Mail.ReadWrite Files.ReadWrite.All ChannelMessage.Send Chat.ReadWrite User.Read',
      }),
    }
  )
  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Microsoft token refresh failed: ${err}`)
  }
  return (await response.json()) as OAuthTokenResponse as {
    access_token: string
    refresh_token: string
    expires_in: number
  }
}

// ─── Google Token Exchange ────────────────────────────────────
export async function exchangeGoogleToken(code: string): Promise<{
  access_token: string
  refresh_token: string
  expires_in: number
}> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      code,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI || '',
      grant_type: 'authorization_code',
    }),
  })
  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Google token exchange failed: ${err}`)
  }
  return (await response.json()) as OAuthTokenResponse as {
    access_token: string
    refresh_token: string
    expires_in: number
  }
}

export async function refreshGoogleToken(refreshToken: string): Promise<{
  access_token: string
  expires_in: number
}> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Google token refresh failed: ${err}`)
  }
  return (await response.json()) as OAuthTokenResponse as {
    access_token: string
    expires_in: number
  }
}

// ─── Notion Token Exchange ────────────────────────────────────
export async function exchangeNotionToken(code: string): Promise<{
  access_token: string
  workspace_id: string
  workspace_name: string | null
  workspace_icon: string | null
  bot_id: string
  owner: { type: string; user?: { id: string; name: string; avatar_url: string | null } }
}> {
  const clientId = process.env.NOTION_CLIENT_ID || ''
  const clientSecret = process.env.NOTION_CLIENT_SECRET || ''
  const redirectUri = process.env.NOTION_REDIRECT_URI || ''

  const response = await fetch('https://api.notion.com/v1/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  })
  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Notion token exchange failed: ${err}`)
  }
  return (await response.json()) as {
    access_token: string
    workspace_id: string
    workspace_name: string | null
    workspace_icon: string | null
    bot_id: string
    owner: { type: string; user?: { id: string; name: string; avatar_url: string | null } }
  }
}
