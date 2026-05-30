import { useState } from 'react'
import { MessageSquare, Send, Trash2 } from 'lucide-react'

export interface NoteEntry {
  id: string
  content: string
  author: string
  authorInitial: string
  timestamp: string
  reactions?: { emoji: string; count: number }[]
}

export interface NotesFeedProps {
  notes: NoteEntry[]
  onAdd: (content: string) => void
  onDelete: (id: string) => void
  currentUser?: string
}

const REACTION_OPTIONS = ['👍', '✅', '⚠️']

function relativeTime(timestamp: string): string {
  const now = Date.now()
  const then = new Date(timestamp).getTime()
  const diff = now - then
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString()
}

export function NotesFeed({ notes, onAdd, onDelete, currentUser }: NotesFeedProps) {
  const [draft, setDraft] = useState('')

  const handlePost = () => {
    if (!draft.trim()) return
    onAdd(draft.trim())
    setDraft('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handlePost()
    }
  }

  return (
    <div>
      {/* Compose */}
      <div className="flex items-center gap-2 mb-4">
        <input
          type="text"
          placeholder="Add a note..."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 px-3 py-2 rounded-[8px] border border-[var(--border-default)] bg-[var(--bg-input)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)]"
        />
        <button
          onClick={handlePost}
          disabled={!draft.trim()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-[8px] text-[12px] font-medium text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors"
        >
          <Send size={13} />
          Post
        </button>
      </div>

      {/* Notes List */}
      {notes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <MessageSquare size={24} className="text-[var(--text-tertiary)] mb-2" />
          <p className="text-[13px] text-[var(--text-tertiary)]">
            No notes yet. Start the conversation.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <div
              key={note.id}
              className="group flex gap-3 p-3 rounded-[8px] hover:bg-[var(--bg-hover)] transition-colors"
            >
              {/* Avatar */}
              <div
                className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-semibold"
                style={{
                  background: 'var(--accent-light)',
                  color: 'var(--accent)',
                }}
              >
                {note.authorInitial}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[13px] font-medium text-[var(--text-primary)]">
                    {note.author}
                  </span>
                  <span
                    className="text-[11px] text-[var(--text-tertiary)]"
                    title={new Date(note.timestamp).toLocaleString()}
                  >
                    {relativeTime(note.timestamp)}
                  </span>
                </div>
                <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
                  {note.content}
                </p>

                {/* Reactions */}
                <div className="flex items-center gap-1.5 mt-2">
                  {note.reactions?.map((r, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] cursor-default"
                    >
                      {r.emoji} <span className="text-[var(--text-tertiary)]">{r.count}</span>
                    </span>
                  ))}
                  {REACTION_OPTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      className="opacity-0 group-hover:opacity-100 px-1 py-0.5 rounded text-[12px] hover:bg-[var(--bg-surface)] transition-all"
                      title={`React with ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              {/* Delete */}
              {note.author === currentUser && (
                <button
                  onClick={() => onDelete(note.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded-[6px] text-[var(--text-tertiary)] hover:text-[var(--danger)] hover:bg-[var(--danger-light)] transition-all self-start"
                  title="Delete note"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
