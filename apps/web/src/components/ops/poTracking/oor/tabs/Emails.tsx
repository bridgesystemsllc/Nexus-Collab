// ─── Emails ─────────────────────────────────────────────────
// The vendor's ETA usually arrives as an email, and today it lives in somebody's
// inbox where nobody else can find it. Three ways in — paste the text, drop the
// .eml, or pull it from the connected mailbox — because the fastest one wins and
// which is fastest depends on the person.

import { useRef, useState, useEffect } from 'react'
import { Loader2, Mail, Paperclip, Upload, Search, ExternalLink, X, Send } from 'lucide-react'
import { api } from '@/lib/api'
import { useQueryClient } from '@tanstack/react-query'
import { useOorCollection } from '../useOorQueries'
import { ThreadComposer } from '../ThreadComposer'
import { Pill } from '../OorPills'
import { formatLongDate } from '../oorFormat'
import { useMicrosoftStatus, useMailSearch, type MailSearchResult } from '@/hooks/useData'
import { ConnectMicrosoft } from '@/components/shared/ConnectMicrosoft'

interface EmailAttachment {
  id: string
  createdAt: string
  payload: {
    subject: string | null
    fromAddress: string | null
    toAddresses: string[]
    ccAddresses: string[]
    sentAt: string | null
    bodyText: string
    attachmentCount: number
    source: string
    filename: string | null
    webLink: string | null
  }
}

function initial(name?: string | null): string {
  if (!name) return '?'
  return name.charAt(0).toUpperCase()
}

