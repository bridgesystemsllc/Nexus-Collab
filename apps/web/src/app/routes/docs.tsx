import { useState, useMemo } from 'react'
import { FileText, Search, File } from 'lucide-react'
import { useDocuments } from '@/hooks/useData'

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
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function DocsPage() {
  const [activeType, setActiveType] = useState<string>('All')
  const [search, setSearch] = useState('')

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
      <div>
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          Document Hub
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          All documents across cowork spaces and departments
        </p>
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
            <div key={doc.id} className="data-cell flex flex-col">
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
    </div>
  )
}
