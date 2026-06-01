import { useState, useEffect, useMemo } from 'react'
import { Users, Plus, Link2, Search, Check, X, Loader2, AlertCircle } from 'lucide-react'
import { Dialog } from '@/components/Dialog'
import { api } from '@/lib/api'
import { useMembers, useCoworkSpaces } from '@/hooks/useData'

export interface AddToCoworkItem {
  /** Human-readable name of the line entry being shared. */
  name: string
  /** Type label (e.g. "Brief", "Formulation") used in the space/task naming. */
  type: string
  /** Stable id of the source record, stored on the created task metadata. */
  id?: string
  /** Optional richer description for the created task. */
  description?: string
}

interface AddToCoworkProps {
  item: AddToCoworkItem
  /** Visual style of the trigger. */
  variant?: 'button' | 'ghost' | 'icon'
  label?: string
  className?: string
  /** Called after the item is successfully pushed to a space. */
  onAdded?: (result: { spaceId: string; taskId: string; memberIds: string[] }) => void
}

/**
 * Reusable "Add to Co-work space" action.
 *
 * Drop into any row or detail view. Opens a picker where the user tags one or
 * more co-workers and either creates a new co-work space or pushes into an
 * existing one. On confirm it creates a shared task linked back to the source
 * item and tags the chosen members.
 */
export function AddToCowork({ item, variant = 'ghost', label = 'Add to Co-work', className, onAdded }: AddToCoworkProps) {
  const [open, setOpen] = useState(false)

  const trigger = () => setOpen(true)

  return (
    <>
      {variant === 'icon' ? (
        <button
          type="button"
          onClick={trigger}
          title={label}
          aria-label={label}
          className={`p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors ${className ?? ''}`}
        >
          <Users size={16} />
        </button>
      ) : (
        <button
          type="button"
          onClick={trigger}
          className={`inline-flex items-center gap-1.5 text-[13px] font-medium transition-all ${
            variant === 'button'
              ? 'btn-primary px-4 py-2 rounded-lg'
              : 'px-3 py-1.5 rounded-lg border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
          } ${className ?? ''}`}
        >
          <Users size={15} /> {label}
        </button>
      )}

      <AddToCoworkDialog item={item} open={open} onClose={() => setOpen(false)} onAdded={onAdded} />
    </>
  )
}

