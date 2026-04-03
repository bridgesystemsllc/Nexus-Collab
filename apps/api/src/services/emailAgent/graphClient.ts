import { Client } from '@microsoft/microsoft-graph-client'

// Simple token cache for app-only auth
let cachedToken: { token: string; expiresAt: number } | null = null
interface GraphTokenResponse {
  access_token: string
  expires_in: number
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60000) {
    return cachedToken.token
  }

  const tenantId = process.env.GRAPH_TENANT_ID || process.env.MICROSOFT_TENANT_ID
  const clientId = process.env.GRAPH_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID
  const clientSecret = process.env.GRAPH_CLIENT_SECRET || process.env.MICROSOFT_CLIENT_SECRET

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Microsoft Graph credentials not configured (GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET)')
  }

  const response = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    }
  )

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Graph token acquisition failed: ${err}`)
  }

  const data = (await response.json()) as GraphTokenResponse
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
  return cachedToken.token
}

export async function getGraphClient(): Promise<Client> {
  const token = await getAccessToken()
  return Client.init({
    authProvider: (done) => done(null, token),
  })
}
