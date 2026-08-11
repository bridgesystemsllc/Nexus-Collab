import { useState } from 'react'
import { X } from 'lucide-react'
import { api } from '@/lib/api'
import { useUserStore } from '@/stores/userStore'
import { useDepartments } from '@/hooks/useData'

// ─── Self-service profile editor ─────────────────────────────
// Lets the signed-in member set their display name and the department they
// belong to. Department membership gates things like project creation.
export function ProfileModal({ onClose }: { onClose: () => void }) {
  const currentUser = useUserStore((s) => s.currentUser)
  const setCurrentUser = useUserStore((s) => s.setCurrentUser)
  const { data: departments } = useDepartments()

  const [name, setName] = useState(currentUser?.name ?? '')
  const [departmentId, setDepartmentId] = useState<string>(currentUser?.departmentId ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!currentUser) return null

  const deptList: any[] = Array.isArray(departments) ? departments : []

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await api.patch('/auth/me', {
        name: name.trim() || undefined,
        departmentId: departmentId || null,
      })
      setCurrentUser(res.data)
      onClose()
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-[var(--border-default)] bg-[var(--bg-base)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)]">
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">My profile</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Display name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Department</label>
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
            >
              <option value="">No department</option>
              {deptList.map((d: any) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <p className="text-[11px] text-[var(--text-tertiary)] mt-1.5">
              You need to belong to a department to create projects.
            </p>
          </div>

          <div className="text-xs text-[var(--text-tertiary)]">
            Signed in as <span className="text-[var(--text-secondary)]">{currentUser.email}</span>
          </div>

          {error && <div className="text-xs text-[var(--danger)]">{error}</div>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-[var(--border-subtle)]">
          <button
            onClick={onClose}
            className="px-3.5 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-3.5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
            style={{ background: 'var(--accent)' }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