function AddToCoworkDialog({
  item,
  open,
  onClose,
  onAdded,
}: {
  item: AddToCoworkItem
  open: boolean
  onClose: () => void
  onAdded?: (result: { spaceId: string; taskId: string; memberIds: string[] }) => void
}) {
  const { data: members = [] } = useMembers()
  const { data: spaces } = useCoworkSpaces()

  const [selectedMembers, setSelectedMembers] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [spaceMode, setSpaceMode] = useState<'new' | 'existing'>('new')
  const [selectedSpaceId, setSelectedSpaceId] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setSelectedMembers([])
      setSearch('')
      setSpaceMode('new')
      setSelectedSpaceId('')
      setNote('')
      setError('')
      setSubmitting(false)
    }
  }, [open])

  const memberList = Array.isArray(members) ? members : []
  const spaceList = Array.isArray(spaces) ? spaces : (spaces as any)?.data ?? []

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return memberList.filter((m: any) =>
      (m.name ?? '').toLowerCase().includes(q) || (m.email ?? '').toLowerCase().includes(q),
    )
  }, [memberList, search])

  const toggleMember = (id: string) => {
    setSelectedMembers((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]))
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    setError('')
    try {
      let spaceId = selectedSpaceId
      if (spaceMode === 'new') {
        const res = await api.post('/cowork', {
          name: `${item.type}: ${item.name}`,
          type: 'INITIATIVE',
          description: `Co-work space for ${item.type.toLowerCase()}: ${item.name}`,
          memberIds: selectedMembers,
        })
        spaceId = res.data.id
      } else if (!spaceId) {
        setError('Please select a co-work space')
        setSubmitting(false)
        return
      }

      const taskRes = await api.post(`/cowork/${spaceId}/tasks`, {
        title: `Review: ${item.name}`,
        description: [item.description, note].filter(Boolean).join('\n\n'),
        priority: 'MEDIUM',
        metadata: {
          linkedItemId: item.id ?? null,
          itemType: item.type,
          itemName: item.name,
          taggedMemberIds: selectedMembers,
        },
      })

      const taggedNames = memberList
        .filter((m: any) => selectedMembers.includes(m.id))
        .map((m: any) => m.name)
        .join(', ')

      await api
        .post(`/cowork/${spaceId}/activity`, {
          type: 'UPDATE',
          content: `Added ${item.type.toLowerCase()} "${item.name}" to this space${
            taggedNames ? ` and tagged ${taggedNames}` : ''
          }.`,
        })
        .catch(() => {})

      onAdded?.({ spaceId, taskId: taskRes.data.id, memberIds: selectedMembers })
      onClose()
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to add to co-work space')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Add to Co-work space" subtitle={`${item.type}: ${item.name}`}>
      <div className="space-y-5">
        {error && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[var(--danger-light)] text-[var(--danger)] text-[13px]">
            <AlertCircle size={14} /> {error}
          </div>
        )}

        {/* Coworker tagging */}
        <div>
          <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">
            Tag co-workers
          </label>
          {selectedMembers.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {memberList
                .filter((m: any) => selectedMembers.includes(m.id))
                .map((m: any) => (
                  <span
                    key={m.id}
                    className="inline-flex items-center gap-1 pl-2 pr-1 py-1 rounded-full bg-[var(--accent-subtle)] text-[var(--accent)] text-[12px] font-medium"
                  >
                    {m.name}
                    <button
                      type="button"
                      onClick={() => toggleMember(m.id)}
                      className="p-0.5 rounded-full hover:bg-[var(--accent)]/20"
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
            </div>
          )}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-input)] mb-2">
            <Search size={14} className="text-[var(--text-tertiary)] shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email..."
              className="flex-1 bg-transparent text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none"
            />
          </div>
          <div className="max-h-[200px] overflow-y-auto rounded-lg border border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-[13px] text-[var(--text-tertiary)]">No members found</p>
            ) : (
              filtered.map((m: any) => {
                const checked = selectedMembers.includes(m.id)
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleMember(m.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    <div className="w-7 h-7 rounded-full bg-[var(--accent)] flex items-center justify-center text-white text-[12px] font-semibold shrink-0">
                      {m.name?.[0]?.toUpperCase() ?? '?'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-[var(--text-primary)] truncate">{m.name}</p>
                      <p className="text-[11px] text-[var(--text-tertiary)] truncate">{m.email}</p>
                    </div>
                    <span
                      className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                        checked
                          ? 'bg-[var(--accent)] border-[var(--accent)] text-white'
                          : 'border-[var(--border-default)]'
                      }`}
                    >
                      {checked && <Check size={13} />}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* Space selection */}
        <div>
          <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">
            Destination space
          </label>
          <div className="flex gap-2 mb-2">
            <button
              type="button"
              onClick={() => setSpaceMode('new')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium border transition-all ${
                spaceMode === 'new'
                  ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                  : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--accent)]'
              }`}
            >
              <Plus size={13} /> Create new space
            </button>
            <button
              type="button"
              onClick={() => setSpaceMode('existing')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium border transition-all ${
                spaceMode === 'existing'
                  ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                  : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--accent)]'
              }`}
            >
              <Link2 size={13} /> Existing space
            </button>
          </div>
          {spaceMode === 'new' ? (
            <div className="text-[12px] text-[var(--text-tertiary)] px-3 py-2.5 rounded-lg bg-[var(--bg-surface)]">
              A new space will be created: <strong>{item.type}: {item.name}</strong>
            </div>
          ) : (
            <select
              value={selectedSpaceId}
              onChange={(e) => setSelectedSpaceId(e.target.value)}
              className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3.5 py-2.5 text-[14px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            >
              <option value="">Select a space...</option>
              {spaceList.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Optional note */}
        <div>
          <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">
            Note (optional)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Add context for your co-workers..."
            className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3.5 py-2.5 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none resize-y focus:border-[var(--accent)]"
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-1">
          <button onClick={onClose} disabled={submitting} className="btn-ghost px-4 py-2 text-[14px]">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="btn-primary flex items-center gap-2 px-5 py-2 text-[14px] disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Adding...
              </>
            ) : (
              <>
                <Users size={14} /> Add to space
              </>
            )}
          </button>
        </div>
      </div>
    </Dialog>
  )
}
