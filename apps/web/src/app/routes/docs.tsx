import { useState, useMemo } from 'react'
import { FileText, Search, File, Plus, Loader2, Download } from 'lucide-react'
import { useDocuments, useCreateDocument } from '@/hooks/useData'
import { Dialog } from '@/components/Dialog'

const DOC_TYPES = [
  'All',
  'Brief',
  'COA',
  'Spec Sheet',
  'Quote',
  'Pricing',
  'Contract',
  'Report',
  'Artwork',
] as const

function formatSize(bytes: number): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const inputCls =
  'w-full px-3 py-2 bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-xl text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] transition-colors'
const labelCls = 'block text-xs font-medium text-[var(--text-tertiary)] mb-1 uppercase tracking-wider'
const selectCls =
  'w-full px-3 py-2 bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-xl text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors appearance-none'

// ─── Document Detail Dialog ────────────────────────────────
function DocDetailDialog({ doc, onClose }: { doc: any | null; onClose: () => void }) {
  if (!doc) return null
  return (
    <Dialog open={!!doc} onClose={onClose} title={doc.name ?? 'Document'} wide>
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--accent-subtle)' }}
          >
            <File className="w-7 h-7" style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <p className="font-semibold text-[var(--text-primary)]">{doc.name}</p>
            {doc.type && <span className="badge badge-accent mt-1">{doc.type}</span>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-2">
          {doc.mimeType && (
            <div>
              <p className={labelCls}>MIME Type</p>
              <p className="text-sm text-[var(--text-primary)]">{doc.mimeType}</p>
            </div>
          )}
          {doc.size != null && (
            <div>
              <p className={labelCls}>Size</p>
              <p className="text-sm text-[var(--text-primary)]">{formatSize(doc.size)}</p>
            </div>
          )}
          {doc.createdAt && (
            <div>
              <p className={labelCls}>Created</p>
              <p className="text-sm text-[var(--text-primary)]">
                {new Date(doc.createdAt).toLocaleDateString('en-US', {
                  month: 'long', day: 'numeric', year: 'numeric',
                })}
              </p>
            </div>
          )}
          {doc.coworkSpace?.name && (
            <div>
              <p className={labelCls}>Cowork Space</p>
              <p className="text-sm text-[var(--text-primary)]">{doc.coworkSpace.name}</p>
            </div>
          )}
          {doc.uploader?.name && (
            <div>
              <p className={labelCls}>Uploaded By</p>
              <p className="text-sm text-[var(--text-primary)]">{doc.uploader.name}</p>
            </div>
          )}
        </div>

        {doc.storageUrl && (
          <div className="pt-2">
            <a
              href={doc.storageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity w-fit"
            >
              <Download size={14} />
              Open / Download
            </a>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </Dialog>
  )
}

// ─── Create Document Dialog ────────────────────────────────
function CreateDocDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createDoc = useCreateDocument()
  const [name, setName] = useState('')
  const [type, setType] = useState('Brief')
  const [mimeType, setMimeType] = useState('application/pdf')
  const [url, setUrl] = useState('')

  function reset() { setName(''); setType('Brief'); setMimeType('application/pdf'); setUrl('') }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    createDoc.mutate(
      {
        name: name.trim(),
        type,
        mimeType,
        size: 0,
        storageKey: `manual/${Date.now()}-${name.trim().replace(/\s+/g, '-')}`,
        storageUrl: url.trim() || undefined,
      },
      { onSuccess: () => { reset(); onClose() } }
    )
  }

  return (
    <Dialog open={open} onClose={onClose} title="New Document">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className={labelCls}>Document Name *</label>
          <input className={inputCls} placeholder="e.g. Q4 Launch Brief" value={name} onChange={e => setName(e.target.value)} autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Type</label>
            <select className={selectCls} value={type} onChange={e => setType(e.target.value)}>
              {DOC_TYPES.filter(t => t !== 'All').map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>File Format</label>
            <select className={selectCls} value={mimeType} onChange={e => setMimeType(e.target.value)}>
              <option value="application/pdf">PDF</option>
              <option value="application/vnd.openxmlformats-officedocument.wordprocessingml.document">Word (.docx)</option>
              <option value="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">Excel (.xlsx)</option>
              <option value="application/vnd.openxmlformats-officedocument.presentationml.presentation">PowerPoint (.pptx)</option>
              <option value="image/png">Image (PNG)</option>
              <option value="image/jpeg">Image (JPG)</option>
              <option value="text/plain">Text</option>
            </select>
          </div>
        </div>
        <div>
          <label className={labelCls}>Document URL (optional)</label>
          <input className={inputCls} type="url" placeholder="https://drive.google.com/..." value={url} onChange={e => setUrl(e.target.value)} />
        </div>
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--border-subtle)]">
          <button type="button" onClick={() => { reset(); onClose() }} className="px-4 py-2 rounded-xl text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors">Cancel</button>
          <button type="submit" disabled={!name.trim() || createDoc.isPending} className="px-5 py-2 rounded-xl bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center gap-2">
            {createDoc.isPending && <Loader2 size={14} className="animate-spin" />}
            Create
          </button>
        </div>
      </form>
    </Dialog>
  )
}

