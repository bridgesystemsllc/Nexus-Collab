import crypto from 'crypto'

// ─── State Parameter (CSRF protection) ────────────────────────
const pendingStates = new Map<string, { provider: string; createdAt: number }>()

export function generateState(provider: string): string {
  const state = crypto.randomBytes(32).toString('hex')
  pendingStates.set(state, { provider, createdAt: Date.now() })
  // Clean up states older than 10 minutes
  for (const [key, value] of pendingStates) {
    if (Date.now() - value.createdAt > 10 * 60 * 1000) pendingStates.delete(key)
  }
  return state
}

export function validateState(state: string, expectedProvider: string): boolean {
  const entry = pendingStates.get(state)
  if (!entry) return false
  if (entry.provider !== expectedProvider) return false
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
  return response.json()
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
  return response.json()
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
  return response.json()
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
  return response.json()
}
