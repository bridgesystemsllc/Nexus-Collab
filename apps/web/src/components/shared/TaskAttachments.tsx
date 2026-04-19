import { useState, useRef, useCallback } from 'react'
import { Mail, Paperclip, MessageSquare, X, Download, Trash2, ExternalLink, Send, Link, ChevronDown } from 'lucide-react'
import {
  useTaskAttachments, useCreateEmailAttachment, useCreateFileAttachment,
  useCreateFileFromUrl, useCreateCommentAttachment, useDeleteAttachment,
} from '@/hooks/useData'

// ─── Types ─────────────────────────────────────────────────

interface TaskAttachmentsProps {
  taskId: string
  module: string // 'npd' | 'active_brief' | etc.
}

type ModalType = 'email' | 'file' | 'comment' | null

interface Attachment {
  id: string
  type: 'email' | 'file' | 'comment'
  created_at: string
  // email fields
  subject?: string
  sender_name?: string
  sender_email?: string
  snippet?: string
  message_count?: number
  // file fields
  filename?: string
  size_bytes?: number
  mime_type?: string
  storage_url?: string
  uploaded_via?: string
  // comment fields
  author_name?: string
  body_plain?: string
  edited?: boolean
}

// ─── Helpers ───────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  if (diffMs < 60_000) return 'just now'
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function formatBytes(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function initial(name?: string): string {
  if (!name) return '?'
  return name.charAt(0).toUpperCase()
}

const borderByType: Record<string, string> = {
  email: 'border-indigo-500',
  file: 'border-emerald-500',
  comment: 'border-slate-400',
}

// ─── Attachment Row ────────────────────────────────────────

function AttachmentRow({ att, onDelete }: { att: Attachment; onDelete: () => void }) {
  const [hovered, setHovered] = useState(false)
  const accent = borderByType[att.type] ?? 'border-slate-400'

  return (
    <div
      className={`flex items-start gap-3 px-3 py-2.5 border-l-[3px] ${accent} rounded-r-lg hover:bg-[var(--bg-hover)] transition-colors`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Icon / Initial */}
      {att.type === 'email' && (
        <div className="w-7 h-7 rounded-full bg-indigo-500/15 text-indigo-400 flex items-center justify-center text-[11px] font-semibold shrink-0 mt-0.5">
          {initial(att.sender_name)}
        </div>
      )}
      {att.type === 'file' && (
        <div className="w-7 h-7 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
          <Paperclip size={13} />
        </div>
      )}
      {att.type === 'comment' && (
        <div className="w-7 h-7 rounded-full bg-slate-500/15 text-slate-400 flex items-center justify-center text-[11px] font-semibold shrink-0 mt-0.5">
          {initial(att.author_name)}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 min-w-0">
        {att.type === 'email' && (
          <>
            <p className="text-[13px] text-[var(--text-primary)] truncate font-medium">{att.subject}</p>
            <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
              from {att.sender_name || att.sender_email || 'unknown'} &middot; {relativeTime(att.created_at)}
              {att.message_count ? ` \u00B7 ${att.message_count} messages` : ''}
            </p>
          </>
        )}
        {att.type === 'file' && (
          <>
            <p className="text-[13px] text-[var(--text-primary)] truncate font-medium">{att.filename}</p>
            <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
              {formatBytes(att.size_bytes)}{att.uploaded_via ? ` \u00B7 ${att.uploaded_via}` : ''} &middot; {relativeTime(att.created_at)}
            </p>
          </>
        )}
        {att.type === 'comment' && (
          <>
            <p className="text-[11px] text-[var(--text-tertiary)]">
              <span className="text-[var(--text-secondary)] font-medium">{att.author_name || 'Unknown'}</span> &middot; {relativeTime(att.created_at)}
              {att.edited ? ' \u00B7 (edited)' : ''}
            </p>
            <p className="text-[13px] text-[var(--text-primary)] mt-0.5 whitespace-pre-wrap">{att.body_plain}</p>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        {att.type === 'file' && att.storage_url && (
          <a
            href={att.storage_url}
            target="_blank"
            rel="noopener noreferrer"
            className="w-6 h-6 flex items-center justify-center rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
            title="Download"
          >
            <Download size={13} />
          </a>
        )}
        {hovered && (
          <button
            onClick={onDelete}
            className="w-6 h-6 flex items-center justify-center rounded text-[var(--text-tertiary)] hover:text-[var(--danger)] hover:bg-[var(--bg-hover)] transition-colors"
            title="Delete"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Modal Shell ───────────────────────────────────────────

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[500px] mx-4 rounded-2xl shadow-2xl" style={{ background: 'var(--bg-elevated)' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border-default)' }}>
          <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">{title}</h3>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            <X size={15} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

// ─── Attach Email Modal ────────────────────────────────────

function AttachEmailModal({ taskId, module, onClose }: { taskId: string; module: string; onClose: () => void }) {
  const [subject, setSubject] = useState('')
  const [senderName, setSenderName] = useState('')
  const [senderEmail, setSenderEmail] = useState('')
  const [snippet, setSnippet] = useState('')
  const createEmail = useCreateEmailAttachment()

  const handleSubmit = () => {
    if (!subject.trim()) return
    createEmail.mutate(
      { taskId, module, subject: subject.trim(), sender_name: senderName.trim() || undefined, sender_email: senderEmail.trim() || undefined, snippet: snippet.trim() || undefined },
      { onSuccess: () => onClose() },
    )
  }

  return (
    <ModalShell title="Attach Email" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">Subject *</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-[13px] text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)] transition-colors"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
            placeholder="Email subject line"
            autoFocus
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">Sender Name</label>
            <input
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-[13px] text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)] transition-colors"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
              placeholder="John Doe"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">Sender Email</label>
            <input
              value={senderEmail}
              onChange={(e) => setSenderEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-[13px] text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)] transition-colors"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
              placeholder="john@example.com"
            />
          </div>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">Snippet / Preview</label>
          <textarea
            value={snippet}
            onChange={(e) => setSnippet(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-[13px] text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)] transition-colors resize-none"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
            rows={3}
            placeholder="Optional preview text..."
          />
        </div>
        <button
          onClick={handleSubmit}
          disabled={!subject.trim() || createEmail.isPending}
          className="w-full py-2 rounded-lg text-[13px] font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          <Send size={13} />
          {createEmail.isPending ? 'Attaching...' : 'Attach Email'}
        </button>
      </div>
    </ModalShell>
  )
}

// ─── Attach File Modal ─────────────────────────────────────

function AttachFileModal({ taskId, module, onClose }: { taskId: string; module: string; onClose: () => void }) {
  const [tab, setTab] = useState<'upload' | 'url'>('upload')
  const [url, setUrl] = useState('')
  const [urlFilename, setUrlFilename] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const createFile = useCreateFileAttachment()
  const createFromUrl = useCreateFileFromUrl()

  const handleFileSelect = (file: File) => {
    createFile.mutate(
      { taskId, module, filename: file.name, size_bytes: file.size, mime_type: file.type, storage_url: `placeholder://${file.name}`, uploaded_via: 'upload' },
      { onSuccess: () => onClose() },
    )
  }

  const handleUrlSubmit = () => {
    if (!url.trim()) return
    createFromUrl.mutate(
      { taskId, module, url: url.trim(), filename: urlFilename.trim() || undefined },
      { onSuccess: () => onClose() },
    )
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFileSelect(file)
  }

  const isPending = createFile.isPending || createFromUrl.isPending

  return (
    <ModalShell title="Attach File" onClose={onClose}>
      {/* Tabs */}
      <div className="flex gap-1 mb-4 p-1 rounded-lg" style={{ background: 'var(--bg-input)' }}>
        <button
          onClick={() => setTab('upload')}
          className={`flex-1 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
            tab === 'upload' ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
          }`}
        >
          Upload
        </button>
        <button
          onClick={() => setTab('url')}
          className={`flex-1 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
            tab === 'url' ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
          }`}
        >
          From URL
        </button>
      </div>

      {tab === 'upload' && (
        <div
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
            dragOver ? 'border-emerald-500 bg-emerald-500/5' : 'border-[var(--border-subtle)] hover:border-[var(--border-default)]'
          }`}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <Paperclip size={24} className="mx-auto mb-2 text-[var(--text-tertiary)]" />
          <p className="text-[13px] text-[var(--text-secondary)]">
            {isPending ? 'Uploading...' : 'Drop a file here or click to browse'}
          </p>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFileSelect(file)
            }}
          />
        </div>
      )}

      {tab === 'url' && (
        <div className="space-y-3">
          <div>
            <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">URL *</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-[13px] text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)] transition-colors"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
              placeholder="https://..."
              autoFocus
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">Filename Override</label>
            <input
              value={urlFilename}
              onChange={(e) => setUrlFilename(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-[13px] text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)] transition-colors"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
              placeholder="Optional custom filename"
            />
          </div>
          <button
            onClick={handleUrlSubmit}
            disabled={!url.trim() || isPending}
            className="w-full py-2 rounded-lg text-[13px] font-medium text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            <Link size={13} />
            {isPending ? 'Attaching...' : 'Attach from URL'}
          </button>
        </div>
      )}
    </ModalShell>
  )
}

// ─── Add Comment Modal ─────────────────────────────────────

function AddCommentModal({ taskId, module, onClose }: { taskId: string; module: string; onClose: () => void }) {
  const [body, setBody] = useState('')
  const createComment = useCreateCommentAttachment()

  const handleSubmit = () => {
    if (!body.trim()) return
    createComment.mutate(
      { taskId, module, body_plain: body.trim() },
      { onSuccess: () => onClose() },
    )
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <ModalShell title="Add Comment" onClose={onClose}>
      <div className="space-y-3">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full px-3 py-2 rounded-lg text-[13px] text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)] transition-colors resize-none"
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
          rows={4}
          placeholder="Write a comment..."
          autoFocus
        />
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-[var(--text-tertiary)]">{navigator.platform.includes('Mac') ? '\u2318' : 'Ctrl'}+Enter to submit</span>
          <button
            onClick={handleSubmit}
            disabled={!body.trim() || createComment.isPending}
            className="px-4 py-2 rounded-lg text-[13px] font-medium text-white bg-[var(--accent)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            <MessageSquare size={13} />
            {createComment.isPending ? 'Posting...' : 'Post Comment'}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ─── Main Component ────────────────────────────────────────

export function TaskAttachments({ taskId, module }: TaskAttachmentsProps) {
  const [expanded, setExpanded] = useState(false)
  const [activeModal, setActiveModal] = useState<ModalType>(null)
  const { data: attachments = [], isLoading } = useTaskAttachments(taskId, module)
  const deleteAttachment = useDeleteAttachment()

  const sorted = [...(attachments as Attachment[])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )

  const count = sorted.length

  const handleDelete = useCallback((id: string) => {
    if (!window.confirm('Delete this attachment?')) return
    deleteAttachment.mutate(id)
  }, [deleteAttachment])

  return (
    <div className="mt-2">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          <ChevronDown
            size={13}
            className={`transition-transform ${expanded ? '' : '-rotate-90'}`}
          />
          Attachments{count > 0 ? ` \u00B7 ${count}` : ''}
        </button>

        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setActiveModal('email')}
            className="w-6 h-6 flex items-center justify-center rounded text-indigo-400 hover:bg-indigo-500/10 transition-colors"
            title="Attach email"
          >
            <Mail size={13} />
          </button>
          <button
            onClick={() => setActiveModal('file')}
            className="w-6 h-6 flex items-center justify-center rounded text-emerald-400 hover:bg-emerald-500/10 transition-colors"
            title="Attach file"
          >
            <Paperclip size={13} />
          </button>
          <button
            onClick={() => setActiveModal('comment')}
            className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:bg-slate-500/10 transition-colors"
            title="Add comment"
          >
            <MessageSquare size={13} />
          </button>
        </div>
      </div>

      {/* Attachment List */}
      {expanded && (
        <div className="mt-1.5 space-y-0.5">
          {isLoading && (
            <p className="text-[11px] text-[var(--text-tertiary)] px-3 py-2">Loading...</p>
          )}
          {!isLoading && count === 0 && (
            <p className="text-[11px] text-[var(--text-tertiary)] px-3 py-2">No attachments yet</p>
          )}
          {sorted.map((att) => (
            <AttachmentRow key={att.id} att={att} onDelete={() => handleDelete(att.id)} />
          ))}
        </div>
      )}

      {/* Modals */}
      {activeModal === 'email' && (
        <AttachEmailModal taskId={taskId} module={module} onClose={() => setActiveModal(null)} />
      )}
      {activeModal === 'file' && (
        <AttachFileModal taskId={taskId} module={module} onClose={() => setActiveModal(null)} />
      )}
      {activeModal === 'comment' && (
        <AddCommentModal taskId={taskId} module={module} onClose={() => setActiveModal(null)} />
      )}
    </div>
  )
}
