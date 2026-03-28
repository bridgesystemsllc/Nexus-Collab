import { useState } from 'react'
import { Users, MessageSquare, CheckSquare, Search } from 'lucide-react'
import { useCoworkSpaces } from '@/hooks/useData'
import { useAppStore } from '@/stores/appStore'

export function CoworkPage() {
  const { data: spaces, isLoading } = useCoworkSpaces()
  const setSelectedCowork = useAppStore((s) => s.setSelectedCowork)
  const [search, setSearch] = useState('')

  const spaceList = Array.isArray(spaces) ? spaces : []
  const filtered = spaceList.filter((s: any) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
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
      </div>

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
                        boxShadow: '0 0 20px rgba(255, 69, 58, 0.15), 0 0 0 1px rgba(255, 69, 58, 0.3)',
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