// ─── Main Page ─────────────────────────────────────────────
export function DocsPage() {
  const [activeType, setActiveType] = useState<string>('All')
  const [search, setSearch] = useState('')
  const [selectedDoc, setSelectedDoc] = useState<any | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const filters = useMemo(() => {
    const f: Record<string, string> = {}
    if (activeType !== 'All') f.type = activeType
    if (search) f.search = search
    return f
  }, [activeType, search])

  const { data: documents, isLoading } = useDocuments(
    Object.keys(filters).length > 0 ? filters : undefined
  )

  const filtered = useMemo(() => {
    if (!documents) return []
    const docList = Array.isArray(documents) ? documents : (documents as any)?.documents ?? []
    return (docList as any[]).filter((doc: any) => {
      const matchesSearch =
        !search || doc.name?.toLowerCase().includes(search.toLowerCase())
      const matchesType =
        activeType === 'All' ||
        doc.type?.toLowerCase() === activeType.toLowerCase()
      return matchesSearch && matchesType
    })
  }, [documents, search, activeType])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Document Hub
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            All documents across cowork spaces and departments
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus size={15} />
          New Document
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
        <input
          type="text"
          placeholder="Search documents..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-lg text-sm outline-none"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-primary)',
          }}
        />
      </div>

      {/* Type Filter Pills */}
      <div className="flex flex-wrap gap-2">
        {DOC_TYPES.map((type) => (
          <button
            key={type}
            onClick={() => setActiveType(type)}
            className="px-3.5 py-1.5 rounded-full text-sm font-medium transition-all"
            style={{
              background: activeType === type ? 'var(--accent)' : 'var(--bg-surface)',
              color: activeType === type ? '#fff' : 'var(--text-secondary)',
              border: `1px solid ${activeType === type ? 'var(--accent)' : 'var(--border-subtle)'}`,
            }}
          >
            {type}
          </button>
        ))}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="skeleton h-36 rounded-xl" />
          ))}
        </div>
      )}

      {/* Document Grid */}
      {!isLoading && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 stagger">
          {filtered.map((doc: any) => (
            <div
              key={doc.id}
              className="data-cell flex flex-col cursor-pointer hover:border-[var(--accent)] transition-colors"
              onClick={() => setSelectedDoc(doc)}
            >
              <div className="relative z-10 flex flex-col h-full">
                <div className="flex items-start gap-3 mb-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: 'var(--accent-subtle)' }}
                  >
                    <File className="w-5 h-5" style={{ color: 'var(--accent)' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                      {doc.name}
                    </h4>
                    {doc.type && (
                      <span className="badge badge-accent text-[10px] mt-1">{doc.type}</span>
                    )}
                  </div>
                </div>

                <div className="mt-auto flex items-center justify-between text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  {doc.size != null && <span>{formatSize(doc.size)}</span>}
                  {doc.createdAt && (
                    <span>
                      {new Date(doc.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20" style={{ color: 'var(--text-tertiary)' }}>
          <FileText className="w-12 h-12 mb-4 opacity-40" />
          <p className="text-lg font-medium">No documents found</p>
          <p className="text-sm mt-1">
            {search || activeType !== 'All'
              ? 'Try adjusting your search or filter'
              : 'Documents will appear here when uploaded to cowork spaces'}
          </p>
        </div>
      )}

      <DocDetailDialog doc={selectedDoc} onClose={() => setSelectedDoc(null)} />
      <CreateDocDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  )
}
