// ─── Notion API Client ───────────────────────────────────────
// Wraps the Notion REST API for searching pages and creating pages.
// Uses Notion-Version: 2026-03-11 as per current live docs.

import { decryptJson } from './encryption'
import type { PrismaClient } from '@prisma/client'

const NOTION_VERSION = '2026-03-11'
const NOTION_API_BASE = 'https://api.notion.com/v1'

interface NotionTokenData {
  accessToken: string
  workspaceId: string
  workspaceName: string | null
  botId: string
}

interface NotionPage {
  id: string
  url: string
  title: string
  createdTime: string
  lastEditedTime: string
  parentType: string
  parentId: string | null
}

interface NotionSearchResult {
  pages: NotionPage[]
  hasMore: boolean
  nextCursor: string | null
}

interface NotionCreatePageResult {
  id: string
  url: string
}

export class NotionNotConnectedError extends Error {
  constructor() {
    super('Notion is not connected')
    this.name = 'NotionNotConnectedError'
  }
}

export class NotionApiError extends Error {
  code: string
  status: number

  constructor(message: string, code: string, status: number) {
    super(message)
    this.name = 'NotionApiError'
    this.code = code
    this.status = status
  }
}

export async function getNotionConfig(
  prisma: PrismaClient,
  orgId: string,
): Promise<{ configured: boolean; tokens: NotionTokenData | null }> {
  const integration = await prisma.integration.findFirst({
    where: { type: 'NOTION', orgId },
  })

  if (!integration || integration.status !== 'CONNECTED') {
    return { configured: false, tokens: null }
  }

  const config = integration.config as { iv?: string; encrypted?: string; tag?: string } | null
  if (!config?.iv || !config?.encrypted || !config?.tag) {
    return { configured: false, tokens: null }
  }

  try {
    const decrypted = decryptJson<NotionTokenData>(config as { iv: string; encrypted: string; tag: string })
    return { configured: true, tokens: decrypted }
  } catch {
    return { configured: false, tokens: null }
  }
}

async function notionFetch<T>(
  accessToken: string,
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const { method = 'GET', body } = options

  const response = await fetch(`${NOTION_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    let errorData: { code?: string; message?: string } = {}
    try {
      errorData = (await response.json()) as { code?: string; message?: string }
    } catch {
      errorData = { message: await response.text() }
    }
    throw new NotionApiError(
      errorData.message || `Notion API error: HTTP ${response.status}`,
      errorData.code || 'notion_error',
      response.status,
    )
  }

  return (await response.json()) as T
}

function extractPageTitle(page: any): string {
  const titleProp = page.properties?.title || page.properties?.Title || page.properties?.Name
  if (titleProp?.title?.[0]?.plain_text) {
    return titleProp.title[0].plain_text
  }
  if (page.title?.[0]?.plain_text) {
    return page.title[0].plain_text
  }
  return 'Untitled'
}

export async function searchNotionPages(
  prisma: PrismaClient,
  orgId: string,
  query?: string,
  cursor?: string,
): Promise<NotionSearchResult> {
  const { configured, tokens } = await getNotionConfig(prisma, orgId)
  if (!configured || !tokens) {
    throw new NotionNotConnectedError()
  }

  const body: Record<string, unknown> = {
    filter: { property: 'object', value: 'page' },
    sort: { direction: 'descending', timestamp: 'last_edited_time' },
    page_size: 50,
  }

  if (query?.trim()) {
    body.query = query.trim()
  }
  if (cursor) {
    body.start_cursor = cursor
  }

  const data = await notionFetch<{
    results: any[]
    has_more: boolean
    next_cursor: string | null
  }>(tokens.accessToken, '/search', { method: 'POST', body })

  const pages: NotionPage[] = data.results.map((page) => ({
    id: page.id,
    url: page.url,
    title: extractPageTitle(page),
    createdTime: page.created_time,
    lastEditedTime: page.last_edited_time,
    parentType: page.parent?.type || 'workspace',
    parentId: page.parent?.page_id || page.parent?.database_id || null,
  }))

  return {
    pages,
    hasMore: data.has_more,
    nextCursor: data.next_cursor,
  }
}

export async function createNotionPage(
  prisma: PrismaClient,
  orgId: string,
  title: string,
  body?: string,
  parentPageId?: string,
): Promise<NotionCreatePageResult> {
  const { configured, tokens } = await getNotionConfig(prisma, orgId)
  if (!configured || !tokens) {
    throw new NotionNotConnectedError()
  }

  const children: any[] = []

  if (body) {
    const paragraphs = body.split('\n').filter((p) => p.trim())
    for (const paragraph of paragraphs) {
      children.push({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: paragraph } }],
        },
      })
    }
  }

  const pageData: Record<string, unknown> = {
    parent: parentPageId
      ? { type: 'page_id', page_id: parentPageId }
      : { type: 'workspace', workspace: true },
    properties: {
      title: {
        title: [{ type: 'text', text: { content: title } }],
      },
    },
  }

  if (children.length > 0) {
    pageData.children = children
  }

  const data = await notionFetch<{ id: string; url: string }>(tokens.accessToken, '/pages', {
    method: 'POST',
    body: pageData,
  })

  return {
    id: data.id,
    url: data.url,
  }
}
