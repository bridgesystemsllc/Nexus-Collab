import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle, ArrowLeft, Mail, MessageSquare, Plus, Search, Send, Trash2, X,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useModalBehaviour } from '../lib/useModalBehaviour'
import { formatDate } from './ProjectCard'

// ─── Email and Teams on a task ───────────────────────────────
// Attach a mail thread or a Teams chat and reply without leaving the task.
//
// Everything runs as the signed-in member's own Microsoft account, so the
// panel has a state most features do not: connected, not connected, or
// connected-but-under-consented. The API answers 412 for the last two, and
// this treats that as a prompt rather than an error — it is the state every
// user is in the first time they open it.

interface EmailLink {
  id: string
  messageId: string
  subject: string
  fromAddr: string
  toAddrs: string[]
  date: string
  snippet: string | null
  metadata?: { conversationId?: string | null; webLink?: string | null; fromName?: string | null } | null
}

interface ChatLink {
  id: string
  chatId: string
  topic: string | null
  chatType: string
  memberNames: string[]
  linkedBy?: { id: string; name: string } | null
}

interface GraphMessage {
  id: string
  subject?: string | null
  bodyPreview?: string | null
  receivedDateTime?: string
  from?: { emailAddress?: { name?: string; address?: string } }
  body?: { contentType?: string; content?: string }
}

interface GraphChatMessage {
  id: string
  createdDateTime?: string
  from?: { user?: { displayName?: string | null } | null } | null
  body?: { contentType?: string; content?: string }
}

const isNotConnected = (err: any) => err?.response?.status === 412
const errMessage = (err: any) =>
  err?.response?.data?.error?.message ?? err?.message ?? 'Something went wrong'

