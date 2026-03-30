import { useState } from 'react'
import {
  AlertTriangle,
  Bell,
  Calendar,
  Check,
  ChevronRight,
  Clock,
  ListChecks,
  Plus,
  Shield,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { useDepartments, useCreateDepartment, useTasks } from '@/hooks/useData'
import { useUserStore } from '@/stores/userStore'
import { useAppStore } from '@/stores/appStore'
import { Dialog } from '@/components/Dialog'
import { ModuleHeader } from '@/components/ModuleHeader'

const EMOJI_OPTIONS = ['⚗', '⚙', '📦', '🤝', '📊', '🧪', '🎨', '📋', '🔧', '💡']
const COLOR_OPTIONS = [
  '#BF5AF2', '#FF9F0A', '#32D74B', '#64D2FF',
  '#7C3AED', '#E8948A', '#00C7FF', '#FF453A',
]

// ─── Create Department Modal (Edit 7) ─────────────────────
function CreateDepartmentModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const createDept = useCreateDepartment()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState(EMOJI_OPTIONS[0])
  const [color, setColor] = useState(COLOR_OPTIONS[0])
  const [leadEmail, setLeadEmail] = useState('')
  const [memberEmails, setMemberEmails] = useState<string[]>([''])

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
          setLeadEmail('')
          setMemberEmails([''])
          onClose()
        },
      }
    )
  }

  return (
    <Dialog open={open} onClose={onClose} title="Create Department" subtitle="Add a new department to your workspace" wide>
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Name */}
        <div>
          <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1.5">
            Department Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Marketing"
            required
            className="w-full px-3 py-2.5 rounded-[10px] text-[14px] outline-none bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:border-[var(--accent)] transition-colors"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1.5">
            Description <span className="normal-case text-[var(--text-tertiary)]">(optional)</span>
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this department handle?"
            className="w-full px-3 py-2.5 rounded-[10px] text-[14px] outline-none bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:border-[var(--accent)] transition-colors"
          />
        </div>

        {/* Department Lead */}
        <div>
          <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1.5">
            Department Lead <span className="normal-case text-[var(--text-tertiary)]">(optional)</span>
          </label>
          <input
            type="email"
            value={leadEmail}
            onChange={(e) => setLeadEmail(e.target.value)}
            placeholder="lead@company.com"
            className="w-full px-3 py-2.5 rounded-[10px] text-[14px] outline-none bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:border-[var(--accent)] transition-colors"
          />
        </div>

        {/* Initial Members */}
        <div>
          <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1.5">
            Initial Members <span className="normal-case text-[var(--text-tertiary)]">(optional)</span>
          </label>
          {memberEmails.map((email, i) => (
            <div key={i} className="flex items-center gap-2 mb-2">
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  const updated = [...memberEmails]
                  updated[i] = e.target.value
                  setMemberEmails(updated)
                }}
                placeholder="member@company.com"
                className="flex-1 px-3 py-2 rounded-[10px] text-[13px] outline-none bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:border-[var(--accent)] transition-colors"
              />
              {memberEmails.length > 1 && (
                <button
                  type="button"
                  onClick={() => setMemberEmails(memberEmails.filter((_, j) => j !== i))}
                  className="text-[var(--text-tertiary)] hover:text-[var(--danger)]"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => setMemberEmails([...memberEmails, ''])}
            className="flex items-center gap-1 text-[12px] text-[var(--accent)] font-medium mt-1"
          >
            <Plus size={12} /> Add member
          </button>
        </div>

        {/* Icon + Color row */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1.5">
              Icon
            </label>
            <div className="flex flex-wrap gap-1.5">
              {EMOJI_OPTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setIcon(emoji)}
                  className="w-9 h-9 rounded-[8px] flex items-center justify-center text-lg transition-all"
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

          <div>
            <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1.5">
              Color
            </label>
            <div className="flex flex-wrap gap-1.5">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="w-7 h-7 rounded-full flex items-center justify-center transition-all hover:scale-110"
                  style={{
                    background: c,
                    border: `2px solid ${color === c ? '#fff' : 'transparent'}`,
                    boxShadow: color === c ? `0 0 12px ${c}60` : 'none',
                  }}
                >
                  {color === c && <Check size={12} className="text-white" />}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={createDept.isPending || !name.trim()}
          className="btn-primary flex items-center gap-2 w-full justify-center"
          style={{ opacity: !name.trim() ? 0.4 : 1 }}
        >
          <Plus size={14} />
          {createDept.isPending ? 'Creating...' : 'Create Department'}
        </button>
      </form>
    </Dialog>
  )
}

// ─── Department Detail Drawer (Edit 7) ────────────────────
function DeptDetailDrawer({
  dept,
  tasks,
  onClose,
}: {
  dept: any
  tasks: any[]
  onClose: () => void
}) {
  const deptTasks = tasks.filter((t: any) => t.departmentId === dept.id)
  const pending = deptTasks.filter((t: any) => t.status === 'NOT_STARTED').length
  const highPriority = deptTasks.filter((t: any) => t.priority === 'CRITICAL' || t.priority === 'HIGH').length
  const overdue = deptTasks.filter((t: any) => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'COMPLETE').length

  return (
    <Dialog open={true} onClose={onClose} title={dept.name} subtitle={dept.description || 'Department details'} wide>
      {/* Status Summary */}
      <div className="flex items-center gap-2 flex-wrap mb-5">
        {pending > 0 && (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[12px] font-medium bg-[rgba(255,159,10,0.15)] text-[#FF9F0A]">
            <Clock size={12} /> {pending} Pending
          </span>
        )}
        {highPriority > 0 && (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[12px] font-medium bg-[rgba(255,69,58,0.15)] text-[#FF453A]">
            <AlertTriangle size={12} /> {highPriority} High Priority
          </span>
        )}
        {overdue > 0 && (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[12px] font-medium bg-[rgba(255,69,58,0.15)] text-[#FF453A]">
            <Calendar size={12} /> {overdue} Overdue
          </span>
        )}
      </div>

      {/* Members */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">Members</h3>
          <button className="flex items-center gap-1 text-[12px] text-[var(--accent)] font-medium">
            <UserPlus size={12} /> Assign Member
          </button>
        </div>
        {dept.members?.length > 0 ? (
          <div className="space-y-2">
            {dept.members.map((member: any) => (
              <div key={member.id} className="flex items-center gap-3 p-2.5 rounded-[8px] bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                <div className="w-8 h-8 rounded-full bg-[var(--accent-subtle)] flex items-center justify-center text-[12px] font-semibold text-[var(--accent)]">
                  {member.name?.[0] || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[var(--text-primary)] truncate">{member.name}</p>
                  <p className="text-[11px] text-[var(--text-tertiary)]">{member.email}</p>
                </div>
                <span className="badge badge-accent text-[10px]">{member.role}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-[var(--text-tertiary)]">No members assigned</p>
        )}
      </div>

      {/* Active Tasks */}
      <div>
        <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
          <ListChecks size={14} /> Active Tasks ({deptTasks.filter((t: any) => t.status !== 'COMPLETE').length})
        </h3>
        {deptTasks.length > 0 ? (
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {deptTasks.filter((t: any) => t.status !== 'COMPLETE').slice(0, 10).map((task: any) => (
              <div key={task.id} className="flex items-center gap-3 p-2.5 rounded-[8px] bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                <div
                  className="w-1.5 h-8 rounded-full flex-shrink-0"
                  style={{
                    background: task.priority === 'CRITICAL' ? 'var(--danger)' :
                      task.priority === 'HIGH' ? 'var(--warning)' : 'var(--accent)',
                  }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[var(--text-primary)] truncate">{task.title}</p>
                  <p className="text-[11px] text-[var(--text-tertiary)]">{task.status?.replace(/_/g, ' ')}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-[var(--text-tertiary)]">No tasks in this department</p>
        )}
      </div>
    </Dialog>
  )
}

// ─── User Management Table (Edit 7 — admin only) ─────────
function UserManagementSection() {
  const currentUser = useUserStore((s) => s.currentUser)

  // Only visible to admins
  if (currentUser?.role !== 'ADMIN') return null

  // Placeholder user data — will come from API when Clerk is integrated
  const users = [
    { id: '1', name: 'Ahmad G.', email: 'ahmad@kareve.com', role: 'ADMIN', departments: ['Operations'], lastActive: 'Just now', status: 'AVAILABLE' },
    { id: '2', name: 'Ronald M.', email: 'ronald@kareve.com', role: 'DEPT_LEAD', departments: ['R&D'], lastActive: '2h ago', status: 'FOCUSED' },
    { id: '3', name: 'Tom L.', email: 'tom@kareve.com', role: 'MEMBER', departments: ['Operations'], lastActive: '5h ago', status: 'AVAILABLE' },
  ]

  const statusColors: Record<string, string> = {
    AVAILABLE: 'var(--success)',
    FOCUSED: 'var(--warning)',
    IN_MEETING: 'var(--info)',
    OOO: 'var(--text-tertiary)',
  }

  return (
    <div>
      <ModuleHeader icon={Users} title="User Management">
        <span className="badge badge-accent text-[10px]">Admin</span>
      </ModuleHeader>

      <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
        <table className="nexus-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Departments</th>
              <th>Last Active</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="clickable-row">
                <td>
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-[var(--accent-subtle)] flex items-center justify-center text-[11px] font-semibold text-[var(--accent)]">
                      {user.name[0]}
                    </div>
                    <span className="font-medium text-[14px] text-[var(--text-primary)]">{user.name}</span>
                  </div>
                </td>
                <td className="text-[14px] text-[var(--text-secondary)]">{user.email}</td>
                <td><span className="badge badge-accent text-[10px]">{user.role}</span></td>
                <td className="text-[14px] text-[var(--text-primary)]">{user.departments.join(', ')}</td>
                <td className="text-[14px] text-[var(--text-secondary)]">{user.lastActive}</td>
                <td>
                  <div className="flex items-center gap-1.5">
                    <div className="w-[6px] h-[6px] rounded-full" style={{ background: statusColors[user.status] || 'var(--text-tertiary)' }} />
                    <span className="text-[14px] text-[var(--text-primary)]">{user.status.replace(/_/g, ' ').toLowerCase()}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────
export function DeptManagerPage() {
  const { data: departments, isLoading: deptsLoading } = useDepartments()
  const { data: tasks } = useTasks()
  const setPage = useAppStore((s) => s.setPage)

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedDept, setSelectedDept] = useState<any>(null)

  const allTasks = Array.isArray(tasks) ? tasks : (tasks as any)?.tasks ?? []

  const builtIn = (departments ?? []).filter(
    (d: any) => d.type === 'BUILTIN_RD' || d.type === 'BUILTIN_OPS'
  )
  const custom = (departments ?? []).filter((d: any) => d.type === 'CUSTOM')

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
            Department Manager
          </h1>
          <p className="text-[14px] text-[var(--text-secondary)] mt-0.5">
            Manage departments and team assignments
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary flex items-center gap-2 text-[14px]"
        >
          <Plus size={14} />
          Create Department
        </button>
      </div>

      {/* Loading */}
      {deptsLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-32 rounded-xl" />
          ))}
        </div>
      )}

      {/* Built-in Departments */}
      {!deptsLoading && builtIn.length > 0 && (
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-4">
            Built-in Departments
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 stagger">
            {builtIn.map((dept: any) => {
              const deptTasks = allTasks.filter((t: any) => t.departmentId === dept.id)
              const pending = deptTasks.filter((t: any) => t.status === 'NOT_STARTED').length
              const highPri = deptTasks.filter((t: any) => t.priority === 'CRITICAL' || t.priority === 'HIGH').length

              return (
                <button
                  key={dept.id}
                  onClick={() => setSelectedDept(dept)}
                  className="data-cell text-left cursor-pointer w-full"
                >
                  <div className="relative z-10">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center text-lg"
                          style={{ background: `${dept.color}20` }}
                        >
                          {dept.icon}
                        </div>
                        <div>
                          <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">{dept.name}</h3>
                          <p className="text-[12px] text-[var(--text-secondary)]">{dept.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Shield size={12} className="text-[var(--text-tertiary)]" />
                        <span className="badge badge-info text-[10px]">Built-in</span>
                      </div>
                    </div>

                    {/* Status badges */}
                    <div className="flex items-center gap-1.5 mb-2">
                      {pending > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[rgba(255,159,10,0.15)] text-[#FF9F0A]">
                          <Clock size={9} /> {pending}
                        </span>
                      )}
                      {highPri > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[rgba(255,69,58,0.15)] text-[#FF453A]">
                          <AlertTriangle size={9} /> {highPri}
                        </span>
                      )}
                    </div>

                    <div className="h-1 rounded-full" style={{ background: dept.color, opacity: 0.4 }} />
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Custom Departments */}
      {!deptsLoading && (
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-4">
            Custom Departments
          </h2>
          {custom.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 stagger">
              {custom.map((dept: any) => (
                <button
                  key={dept.id}
                  onClick={() => setSelectedDept(dept)}
                  className="data-cell text-left cursor-pointer w-full"
                >
                  <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-2">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center text-lg"
                        style={{ background: `${dept.color}20` }}
                      >
                        {dept.icon}
                      </div>
                      <div>
                        <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">{dept.name}</h3>
                        <p className="text-[12px] text-[var(--text-secondary)]">{dept.description}</p>
                      </div>
                    </div>
                    <div className="h-1 rounded-full mt-3" style={{ background: dept.color, opacity: 0.6 }} />
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[14px] text-[var(--text-secondary)] mb-6">
              No custom departments yet. Click "Create Department" to add one.
            </p>
          )}
        </div>
      )}

      {/* User Management (Edit 7 — admin only) */}
      <UserManagementSection />

      {/* Create Modal */}
      <CreateDepartmentModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />

      {/* Department Detail Drawer */}
      {selectedDept && (
        <DeptDetailDrawer
          dept={selectedDept}
          tasks={allTasks}
          onClose={() => setSelectedDept(null)}
        />
      )}
    </div>
  )
}
