import { useState } from 'react'
import { Users, MessageSquare, CheckSquare, Search, Plus, Loader2 } from 'lucide-react'
import { useCoworkSpaces, useCreateCoworkSpace } from '@/hooks/useData'
import { useAppStore } from '@/stores/appStore'
import { Dialog } from '@/components/Dialog'

const inputCls =
  'w-full px-3 py-2 bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-xl text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] transition-colors'
const labelCls = 'block text-xs font-medium text-[var(--text-tertiary)] mb-1 uppercase tracking-wider'
const selectCls =
  'w-full px-3 py-2 bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-xl text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors appearance-none'

const SPACE_TYPES = ['PROJECT', 'INITIATIVE', 'DEPARTMENT', 'EMERGENCY'] as const

function CreateSpaceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createSpace = useCreateCoworkSpace()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<string>('PROJECT')

  function reset() { setName(''); setDescription(''); setType('PROJECT') }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    createSpace.mutate(
      { name: name.trim(), description: description.trim() || undefined, type },
      { onSuccess: () => { reset(); onClose() } }
    )
  }

  return (
    <Dialog open={open} onClose={onClose} title="New Cowork Space">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className={labelCls}>Space Name *</label>
          <input className={inputCls} placeholder="e.g. Q4 Launch Initiative" value={name} onChange={e => setName(e.target.value)} autoFocus />
        </div>
        <div>
          <label className={labelCls}>Description</label>
          <textarea className={inputCls} rows={2} placeholder="Brief description of the space..." value={description} onChange={e => setDescription(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Type</label>
          <select className={selectCls} value={type} onChange={e => setType(e.target.value)}>
            {SPACE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--border-subtle)]">
          <button type="button" onClick={() => { reset(); onClose() }} className="px-4 py-2 rounded-xl text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors">Cancel</button>
          <button type="submit" disabled={!name.trim() || createSpace.isPending} className="px-5 py-2 rounded-xl bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center gap-2">
            {createSpace.isPending && <Loader2 size={14} className="animate-spin" />}
            Create Space
          </button>
        </div>
      </form>
    </Dialog>
  )
}

export function CoworkPage() {
  const { data: spaces, isLoading } = useCoworkSpaces()
  const setSelectedCowork = useAppStore((s) => s.setSelectedCowork)
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)

  const spaceList = Array.isArray(spaces) ? spaces : []
  const filtered = spaceList.filter((s: any) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Cowork Spaces
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Cross-department collaboration hubs
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
            <input
              type="text"
              placeholder="Search spaces..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 rounded-lg text-sm outline-none"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Plus size={15} />
            New Space
          </button>
        </div>
      </div>
      <CreateSpaceDialog open={createOpen} onClose={() => setCreateOpen(false)} />

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-48 rounded-xl" />
          ))}
        </div>
      )}

      {/* Space Cards */}
      {!isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 stagger">
          {filtered.map((space: any) => {
            const isEmergency = space.type === 'EMERGENCY'
            return (
              <button
                key={space.id}
                onClick={() => setSelectedCowork(space.id)}
                className="data-cell text-left cursor-pointer relative"
                style={{
                  ...(isEmergency
                    ? {
                        borderColor: 'var(--danger)',
                        boxShadow: 'var(--shadow-md)',
                      }
                    : {}),
                }}
              >
                <div className="relative z-10">
                  {/* Type badge + Name */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-base truncate" style={{ color: 'var(--text-primary)' }}>
                        {space.name}
                      </h3>
                    </div>
                    <span className={`badge ml-2 flex-shrink-0 ${isEmergency ? 'badge-emergency' : 'badge-accent'}`}>
                      {space.type}
                    </span>
                  </div>

                  {/* Description */}
                  <p className="text-sm mb-4 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                    {space.description}
                  </p>

                  {/* Department Tags */}
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {(space.deptNames ?? []).map((dept: string) => (
                      <span
                        key={dept}
                        className="badge badge-info"
                      >
                        {dept}
                      </span>
                    ))}
                  </div>

                  {/* Stats Row */}
                  <div className="flex items-center gap-5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    <span className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" />
                      {space.memberIds?.length ?? 0} members
                    </span>
                    <span className="flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5" />
                      {space._count?.activities ?? space.activities?.length ?? 0} activity
                    </span>
                    <span className="flex items-center gap-1.5">
                      <CheckSquare className="w-3.5 h-3.5" />
                      {space._count?.tasks ?? space.tasks?.length ?? 0} tasks
                    </span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20" style={{ color: 'var(--text-tertiary)' }}>
          <Users className="w-12 h-12 mb-4 opacity-40" />
          <p className="text-lg font-medium">No cowork spaces found</p>
          <p className="text-sm mt-1">Try adjusting your search</p>
        </div>
      )}
    </div>
  )
}
