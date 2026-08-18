import { graphGet, graphPost } from '../../lib/microsoftGraph'

// ─── Email and Teams conversations on a task ─────────────────
// Thin, typed wrappers over the Microsoft Graph calls the task drawer makes.
// Everything runs as the acting member (delegated), never as the shared agent
// mailbox: a reply must come from the person who wrote it, and one person's
// task view must not expose another's inbox.
//
// Messages are never cached. Only the identifiers and enough text to render a
// list are stored locally; the bodies are fetched per view. A cached copy of an
// email or chat message goes stale the moment it is edited or deleted, and
// showing a deleted message as if it still stood is worse than a slower panel.

// ─── Shapes ──────────────────────────────────────────────────
// Graph's own JSON, narrowed to the fields used. Declared here rather than
// imported so a change in Graph's payload surfaces as a type error at the
// boundary instead of spreading `any` through the routes.

export interface GraphMessageSummary {
  id: string
  conversationId?: string
  subject?: string | null
  bodyPreview?: string | null
  receivedDateTime?: string
  from?: { emailAddress?: { name?: string; address?: string } }
  toRecipients?: { emailAddress?: { name?: string; address?: string } }[]
  hasAttachments?: boolean
  webLink?: string
}

export interface GraphMessageBody extends GraphMessageSummary {
  body?: { contentType?: string; content?: string }
}

export interface GraphChat {
  id: string
  topic?: string | null
  chatType?: string
  lastUpdatedDateTime?: string
  members?: { displayName?: string | null; email?: string | null }[]
}

export interface GraphChatMessage {
  id: string
  createdDateTime?: string
  from?: { user?: { displayName?: string | null; id?: string } | null } | null
  body?: { contentType?: string; content?: string }
  deletedDateTime?: string | null
}

const enc = encodeURIComponent

// ─── Mail ────────────────────────────────────────────────────

const MESSAGE_FIELDS =
  'id,conversationId,subject,bodyPreview,receivedDateTime,from,toRecipients,hasAttachments,webLink'

/**
 * Recent mail for the picker, optionally filtered by a search term.
 *
 * `$search` and `$orderby` cannot be combined in Graph — a search request that
 * also sorts returns 400. So a search relies on Graph's relevance ordering and
 * only the unfiltered list sorts by date.
 */
export async function listMessages(
  memberId: string,
  opts: { search?: string; limit?: number } = {},
): Promise<GraphMessageSummary[]> {
  const top = Math.min(Math.max(opts.limit ?? 20, 1), 50)
  const q = opts.search?.trim()

  const path = q
    ? `/me/messages?$search=${enc(`"${q}"`)}&$top=${top}&$select=${MESSAGE_FIELDS}`
    : `/me/messages?$top=${top}&$orderby=receivedDateTime desc&$select=${MESSAGE_FIELDS}`

  const res = await graphGet<{ value: GraphMessageSummary[] }>(memberId, path)
  return res.value ?? []
}

/** One message including its body, for the thread view. */
export async function getMessage(memberId: string, messageId: string): Promise<GraphMessageBody> {
  return graphGet<GraphMessageBody>(
    memberId,
    `/me/messages/${enc(messageId)}?$select=${MESSAGE_FIELDS},body`,
  )
}

/**
 * Every message in the conversation an attached email belongs to, oldest first
 * — so attaching one message shows the whole exchange rather than a fragment.
 */
export async function getThread(
  memberId: string,
  conversationId: string,
): Promise<GraphMessageBody[]> {
  const res = await graphGet<{ value: GraphMessageBody[] }>(
    memberId,
    `/me/messages?$filter=conversationId eq '${enc(conversationId)}'` +
      `&$orderby=receivedDateTime asc&$top=50&$select=${MESSAGE_FIELDS},body`,
  )
  return res.value ?? []
}

/**
 * Reply to everyone on the message, as the acting member.
 *
 * Graph's /reply returns 202 with no body, so there is no new message id to
 * report. The caller re-fetches the thread rather than guessing what was
 * appended.
 */
export async function replyToMessage(
  memberId: string,
  messageId: string,
  comment: string,
  replyAll = true,
): Promise<void> {
  const verb = replyAll ? 'replyAll' : 'reply'
  await graphPost(memberId, `/me/messages/${enc(messageId)}/${verb}`, { comment })
}

// ─── Teams chats ─────────────────────────────────────────────

/**
 * The member's chats, most recently updated first.
 *
 * `lastUpdatedDateTime` is when the chat was renamed or its membership
 * changed, not when it was last spoken in — Graph exposes no last-message time
 * on the chat list — so the ordering is a rough proxy and the picker says so.
 */
export async function listChats(memberId: string, limit = 25): Promise<GraphChat[]> {
  const top = Math.min(Math.max(limit, 1), 50)
  const res = await graphGet<{ value: GraphChat[] }>(
    memberId,
    `/me/chats?$top=${top}&$expand=members&$orderby=lastUpdatedDateTime desc`,
  )
  return res.value ?? []
}

export async function getChat(memberId: string, chatId: string): Promise<GraphChat> {
  return graphGet<GraphChat>(memberId, `/me/chats/${enc(chatId)}?$expand=members`)
}

/** Recent messages in a chat, oldest first so the panel reads as a transcript. */
export async function getChatMessages(
  memberId: string,
  chatId: string,
  limit = 30,
): Promise<GraphChatMessage[]> {
  const top = Math.min(Math.max(limit, 1), 50)
  const res = await graphGet<{ value: GraphChatMessage[] }>(
    memberId,
    `/me/chats/${enc(chatId)}/messages?$top=${top}`,
  )
  // Graph returns newest first here and offers no $orderby on chat messages.
  // Reversing locally is the only way to get transcript order.
  const messages = (res.value ?? []).slice().reverse()
  // A deleted message comes back with an empty body and deletedDateTime set;
  // rendering it as a blank bubble looks like a bug.
  return messages.filter((m) => !m.deletedDateTime)
}

export async function sendChatMessage(
  memberId: string,
  chatId: string,
  content: string,
): Promise<GraphChatMessage | null> {
  return graphPost<GraphChatMessage>(memberId, `/me/chats/${enc(chatId)}/messages`, {
    body: { contentType: 'text', content },
  })
}

// ─── Display helpers ─────────────────────────────────────────

/**
 * What to call a chat in a list. A 1:1 has no topic — Teams titles it by the
 * other person — so falling back to the raw id would show a meaningless
 * `19:...@thread.v2`.
 */
export function chatLabel(chat: { topic?: string | null; memberNames?: string[] }, selfName?: string): string {
  if (chat.topic?.trim()) return chat.topic.trim()
  const others = (chat.memberNames ?? []).filter((n) => n && n !== selfName)
  if (others.length === 0) return 'Chat'
  if (others.length <= 3) return others.join(', ')
  return `${others.slice(0, 3).join(', ')} +${others.length - 3}`
}

export function memberNamesOf(chat: GraphChat): string[] {
  return (chat.members ?? [])
    .map((m) => m.displayName?.trim() || m.email?.trim() || '')
    .filter(Boolean)
}
