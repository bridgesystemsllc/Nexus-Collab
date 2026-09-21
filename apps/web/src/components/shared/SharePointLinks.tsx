import { useState } from 'react'
import { ExternalLink, Plus, Trash2, X } from 'lucide-react'

export interface SharePointLink {
  displayName: string
  url: string
  addedBy: string
  addedAt: string
}

export interface SharePointLinksProps {
  links: SharePointLink[]
  onAdd: (link: { displayName: string; url: string }) => void
  onRemove: (index: number) => void
}

export function SharePointLinks({ links, onAdd, onRemove }: SharePointLinksProps) {
  const [showForm, setShowForm] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [url, setUrl] = useState('')
  const [urlError, setUrlError] = useState('')

  const handleSave = () => {
    if (!displayName.trim() || !url.trim()) return
    if (!url.includes('sharepoint.com')) {
      setUrlError('URL must contain sharepoint.com')
      return
    }
    onAdd({ displayName: displayName.trim(), url: url.trim() })
    setDisplayName('')
    setUrl('')
    setUrlError('')
    setShowForm(false)
  }

  const handleCancel = () => {
    setDisplayName('')
    setUrl('')
    setUrlError('')
    setShowForm(false)
  }

  return (
    <div className="space-y-3">
      {links.length === 0 && !showForm && (
        <p className="text-[13px] text-[var(--text-tertiary)] py-4 text-center">
          No SharePoint links added yet.
        </p>
      )}

      {links.map((link, idx) => (
        <div
          key={idx}
          className="flex items-center gap-3 px-3 py-2.5 rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] transition-colors"
        >
          <ExternalLink size={16} style={{ color: '#0078D4', flexShrink: 0 }} />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-[var(--text-primary)] truncate">
              {link.displayName}
            </p>
            <p className="text-[11px] text-[var(--text-tertiary)] truncate">
              {link.url}
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-tertiary)] whitespace-nowrap">
            <span>{link.addedBy}</span>
            <span>&middot;</span>
            <span>{link.addedAt}</span>
          </div>
          <button
            onClick={() => window.open(link.url, '_blank', 'noopener,noreferrer')}
            className="px-2.5 py-1 rounded-[6px] text-[11px] font-medium text-[#0078D4] bg-[#0078D4]/8 hover:bg-[#0078D4]/15 transition-colors whitespace-nowrap"
          >
            Open in SharePoint
          </button>
          <button
            onClick={() => onRemove(idx)}
            className="p-1 rounded-[6px] text-[var(--text-tertiary)] hover:text-[var(--danger)] hover:bg-[var(--danger-light)] transition-colors"
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}

      {showForm && (
        <div className="p-3 rounded-[8px] border border-[var(--accent)]/30 bg-[var(--accent-subtle)]">
          <div className="flex items-center gap-3 mb-2">
            <input
              type="text"
              placeholder="Display Name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="flex-1 px-2.5 py-1.5 rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-input)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)]"
            />
            <input
              type="url"
              placeholder="https://...sharepoint.com/..."
              value={url}
              onChange={(e) => {
                setUrl(e.target.value)
                if (urlError) setUrlError('')
              }}
              className="flex-[2] px-2.5 py-1.5 rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-input)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
          {urlError && (
            <p className="text-[11px] text-[var(--danger)] mb-2">{urlError}</p>
          )}
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={handleCancel}
              className="px-3 py-1.5 rounded-[6px] text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!displayName.trim() || !url.trim()}
              className="px-3 py-1.5 rounded-[6px] text-[12px] font-medium text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-[12px] font-medium text-[var(--accent)] hover:bg-[var(--accent-subtle)] transition-colors"
        >
          <Plus size={13} />
          Add SharePoint Link
        </button>
      )}
    </div>
  )
}