/** Graph returns HTML for most mail; the panel shows text, not markup. */
function toPlainText(body?: { contentType?: string; content?: string }): string {
  const raw = body?.content ?? ''
  if ((body?.contentType ?? '').toLowerCase() !== 'html') return raw.trim()
  // Deliberately not rendering the HTML: an email body is untrusted input and
  // this panel is not a mail client with a sanitiser behind it.
  return raw
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function chatLabel(c: { topic: string | null; memberNames: string[] }): string {
  if (c.topic?.trim()) return c.topic.trim()
  if (c.memberNames.length === 0) return 'Chat'
  return c.memberNames.slice(0, 3).join(', ') + (c.memberNames.length > 3 ? ` +${c.memberNames.length - 3}` : '')
}

export function TaskConversations({ taskId, canEdit }: { taskId: string; canEdit: boolean }) {
  const qc = useQueryClient()
  const [picker, setPicker] = useState<'email' | 'chat' | null>(null)
  const [openEmail, setOpenEmail] = useState<EmailLink | null>(null)
  const [openChat, setOpenChat] = useState<ChatLink | null>(null)
  const [error, setError] = useState<string | null>(null)

  const key = ['projects', 'task-conversations', taskId]
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: async () =>
      (await api.get(`/projects/tasks/${taskId}/conversations`)).data as {
        data: { emails: EmailLink[]; chats: ChatLink[] }
      },
  })

  const detach = useMutation({
    mutationFn: ({ kind, id }: { kind: 'emails' | 'chats'; id: string }) =>
      api.delete(`/projects/tasks/${kind}/${id}`),
    onSuccess: () => { setError(null); qc.invalidateQueries({ queryKey: key }) },
    onError: (err) => setError(errMessage(err)),
  })

  const emails = data?.data.emails ?? []
  const chats = data?.data.chats ?? []
  const total = emails.length + chats.length

  return (
    <section className="mt-4">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-primary)]">
          <Mail size={11} className="text-[var(--text-tertiary)]" />
          Conversations
          {total > 0 && <span className="font-normal tabular-nums text-[var(--text-tertiary)]">{total}</span>}
        </h4>
        {canEdit && (
          <div className="flex gap-2">
            <button
              onClick={() => { setError(null); setPicker('email') }}
              className="inline-flex items-center gap-1 text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            >
              <Plus size={10} /> Email
            </button>
            <button
              onClick={() => { setError(null); setPicker('chat') }}
              className="inline-flex items-center gap-1 text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            >
              <Plus size={10} /> Teams
            </button>
          </div>
        )}
      </div>

      {error && (
        <div role="alert" className="mb-2 rounded-lg px-2.5 py-1.5 text-[11px] text-[var(--text-primary)]" style={{ background: 'rgba(255,69,58,0.08)' }}>
          {error}
        </div>
      )}

      {isLoading ? (
        <p className="text-[11px] text-[var(--text-tertiary)]">Loading…</p>
      ) : total === 0 ? (
        <p className="text-[11px] text-[var(--text-tertiary)]">
          Nothing attached.{canEdit ? ' Pull in the email thread or Teams chat where this is being discussed.' : ''}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {emails.map((e) => (
            <li key={e.id} className="flex items-start gap-2 rounded-lg border border-[var(--border-subtle)] px-2.5 py-2">
              <Mail size={11} className="mt-0.5 shrink-0 text-[var(--text-tertiary)]" />
              <button onClick={() => setOpenEmail(e)} className="min-w-0 flex-1 text-left">
                <p className="truncate text-[11px] font-medium text-[var(--text-primary)]">{e.subject}</p>
                <p className="truncate text-[10px] text-[var(--text-tertiary)]">
                  {e.metadata?.fromName || e.fromAddr} · {formatDate(e.date)}
                </p>
                {e.snippet && (
                  <p className="mt-0.5 line-clamp-1 text-[10px] text-[var(--text-tertiary)]">{e.snippet}</p>
                )}
              </button>
              {canEdit && (
                <button
                  onClick={() => detach.mutate({ kind: 'emails', id: e.id })}
                  aria-label={`Detach ${e.subject}`}
                  title="Detach — the email itself is not deleted"
                  className="shrink-0 rounded p-1 text-[var(--text-tertiary)] hover:text-[var(--danger)]"
                >
                  <Trash2 size={10} />
                </button>
              )}
            </li>
          ))}
          {chats.map((c) => (
            <li key={c.id} className="flex items-start gap-2 rounded-lg border border-[var(--border-subtle)] px-2.5 py-2">
              <MessageSquare size={11} className="mt-0.5 shrink-0 text-[var(--text-tertiary)]" />
              <button onClick={() => setOpenChat(c)} className="min-w-0 flex-1 text-left">
                <p className="truncate text-[11px] font-medium text-[var(--text-primary)]">{chatLabel(c)}</p>
                <p className="truncate text-[10px] text-[var(--text-tertiary)]">
                  Teams · {c.chatType === 'oneOnOne' ? 'direct message' : `${c.memberNames.length} people`}
                </p>
              </button>
              {canEdit && (
                <button
                  onClick={() => detach.mutate({ kind: 'chats', id: c.id })}
                  aria-label={`Detach ${chatLabel(c)}`}
                  title="Detach — the chat itself is untouched"
                  className="shrink-0 rounded p-1 text-[var(--text-tertiary)] hover:text-[var(--danger)]"
                >
                  <Trash2 size={10} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {picker && (
        <AttachPicker
          kind={picker}
          taskId={taskId}
          onClose={() => setPicker(null)}
          onAttached={() => { setPicker(null); qc.invalidateQueries({ queryKey: key }) }}
        />
      )}
      {openEmail && <EmailThread link={openEmail} canReply={canEdit} onClose={() => setOpenEmail(null)} />}
      {openChat && <ChatThread link={openChat} canReply={canEdit} onClose={() => setOpenChat(null)} />}
    </section>
  )
}

// ─── Not-connected state ─────────────────────────────────────

function NotConnected({ message }: { message: string }) {
  return (
    <div className="py-8 text-center">
      <AlertTriangle size={20} className="mx-auto mb-2 text-[var(--text-tertiary)]" />
      <p className="text-xs text-[var(--text-primary)]">Microsoft account not connected</p>
      <p className="mx-auto mt-1 max-w-xs text-[11px] text-[var(--text-tertiary)]">{message}</p>
      <a
        href="/integrations"
        className="mt-3 inline-block rounded-lg px-3 py-1.5 text-[11px] font-medium text-white"
        style={{ background: 'var(--accent-secondary)' }}
      >
        Connect in Integrations
      </a>
    </div>
  )
}

// ─── Picker ──────────────────────────────────────────────────

function AttachPicker({
  kind, taskId, onClose, onAttached,
}: { kind: 'email' | 'chat'; taskId: string; onClose: () => void; onAttached: () => void }) {
  const ref = useModalBehaviour(onClose)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)

  const list = useQuery({
    queryKey: ['graph', kind, search],
    queryFn: async () =>
      (await api.get(`/projects/tasks/graph/${kind === 'email' ? 'messages' : 'chats'}`, {
        params: kind === 'email' && search ? { search } : {},
      })).data,
    retry: false,
  })

  const attach = useMutation({
    mutationFn: (id: string) =>
      api.post(
        `/projects/tasks/${taskId}/${kind === 'email' ? 'emails' : 'chats'}`,
        kind === 'email' ? { messageId: id } : { chatId: id },
      ),
    onSuccess: onAttached,
    onError: (err) => setError(errMessage(err)),
  })

  return (
    <Modal dialogRef={ref} label={kind === 'email' ? 'Attach an email' : 'Attach a Teams chat'} onClose={onClose}>
      {list.isError && isNotConnected(list.error) ? (
        <NotConnected message={errMessage(list.error)} />
      ) : (
        <>
          {kind === 'email' && (
            <div className="relative mb-2">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search your mail…"
                autoFocus
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] py-1.5 pl-8 pr-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-strong)]"
              />
            </div>
          )}
          {kind === 'chat' && (
            <p className="mb-2 text-[10px] text-[var(--text-tertiary)]">
              Ordered by last rename or membership change — Teams does not expose a last-message
              time on the chat list.
            </p>
          )}

          {error && (
            <div role="alert" className="mb-2 rounded-lg px-2.5 py-1.5 text-[11px] text-[var(--text-primary)]" style={{ background: 'rgba(255,69,58,0.08)' }}>
              {error}
            </div>
          )}

          <div className="max-h-80 overflow-y-auto rounded-lg border border-[var(--border-subtle)]">
            {list.isLoading ? (
              <p className="py-8 text-center text-[11px] text-[var(--text-tertiary)]">Loading…</p>
            ) : list.isError ? (
              <p className="py-8 text-center text-[11px] text-[var(--text-tertiary)]">{errMessage(list.error)}</p>
            ) : (list.data?.data ?? []).length === 0 ? (
              <p className="py-8 text-center text-[11px] text-[var(--text-tertiary)]">
                {kind === 'email' ? (search ? 'No mail matches that.' : 'No recent mail.') : 'No chats.'}
              </p>
            ) : (
              <ul>
                {(list.data.data as any[]).map((item) => (
                  <li key={item.id} className="border-b border-[var(--border-subtle)] last:border-0">
                    <button
                      onClick={() => { setError(null); attach.mutate(item.id) }}
                      disabled={attach.isPending}
                      className="w-full px-3 py-2 text-left transition-colors hover:bg-[var(--bg-overlay)] disabled:opacity-50"
                    >
                      {kind === 'email' ? (
                        <>
                          <p className="truncate text-[11px] text-[var(--text-primary)]">
                            {item.subject || '(no subject)'}
                          </p>
                          <p className="truncate text-[10px] text-[var(--text-tertiary)]">
                            {item.from?.emailAddress?.name || item.from?.emailAddress?.address || 'unknown'}
                            {item.receivedDateTime ? ` · ${formatDate(item.receivedDateTime)}` : ''}
                          </p>
                          {item.bodyPreview && (
                            <p className="mt-0.5 line-clamp-1 text-[10px] text-[var(--text-tertiary)]">
                              {item.bodyPreview}
                            </p>
                          )}
                        </>
                      ) : (
                        <>
                          <p className="truncate text-[11px] text-[var(--text-primary)]">
                            {chatLabel({ topic: item.topic, memberNames: item.memberNames ?? [] })}
                          </p>
                          <p className="truncate text-[10px] text-[var(--text-tertiary)]">
                            {item.chatType === 'oneOnOne' ? 'Direct message' : `${(item.memberNames ?? []).length} people`}
                          </p>
                        </>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {attach.isPending && <p className="mt-2 text-[10px] text-[var(--text-tertiary)]">Attaching…</p>}
        </>
      )}
    </Modal>
  )
}

// ─── Email thread ────────────────────────────────────────────

function EmailThread({
  link, canReply, onClose,
}: { link: EmailLink; canReply: boolean; onClose: () => void }) {
  const ref = useModalBehaviour(onClose)
  const qc = useQueryClient()
  const [reply, setReply] = useState('')
  const [replyAll, setReplyAll] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const thread = useQuery({
    queryKey: ['graph', 'thread', link.id],
    queryFn: async () => (await api.get(`/projects/tasks/emails/${link.id}/thread`)).data,
    retry: false,
  })

  const send = useMutation({
    mutationFn: () =>
      api.post(`/projects/tasks/emails/${link.id}/reply`, { comment: reply.trim(), replyAll }),
    onSuccess: () => {
      setReply('')
      setSent(true)
      setError(null)
      // Graph returns no id for a reply, so there is nothing to append
      // optimistically — refetch and show what actually landed.
      qc.invalidateQueries({ queryKey: ['graph', 'thread', link.id] })
    },
    onError: (err) => setError(errMessage(err)),
  })

  const messages: GraphMessage[] = thread.data?.data ?? []

  return (
    <Modal dialogRef={ref} label={link.subject} onClose={onClose} wide>
      {thread.isError && isNotConnected(thread.error) ? (
        <NotConnected message={errMessage(thread.error)} />
      ) : (
        <>
          {thread.data?.meta?.partial && (
            <p className="mb-2 text-[10px] text-[var(--text-tertiary)]">
              Showing one message — this attachment has no conversation id, so the rest of the
              thread cannot be resolved.
            </p>
          )}

          <div className="max-h-[45vh] space-y-2 overflow-y-auto">
            {thread.isLoading ? (
              <p className="py-6 text-center text-[11px] text-[var(--text-tertiary)]">Loading thread…</p>
            ) : messages.length === 0 ? (
              <p className="py-6 text-center text-[11px] text-[var(--text-tertiary)]">
                {thread.isError ? errMessage(thread.error) : 'No messages.'}
              </p>
            ) : (
              messages.map((m) => (
                <article key={m.id} className="rounded-lg border border-[var(--border-subtle)] p-2.5">
                  <p className="text-[11px] font-medium text-[var(--text-primary)]">
                    {m.from?.emailAddress?.name || m.from?.emailAddress?.address || 'Unknown'}
                    <span className="ml-1.5 font-normal text-[var(--text-tertiary)]">
                      {m.receivedDateTime ? formatDate(m.receivedDateTime) : ''}
                    </span>
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-[var(--text-secondary)]">
                    {toPlainText(m.body) || m.bodyPreview || '(empty)'}
                  </p>
                </article>
              ))
            )}
          </div>

          {canReply && (
            <form
              onSubmit={(e) => { e.preventDefault(); if (reply.trim()) { setSent(false); send.mutate() } }}
              className="mt-3 border-t border-[var(--border-subtle)] pt-3"
            >
              {error && (
                <div role="alert" className="mb-2 rounded-lg px-2.5 py-1.5 text-[11px] text-[var(--text-primary)]" style={{ background: 'rgba(255,69,58,0.08)' }}>
                  {error}
                </div>
              )}
              {sent && !error && (
                <p className="mb-2 text-[11px]" style={{ color: 'var(--success)' }}>
                  Sent. It may take a moment to appear above.
                </p>
              )}
              <textarea
                value={reply}
                onChange={(e) => { setReply(e.target.value); setSent(false) }}
                rows={3}
                placeholder="Write a reply…"
                className="w-full resize-y rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2.5 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-strong)]"
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <label className="flex items-center gap-1.5 text-[10px] text-[var(--text-tertiary)]">
                  <input type="checkbox" checked={replyAll} onChange={(e) => setReplyAll(e.target.checked)} />
                  Reply to everyone
                </label>
                <button
                  type="submit"
                  disabled={!reply.trim() || send.isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium text-white disabled:opacity-50"
                  style={{ background: 'var(--accent-secondary)' }}
                >
                  <Send size={11} /> {send.isPending ? 'Sending…' : 'Send'}
                </button>
              </div>
              <p className="mt-1.5 text-[10px] text-[var(--text-tertiary)]">
                Sent from your own mailbox, not a shared address.
              </p>
            </form>
          )}
        </>
      )}
    </Modal>
  )
}

// ─── Teams thread ────────────────────────────────────────────

function ChatThread({
  link, canReply, onClose,
}: { link: ChatLink; canReply: boolean; onClose: () => void }) {
  const ref = useModalBehaviour(onClose)
  const qc = useQueryClient()
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)

  const messages = useQuery({
    queryKey: ['graph', 'chat', link.id],
    queryFn: async () => (await api.get(`/projects/tasks/chats/${link.id}/messages`)).data,
    retry: false,
  })

  const send = useMutation({
    mutationFn: () => api.post(`/projects/tasks/chats/${link.id}/reply`, { content: message.trim() }),
    onSuccess: () => {
      setMessage('')
      setError(null)
      qc.invalidateQueries({ queryKey: ['graph', 'chat', link.id] })
    },
    onError: (err) => setError(errMessage(err)),
  })

  const list: GraphChatMessage[] = messages.data?.data ?? []

  return (
    <Modal dialogRef={ref} label={chatLabel(link)} onClose={onClose} wide>
      {messages.isError && isNotConnected(messages.error) ? (
        <NotConnected message={errMessage(messages.error)} />
      ) : (
        <>
          <p className="mb-2 text-[10px] text-[var(--text-tertiary)]">
            {link.memberNames.join(', ')}
          </p>
          <div className="max-h-[45vh] space-y-1.5 overflow-y-auto">
            {messages.isLoading ? (
              <p className="py-6 text-center text-[11px] text-[var(--text-tertiary)]">Loading…</p>
            ) : list.length === 0 ? (
              <p className="py-6 text-center text-[11px] text-[var(--text-tertiary)]">
                {messages.isError ? errMessage(messages.error) : 'No messages in this chat.'}
              </p>
            ) : (
              list.map((m) => (
                <article key={m.id} className="rounded-lg bg-[var(--bg-overlay)] px-2.5 py-2">
                  <p className="text-[10px] font-medium text-[var(--text-secondary)]">
                    {m.from?.user?.displayName ?? 'Unknown'}
                    <span className="ml-1.5 font-normal text-[var(--text-tertiary)]">
                      {m.createdDateTime ? formatDate(m.createdDateTime) : ''}
                    </span>
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap text-[11px] leading-relaxed text-[var(--text-primary)]">
                    {toPlainText(m.body) || '(empty)'}
                  </p>
                </article>
              ))
            )}
          </div>

          {canReply && (
            <form
              onSubmit={(e) => { e.preventDefault(); if (message.trim()) send.mutate() }}
              className="mt-3 flex gap-2 border-t border-[var(--border-subtle)] pt-3"
            >
              <input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Message the chat…"
                className="flex-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-strong)]"
              />
              <button
                type="submit"
                disabled={!message.trim() || send.isPending}
                className="shrink-0 rounded-lg px-3 text-[11px] font-medium text-white disabled:opacity-50"
                style={{ background: 'var(--accent-secondary)' }}
              >
                <Send size={11} />
              </button>
            </form>
          )}
          {error && (
            <div role="alert" className="mt-2 rounded-lg px-2.5 py-1.5 text-[11px] text-[var(--text-primary)]" style={{ background: 'rgba(255,69,58,0.08)' }}>
              {error}
            </div>
          )}
          <p className="mt-1.5 text-[10px] text-[var(--text-tertiary)]">
            Posted to Teams as you. Everyone in the chat sees it.
          </p>
        </>
      )}
    </Modal>
  )
}

// ─── Modal shell ─────────────────────────────────────────────

function Modal({
  // Not named `ref`: React reserves that on a function component, silently
  // discards it, and the focus trap then never attaches — Escape still works
  // because the hook listens on the document, so the breakage is invisible.
  dialogRef, label, onClose, wide, children,
}: {
  dialogRef: React.RefObject<HTMLDivElement>
  label: string
  onClose: () => void
  wide?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className="projects-module fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto p-4 sm:p-8"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xl`}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="truncate text-sm font-semibold text-[var(--text-primary)]">{label}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)]"
          >
            <X size={14} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