function AttachOutlookEmailModal({ lineId, onClose }: { lineId: string; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [attachingId, setAttachingId] = useState<string | null>(null)
  const { data: status, isLoading: statusLoading } = useMicrosoftStatus()
  const qc = useQueryClient()

  const connected = status?.connected ?? false

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 350)
    return () => clearTimeout(t)
  }, [query])

  const search = useMailSearch(debounced, connected)
  const results = search.data?.messages ?? []
  const lapsed = (search.error as any)?.response?.status === 412

  useEffect(() => {
    if (lapsed) qc.invalidateQueries({ queryKey: ['microsoft', 'status'] })
  }, [lapsed, qc])

  const handleSelect = async (m: MailSearchResult) => {
    if (attachingId) return
    setAttachingId(m.id)
    try {
      await api.post(`/operations/oor/lines/${lineId}/emails`, {
        source: 'graph',
        messageId: m.id,
        subject: m.subject,
        fromAddress: m.from_email ?? undefined,
        sentAt: m.received_at ?? undefined,
        bodyText: m.snippet ?? undefined,
        webLink: m.web_link ?? undefined,
      })
      qc.invalidateQueries({ queryKey: ['oor', 'emails', lineId] })
      onClose()
    } catch {
      setAttachingId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[500px] mx-4 rounded-2xl shadow-2xl" style={{ background: 'var(--bg-elevated)' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border-default)' }}>
          <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">Attach Outlook email</h3>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            <X size={15} />
          </button>
        </div>
        <div className="px-5 py-4">
          {statusLoading ? (
            <div className="py-10 flex items-center justify-center text-[var(--text-tertiary)]">
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : !connected || lapsed ? (
            <ConnectMicrosoft variant="inline" purpose="to search your Outlook inbox" />
          ) : (
            <div className="space-y-3">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                  placeholder="Search your inbox by subject, sender, or keyword"
                  className="w-full pl-9 pr-9 py-2 rounded-lg text-[13px] text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)] transition-colors"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
                />
                {search.isFetching && (
                  <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-[var(--text-tertiary)]" />
                )}
              </div>

              <div className="max-h-[340px] overflow-y-auto -mx-1 px-1">
                {debounced.length < 2 && (
                  <p className="text-[12px] text-[var(--text-tertiary)] text-center py-8">
                    Type at least 2 characters to search your Outlook mailbox.
                  </p>
                )}
                {debounced.length >= 2 && search.isError && !lapsed && (
                  <p className="text-[12px] text-[var(--danger)] text-center py-8">
                    Couldn't search Outlook. Please try again.
                  </p>
                )}
                {debounced.length >= 2 && !search.isFetching && !search.isError && results.length === 0 && (
                  <p className="text-[12px] text-[var(--text-tertiary)] text-center py-8">
                    No messages match "{debounced}".
                  </p>
                )}

                <div className="space-y-1">
                  {results.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => handleSelect(m)}
                      disabled={!!attachingId}
                      className="w-full text-left p-2.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] hover:border-[var(--border-default)] transition-colors disabled:opacity-50 flex items-start gap-2.5"
                    >
                      <div className="w-7 h-7 rounded-full bg-indigo-500/15 text-indigo-400 flex items-center justify-center text-[11px] font-semibold shrink-0 mt-0.5">
                        {initial(m.from_name || m.from_email || '?')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-[var(--text-primary)] truncate">{m.subject}</p>
                        <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5 truncate">
                          {m.from_name || m.from_email || 'unknown'}
                          {m.received_at ? ` · ${new Date(m.received_at).toLocaleDateString()}` : ''}
                        </p>
                        {m.snippet && (
                          <p className="text-[11px] text-[var(--text-secondary)] mt-1 truncate">{m.snippet}</p>
                        )}
                      </div>
                      {attachingId === m.id ? (
                        <Loader2 size={14} className="animate-spin text-[var(--text-tertiary)] shrink-0 mt-1" />
                      ) : (
                        <Send size={13} className="text-[var(--text-tertiary)] shrink-0 mt-1" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function EmailsTab({ lineId }: { lineId: string }) {
  const emails = useOorCollection<EmailAttachment>(lineId, 'emails')
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [outlookModal, setOutlookModal] = useState(false)

  const refresh = () => qc.invalidateQueries({ queryKey: ['oor', 'emails', lineId] })

  const uploadEml = async (file: File) => {
    setUploading(true)
    setUploadError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      await api.post(`/operations/oor/lines/${lineId}/emails`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      refresh()
    } catch {
      setUploadError('That file could not be read as an email.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-3">
      <ThreadComposer
        fields={[{ name: 'raw', label: 'Paste the email', type: 'textarea', required: true, rows: 5,
          placeholder: 'From: supplier@vendor.com\nSubject: RE: tube ETA\n\nTubes ship the 12th.' }]}
        submitLabel="Attach email"
        hint="Headers are read when present; a bare paste is kept as the body."
        onSubmit={async (values) => {
          await api.post(`/operations/oor/lines/${lineId}/emails`, { raw: values.raw, source: 'paste' })
          refresh()
        }}
      />

      <div className="flex items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".eml,message/rfc822"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) uploadEml(file)
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px]"
          style={{ border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
        >
          {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
          Upload .eml
        </button>
        <button
          type="button"
          onClick={() => setOutlookModal(true)}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px]"
          style={{ border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
        >
          <Search size={12} />
          Search Outlook
        </button>
        {uploadError ? <span className="text-[12px]" style={{ color: 'var(--danger)' }}>{uploadError}</span> : null}
      </div>

      {emails.isLoading ? (
        <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--text-tertiary)' }}>
          <Loader2 size={13} className="animate-spin" /> Loading emails…
        </div>
      ) : (emails.data?.rows.length ?? 0) === 0 ? (
        <div className="text-[13px] py-6 text-center" style={{ color: 'var(--text-tertiary)' }}>
          No emails attached to this line.
        </div>
      ) : (
        <div className="space-y-2">
          {emails.data!.rows.map((e) => {
            const p = e.payload
            const expanded = open === e.id
            return (
              <div key={e.id} className="rounded-xl" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : e.id)}
                  className="w-full text-left px-3 py-2.5"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <Mail size={12} style={{ color: 'var(--text-tertiary)' }} />
                    <span className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
                      {p.subject ?? '(no subject)'}
                    </span>
                    {p.attachmentCount > 0 ? (
                      <Pill icon={Paperclip}>{p.attachmentCount}</Pill>
                    ) : null}
                    <Pill>{p.source.replace('_', ' ')}</Pill>
                  </div>
                  <div className="mt-0.5 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                    {p.fromAddress ?? 'unknown sender'}
                    {p.toAddresses?.length ? ` → ${p.toAddresses.join(', ')}` : ''}
                    {' · '}
                    {formatLongDate(p.sentAt ?? e.createdAt)}
                  </div>
                </button>
                {expanded ? (
                  <div
                    className="px-3 pb-3 text-[12px] whitespace-pre-wrap leading-snug"
                    style={{ color: 'var(--text-secondary)', borderTop: '1px solid var(--border-default)', paddingTop: 8 }}
                  >
                    {p.bodyText || '(no body)'}
                    {p.webLink && (
                      <div className="mt-2">
                        <a
                          href={p.webLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink size={11} /> Open in Outlook
                        </a>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}

      {outlookModal && (
        <AttachOutlookEmailModal lineId={lineId} onClose={() => setOutlookModal(false)} />
      )}
    </div>
  )
}
