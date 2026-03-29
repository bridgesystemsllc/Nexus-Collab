import { useState } from 'react'
import { Shield, Plus, Check } from 'lucide-react'
import { useDepartments, useCreateDepartment } from '@/hooks/useData'

const EMOJI_OPTIONS = ['⚗', '⚙', '📦', '🤝', '📊', '🧪', '🎨', '📋', '🔧', '💡']
const COLOR_OPTIONS = [
  '#9B59B6', '#D97706', '#0F7B6C', '#2F80ED',
  '#7C3AED', '#E74C8B', '#6C757D', '#EB5757',
]

export function DeptManagerPage() {
  const { data: departments, isLoading } = useDepartments()
  const createDept = useCreateDepartment()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState(EMOJI_OPTIONS[0])
  const [color, setColor] = useState(COLOR_OPTIONS[0])

  const builtIn = (departments ?? []).filter(
    (d: any) => d.type === 'BUILTIN_RD' || d.type === 'BUILTIN_OPS'
  )
  const custom = (departments ?? []).filter((d: any) => d.type === 'CUSTOM')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    createDept.mutate(
      { name: name.trim(), description: description.trim(), icon, color, type: 'CUSTOM' },
      {
        onSuccess: () => {
          setName('')
          setDescription('')
          setIcon(EMOJI_OPTIONS[0])
          setColor(COLOR_OPTIONS[0])
        },
      }
    )
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          Department Manager
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Manage built-in and custom departments
        </p>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-32 rounded-xl" />
          ))}
        </div>
      )}

      {/* Built-in Departments */}
      {!isLoading && builtIn.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--text-tertiary)' }}>
            Built-in Departments
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 stagger">
            {builtIn.map((dept: any) => (
              <div key={dept.id} className="data-cell" style={{ opacity: 0.8 }}>
                <div className="relative z-10">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center text-lg"
                        style={{ background: `${dept.color}20` }}
                      >
                        {dept.icon}
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {dept.name}
                        </h3>
                        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                          {dept.description}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Shield className="w-3 h-3" style={{ color: 'var(--text-tertiary)' }} />
                      <span className="badge badge-info text-[10px]">Built-in</span>
                    </div>
                  </div>

                  <div
                    className="h-1 rounded-full mt-3"
                    style={{ background: dept.color, opacity: 0.4 }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Custom Departments */}
      {!isLoading && (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--text-tertiary)' }}>
            Custom Departments
          </h2>
          {custom.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 stagger mb-6">
              {custom.map((dept: any) => (
                <div key={dept.id} className="data-cell">
                  <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-2">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center text-lg"
                        style={{ background: `${dept.color}20` }}
                      >
                        {dept.icon}
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {dept.name}
                        </h3>
                        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                          {dept.description}
                        </p>
                      </div>
                    </div>

                    <div
                      className="h-1 rounded-full mt-3"
                      style={{ background: dept.color, opacity: 0.6 }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm mb-6" style={{ color: 'var(--text-tertiary)' }}>
              No custom departments yet. Create one below.
            </p>
          )}
        </div>
      )}

      {/* Create Department Form */}
      <div className="glass-card p-6">
        <h2 className="text-base font-semibold mb-5 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <Plus className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          Create Department
        </h2>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Marketing"
              required
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this department handle?"
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          {/* Icon Picker */}
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
              Icon
            </label>
            <div className="flex flex-wrap gap-2">
              {EMOJI_OPTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setIcon(emoji)}
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-lg transition-all"
                  style={{
                    background: icon === emoji ? 'var(--accent-subtle)' : 'var(--bg-elevated)',
                    border: `2px solid ${icon === emoji ? 'var(--accent)' : 'var(--border-subtle)'}`,
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Color Picker */}
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
              Color
            </label>
            <div className="flex flex-wrap gap-2">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
                  style={{
                    background: c,
                    border: `2px solid ${color === c ? '#fff' : 'transparent'}`,
                    boxShadow: color === c ? `0 0 0 2px var(--bg-base), 0 0 0 4px ${c}` : 'none',
                  }}
                >
                  {color === c && <Check className="w-4 h-4 text-white" />}
                </button>
              ))}
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={createDept.isPending || !name.trim()}
            className="btn-primary flex items-center gap-2"
            style={{ opacity: !name.trim() ? 0.5 : 1 }}
          >
            <Plus className="w-4 h-4" />
            {createDept.isPending ? 'Creating...' : 'Create Department'}
          </button>
        </form>
      </div>
    </div>
  )
}
