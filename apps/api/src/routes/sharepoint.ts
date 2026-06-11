import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { getGraphClient } from '../services/emailAgent/graphClient'

// ─── SharePoint folder listing ───────────────────────────────
// Lists the children of a SharePoint folder via the Microsoft Graph shares
// API using the same app-only credentials as the email agent
// (GRAPH_* with MICROSOFT_* fallback). Requires the Files.Read.All
// application permission on the app registration.

export const sharepointRoutes: ReturnType<typeof Router> = Router()

const listQuerySchema = z.object({
  url: z
    .string()
    .url()
    .refine((u) => u.startsWith('https://'), { message: 'url must be an https URL' }),
})

function isGraphConfigured(): boolean {
  const tenantId = process.env.GRAPH_TENANT_ID || process.env.MICROSOFT_TENANT_ID
  const clientId = process.env.GRAPH_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID
  const clientSecret = process.env.GRAPH_CLIENT_SECRET || process.env.MICROSOFT_CLIENT_SECRET
  return !!(tenantId && clientId && clientSecret)
}

// Graph "sharing URL" encoding: 'u!' + unpadded base64url of the raw URL.
function toShareId(url: string): string {
  return 'u!' + Buffer.from(url, 'utf8').toString('base64').replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-')
}

sharepointRoutes.get('/list', async (req: Request, res: Response) => {
  const parsed = listQuerySchema.safeParse({ url: req.query.url })
  if (!parsed.success) {
    return res.status(400).json({ error: 'A valid https folder URL is required (url query param)' })
  }

  // Honest config check — when Graph credentials are absent we say so instead
  // of fabricating data.
  if (!isGraphConfigured()) {
    return res.json({
      configured: false,
      required: ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET'],
    })
  }

  try {
    const client = await getGraphClient()
    const shareId = toShareId(parsed.data.url)
    const result = await client
      .api(`/shares/${shareId}/driveItem/children`)
      .select('name,file,folder,lastModifiedDateTime,webUrl,size')
      .get()

    const files = ((result?.value as any[]) ?? []).map((item) => {
      const name: string = item.name ?? ''
      const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : 'file'
      return {
        name,
        type: item.folder ? 'folder' : ext,
        lastModified: item.lastModifiedDateTime ?? null,
        webUrl: item.webUrl ?? null,
        size: item.size ?? null,
      }
    })

    res.json({ configured: true, files })
  } catch (error: any) {
    // Sanitize: surface only the Graph status/code, never raw error payloads
    // (which can echo tokens or tenant internals).
    const status = error?.statusCode || error?.status
    const code = typeof error?.code === 'string' ? error.code : null
    console.error('[sharepoint] list failed:', status, code, error?.message)
    res.status(502).json({
      error: 'sharepoint_request_failed',
      message: status
        ? `Microsoft Graph responded with ${status}${code ? ` (${code})` : ''}. Check the folder URL and app permissions (Files.Read.All).`
        : 'Could not reach Microsoft Graph. Check credentials and connectivity.',
    })
  }
})
