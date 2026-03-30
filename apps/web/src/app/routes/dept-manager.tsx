import { useState, useEffect } from 'react'
import {
  AlertTriangle,
  Calendar,
  Check,
  Clock,
  Edit3,
  ListChecks,
  Mail,
  Plus,
  Search,
  Shield,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useDepartments, useCreateDepartment, useTasks } from '@/hooks/useData'
import { useUserStore } from '@/stores/userStore'
import { useAppStore } from '@/stores/appStore'
import { Dialog } from '@/components/Dialog'
import { ModuleHeader } from '@/components/ModuleHeader'

const EMOJI_OPTIONS = ['⚗', '⚙', '📦', '🤝', '📊', '🧪', '🎨', '📋', '🔧', '💡']
const COLOR_OPTIONS = [
  '#9B59B6', '#D97706', '#0F7B6C', '#2F80ED',
  '#7C3AED', '#E74C8B', '#6C757D', '#EB5757',
]

const ROLE_OPTIONS = ['ADMIN', 'DEPT_LEAD', 'MEMBER'] as const
const STATUS_OPTIONS = ['AVAILABLE', 'FOCUSED', 'IN_MEETING', 'OOO'] as const

const statusColors: Record<string, string> = {
  AVAILABLE: 'var(--success)',
  FOCUSED: 'var(--warning)',
  IN_MEETING: 'var(--info)',
  OOO: 'var(--text-tertiary)',
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

// ─── Shared field label ───────────────────────────────────
function FieldLabel({ children, optional }: { children: React.ReactNode; optional?: boolean }) {
  return (
    <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1.5">
      {children}
      {optional && <span className="normal-case text-[var(--text-tertiary)]"> (optional)</span>}
    </label>
  )
}

// ─── Shared input ─────────────────────────────────────────
function Input({
  value,
  onChange,
  placeholder,
  type = 'text',
  required,
  readOnly,
}: {
  value: string
  onChange?: (v: string) => void
  placeholder?: string
  type?: string
  required?: boolean
  readOnly?: boolean
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      required={required}
      readOnly={readOnly}
      className={`w-full px-3 py-2.5 rounded-[10px] text-[14px] outline-none bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:border-[var(--accent)] transition-colors ${readOnly ? 'opacity-60 cursor-not-allowed' : ''}`}
    />
  )
}

// ─── Shared select ────────────────────────────────────────
function Select({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2.5 rounded-[10px] text-[14px] outline-none bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:border-[var(--accent)] transition-colors"
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

// ─── Toast helper ─────────────────────────────────────────
function useToast() {
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000)
      return () => clearTimeout(t)
    }
  }, [toast])

  const ToastEl = toast ? (
    <div
      className="fixed bottom-6 right-6 z-[100] px-4 py-3 rounded-xl text-[13px] font-medium shadow-lg animate-fade-in"
      style={{
        background: toast.type === 'success' ? 'var(--success)' : 'var(--danger)',
        color: '#fff',
      }}
    >
      {toast.message}
    </div>
  ) : null

  return { showToast: setToast, ToastEl }
}

// ─── Create Department Modal ──────────────────────────────
function CreateDepartmentModal({
  open,
  onClose,
  departments,
}: {
  open: boolean
  onClose: () => void
  departments: any[]
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

    // Derive orgId from existing departments
    const orgId = departments?.[0]?.orgId || departments?.[0]?.organizationId || undefined

    createDept.mutate(
      {
        name: name.trim(),
        description: description.trim(),
        icon,
        color,
        type: 'CUSTOM',
        ...(orgId ? { orgId } : {}),
      },
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
      },
    )
  }

  return (
    <Dialog open={open} onClose={onClose} title="Create Department" subtitle="Add a new department to your workspace" wide>
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Name */}
        <div>
          <FieldLabel>Department Name</FieldLabel>
          <Input value={name} onChange={setName} placeholder="e.g. Marketing" required />
        </div>

        {/* Description */}
        <div>
          <FieldLabel optional>Description</FieldLabel>
          <Input value={description} onChange={setDescription} placeholder="What does this department handle?" />
        </div>

        {/* Department Lead */}
        <div>
          <FieldLabel optional>Department Lead</FieldLabel>
          <Input type="email" value={leadEmail} onChange={setLeadEmail} placeholder="lead@company.com" />
        </div>

        {/* Initial Members */}
        <div>
          <FieldLabel optional>Initial Members</FieldLabel>
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
            <FieldLabel>Icon</FieldLabel>
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
            <FieldLabel>Color</FieldLabel>
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

// ─── Invite User Modal ────────────────────────────────────
function InviteUserModal({
  open,
  onClose,
  departments,
}: {
  open: boolean
  onClose: () => void
  departments: any[]
}) {
  const queryClient = useQueryClient()
  const { showToast, ToastEl } = useToast()

  const [email, setEmail] = useState('')
  const [role, setRole] = useState<string>('MEMBER')
  const [departmentId, setDepartmentId] = useState('')

  const { data: pendingInvites, refetch: refetchInvites } = useQuery({
    queryKey: ['members', 'invites'],
    queryFn: () => api.get('/members/invites').then((r) => r.data),
    enabled: open,
  })

  const inviteMutation = useMutation({
    mutationFn: (data: { email: string; role: string; departmentId?: string }) =>
      api.post('/members/invite', data).then((r) => r.data),
    onSuccess: () => {
      showToast({ message: 'Invite sent successfully', type: 'success' })
      setEmail('')
      setRole('MEMBER')
      setDepartmentId('')
      refetchInvites()
    },
    onError: () => {
      showToast({ message: 'Failed to send invite', type: 'error' })
    },
  })

  const revokeMutation = useMutation({
    mutationFn: (inviteId: string) => api.delete(`/members/invites/${inviteId}`).then((r) => r.data),
    onSuccess: () => {
      showToast({ message: 'Invite revoked', type: 'success' })
      refetchInvites()
    },
    onError: () => {
      showToast({ message: 'Failed to revoke invite', type: 'error' })
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    inviteMutation.mutate({
      email: email.trim(),
      role,
      ...(departmentId ? { departmentId } : {}),
    })
  }

  const invites = Array.isArray(pendingInvites) ? pendingInvites : []

  return (
    <Dialog open={open} onClose={onClose} title="Invite User" subtitle="Send an email invitation to join your workspace" wide>
      <form onSubmit={handleSubmit} className="space-y-4 mb-6">
        <div>
          <FieldLabel>Email</FieldLabel>
          <Input type="email" value={email} onChange={setEmail} placeholder="user@company.com" required />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel>Role</FieldLabel>
            <Select
              value={role}
              onChange={setRole}
              options={ROLE_OPTIONS.map((r) => ({ value: r, label: r }))}
            />
          </div>
          <div>
            <FieldLabel optional>Department</FieldLabel>
            <Select
              value={departmentId}
              onChange={setDepartmentId}
              placeholder="Select department"
              options={(departments ?? []).map((d: any) => ({ value: d.id, label: d.name }))}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={inviteMutation.isPending || !email.trim()}
          className="btn-primary flex items-center gap-2 w-full justify-center"
          style={{ opacity: !email.trim() ? 0.4 : 1 }}
        >
          <Mail size={14} />
          {inviteMutation.isPending ? 'Sending...' : 'Send Invite'}
        </button>
      </form>

      {/* Pending Invites */}
      {invites.length > 0 && (
        <div>
          <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-3">Pending Invites</h3>
          <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
            <table className="nexus-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Sent</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {invites.map((inv: any) => (
                  <tr key={inv.id}>
                    <td className="text-[14px] text-[var(--text-primary)]">{inv.email}</td>
                    <td><span className="badge badge-accent text-[10px]">{inv.role}</span></td>
                    <td className="text-[14px] text-[var(--text-secondary)]">
                      {inv.createdAt ? new Date(inv.createdAt).toLocaleDateString() : '-'}
                    </td>
                    <td>
                      <button
                        onClick={() => revokeMutation.mutate(inv.id)}
                        disabled={revokeMutation.isPending}
                        className="text-[12px] text-[var(--danger)] font-medium hover:underline"
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {ToastEl}
    </Dialog>
  )
}

// ─── Create User Modal ────────────────────────────────────
function CreateUserModal({
  open,
  onClose,
  departments,
  refetchMembers,
}: {
  open: boolean
  onClose: () => void
  departments: any[]
  refetchMembers: () => void
}) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<string>('MEMBER')
  const [departmentId, setDepartmentId] = useState('')
  const [initials, setInitials] = useState('')

  // Auto-generate initials from name
  useEffect(() => {
    if (fullName.trim()) {
      setInitials(getInitials(fullName))
    }
  }, [fullName])

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/members', data).then((r) => r.data),
    onSuccess: () => {
      refetchMembers()
      setFullName('')
      setEmail('')
      setRole('MEMBER')
      setDepartmentId('')
      setInitials('')
      onClose()
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!fullName.trim() || !email.trim()) return
    createMutation.mutate({
      name: fullName.trim(),
      email: email.trim(),
      role,
      initials: initials || getInitials(fullName),
      ...(departmentId ? { departmentId } : {}),
    })
  }

  return (
    <Dialog open={open} onClose={onClose} title="Create User" subtitle="Add a new user directly to your workspace">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <FieldLabel>Full Name</FieldLabel>
          <Input value={fullName} onChange={setFullName} placeholder="Jane Doe" required />
        </div>

        <div>
          <FieldLabel>Email</FieldLabel>
          <Input type="email" value={email} onChange={setEmail} placeholder="jane@company.com" required />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel>Role</FieldLabel>
            <Select
              value={role}
              onChange={setRole}
              options={ROLE_OPTIONS.map((r) => ({ value: r, label: r }))}
            />
          </div>
          <div>
            <FieldLabel optional>Department</FieldLabel>
            <Select
              value={departmentId}
              onChange={setDepartmentId}
              placeholder="Select department"
              options={(departments ?? []).map((d: any) => ({ value: d.id, label: d.name }))}
            />
          </div>
        </div>

        <div>
          <FieldLabel>Avatar Initials</FieldLabel>
          <Input value={initials} onChange={setInitials} placeholder="JD" />
          <p className="text-[11px] text-[var(--text-tertiary)] mt-1">Auto-generated from name. Override if needed.</p>
        </div>

        <button
          type="submit"
          disabled={createMutation.isPending || !fullName.trim() || !email.trim()}
          className="btn-primary flex items-center gap-2 w-full justify-center"
          style={{ opacity: !fullName.trim() || !email.trim() ? 0.4 : 1 }}
        >
          <UserPlus size={14} />
          {createMutation.isPending ? 'Creating...' : 'Create User'}
        </button>
      </form>
    </Dialog>
  )
}

// ─── Edit Member Modal ────────────────────────────────────
function EditMemberModal({
  open,
  onClose,
  member,
  departments,
  refetchMembers,
}: {
  open: boolean
  onClose: () => void
  member: any
  departments: any[]
  refetchMembers: () => void
}) {
  const { showToast, ToastEl } = useToast()
  const [name, setName] = useState(member?.name || '')
  const [role, setRole] = useState(member?.role || 'MEMBER')
  const [departmentId, setDepartmentId] = useState(member?.departmentId || '')
  const [status, setStatus] = useState(member?.status || 'AVAILABLE')
  const [confirmRemove, setConfirmRemove] = useState(false)

  useEffect(() => {
    if (member) {
      setName(member.name || '')
      setRole(member.role || 'MEMBER')
      setDepartmentId(member.departmentId || '')
      setStatus(member.status || 'AVAILABLE')
      setConfirmRemove(false)
    }
  }, [member])

  const updateMutation = useMutation({
    mutationFn: (data: any) => api.patch(`/members/${member.id}`, data).then((r) => r.data),
    onSuccess: () => {
      showToast({ message: 'Member updated', type: 'success' })
      refetchMembers()
      onClose()
    },
    onError: () => {
      showToast({ message: 'Failed to update member', type: 'error' })
    },
  })

  const removeMutation = useMutation({
    mutationFn: () => api.delete(`/members/${member.id}`).then((r) => r.data),
    onSuccess: () => {
      showToast({ message: 'Member removed', type: 'success' })
      refetchMembers()
      onClose()
    },
    onError: () => {
      showToast({ message: 'Failed to remove member', type: 'error' })
    },
  })

  const assignDeptMutation = useMutation({
    mutationFn: (deptId: string) =>
      api.post(`/members/${member.id}/assign-department`, { departmentId: deptId }).then((r) => r.data),
    onSuccess: () => {
      showToast({ message: 'Department assigned', type: 'success' })
      refetchMembers()
    },
    onError: () => {
      showToast({ message: 'Failed to assign department', type: 'error' })
    },
  })

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    updateMutation.mutate({ name, role, departmentId: departmentId || undefined, status })
  }

  if (!member) return null

  return (
    <Dialog open={open} onClose={onClose} title="Edit Member" subtitle={member.email}>
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <FieldLabel>Name</FieldLabel>
          <Input value={name} onChange={setName} placeholder="Full name" />
        </div>

        <div>
          <FieldLabel>Email</FieldLabel>
          <Input value={member.email || ''} readOnly />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel>Role</FieldLabel>
            <Select
              value={role}
              onChange={setRole}
              options={ROLE_OPTIONS.map((r) => ({ value: r, label: r }))}
            />
          </div>
          <div>
            <FieldLabel>Status</FieldLabel>
            <Select
              value={status}
              onChange={setStatus}
              options={STATUS_OPTIONS.map((s) => ({ value: s, label: s.replace(/_/g, ' ') }))}
            />
          </div>
        </div>

        <div>
          <FieldLabel optional>Department</FieldLabel>
          <Select
            value={departmentId}
            onChange={setDepartmentId}
            placeholder="Select department"
            options={(departments ?? []).map((d: any) => ({ value: d.id, label: d.name }))}
          />
        </div>

        {/* Assign to Department section */}
        <div className="pt-3 border-t border-[var(--border-subtle)]">
          <FieldLabel>Assign to Department</FieldLabel>
          <div className="flex gap-2">
            <select
              id="assign-dept"
              className="flex-1 px-3 py-2.5 rounded-[10px] text-[14px] outline-none bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:border-[var(--accent)] transition-colors"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) {
                  assignDeptMutation.mutate(e.target.value)
                  e.target.value = ''
                }
              }}
            >
              <option value="">Pick a department...</option>
              {(departments ?? []).map((d: any) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="submit"
          disabled={updateMutation.isPending}
          className="btn-primary flex items-center gap-2 w-full justify-center"
        >
          <Check size={14} />
          {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
        </button>

        {/* Remove User */}
        <div className="pt-3 border-t border-[var(--border-subtle)]">
          {!confirmRemove ? (
            <button
              type="button"
              onClick={() => setConfirmRemove(true)}
              className="flex items-center gap-2 w-full justify-center py-2.5 rounded-[10px] text-[14px] font-medium text-[var(--danger)] border border-[var(--danger)] hover:bg-[rgba(255,69,58,0.1)] transition-colors"
            >
              <Trash2 size={14} />
              Remove User
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-[13px] text-[var(--danger)] text-center font-medium">
                Are you sure? This cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmRemove(false)}
                  className="btn-ghost flex-1 text-[14px]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => removeMutation.mutate()}
                  disabled={removeMutation.isPending}
                  className="flex-1 py-2.5 rounded-[10px] text-[14px] font-medium text-white bg-[var(--danger)] hover:opacity-90 transition-opacity"
                >
                  {removeMutation.isPending ? 'Removing...' : 'Confirm Remove'}
                </button>
              </div>
            </div>
          )}
        </div>
      </form>
      {ToastEl}
    </Dialog>
  )
}

// ─── Department Detail Drawer ─────────────────────────────
function DeptDetailDrawer({
  dept,
  tasks,
  allMembers,
  departments,
  onClose,
}: {
  dept: any
  tasks: any[]
  allMembers: any[]
  departments: any[]
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const { showToast, ToastEl } = useToast()

  const [editMode, setEditMode] = useState(false)
  const [editName, setEditName] = useState(dept.name || '')
  const [editDescription, setEditDescription] = useState(dept.description || '')
  const [editIcon, setEditIcon] = useState(dept.icon || EMOJI_OPTIONS[0])
  const [editColor, setEditColor] = useState(dept.color || COLOR_OPTIONS[0])
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [assignDropdownOpen, setAssignDropdownOpen] = useState(false)
  const [memberSearch, setMemberSearch] = useState('')

  const deptTasks = tasks.filter((t: any) => t.departmentId === dept.id)
  const pending = deptTasks.filter((t: any) => t.status === 'NOT_STARTED').length
  const highPriority = deptTasks.filter((t: any) => t.priority === 'CRITICAL' || t.priority === 'HIGH').length
  const overdue = deptTasks.filter(
    (t: any) => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'COMPLETE',
  ).length

  const updateDeptMutation = useMutation({
    mutationFn: (data: any) => api.patch(`/departments/${dept.id}`, data).then((r) => r.data),
    onSuccess: () => {
      showToast({ message: 'Department updated', type: 'success' })
      queryClient.invalidateQueries({ queryKey: ['departments'] })
      setEditMode(false)
    },
    onError: () => {
      showToast({ message: 'Failed to update department', type: 'error' })
    },
  })

  const archiveDeptMutation = useMutation({
    mutationFn: () => api.delete(`/departments/${dept.id}`).then((r) => r.data),
    onSuccess: () => {
      showToast({ message: 'Department archived', type: 'success' })
      queryClient.invalidateQueries({ queryKey: ['departments'] })
      onClose()
    },
    onError: () => {
      showToast({ message: 'Failed to archive department', type: 'error' })
    },
  })

  const assignMemberMutation = useMutation({
    mutationFn: (memberId: string) =>
      api.post(`/members/${memberId}/assign-department`, { departmentId: dept.id }).then((r) => r.data),
    onSuccess: () => {
      showToast({ message: 'Member assigned', type: 'success' })
      queryClient.invalidateQueries({ queryKey: ['departments'] })
      queryClient.invalidateQueries({ queryKey: ['members'] })
      setAssignDropdownOpen(false)
      setMemberSearch('')
    },
    onError: () => {
      showToast({ message: 'Failed to assign member', type: 'error' })
    },
  })

  const handleSaveEdit = () => {
    updateDeptMutation.mutate({
      name: editName.trim(),
      description: editDescription.trim(),
      icon: editIcon,
      color: editColor,
    })
  }

  const isCustom = dept.type === 'CUSTOM'

  const filteredMembers = (allMembers ?? []).filter((m: any) => {
    const search = memberSearch.toLowerCase()
    return (
      (m.name?.toLowerCase().includes(search) || m.email?.toLowerCase().includes(search)) &&
      !dept.members?.some((dm: any) => dm.id === m.id)
    )
  })

  return (
    <Dialog open={true} onClose={onClose} title={editMode ? 'Edit Department' : dept.name} subtitle={editMode ? 'Edit department details' : dept.description || 'Department details'} wide>
      {/* Edit toggle */}
      {!editMode && (
        <div className="flex justify-end mb-4">
          <button
            onClick={() => setEditMode(true)}
            className="btn-ghost flex items-center gap-1.5 text-[13px]"
          >
            <Edit3 size={13} /> Edit
          </button>
        </div>
      )}

      {editMode ? (
        <div className="space-y-4">
          <div>
            <FieldLabel>Department Name</FieldLabel>
            <Input value={editName} onChange={setEditName} placeholder="Department name" />
          </div>
          <div>
            <FieldLabel optional>Description</FieldLabel>
            <Input value={editDescription} onChange={setEditDescription} placeholder="Description" />
          </div>

          {/* Icon + Color */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel>Icon</FieldLabel>
              <div className="flex flex-wrap gap-1.5">
                {EMOJI_OPTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setEditIcon(emoji)}
                    className="w-9 h-9 rounded-[8px] flex items-center justify-center text-lg transition-all"
                    style={{
                      background: editIcon === emoji ? 'var(--accent-subtle)' : 'var(--bg-elevated)',
                      border: `2px solid ${editIcon === emoji ? 'var(--accent)' : 'var(--border-subtle)'}`,
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <FieldLabel>Color</FieldLabel>
              <div className="flex flex-wrap gap-1.5">
                {COLOR_OPTIONS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setEditColor(c)}
                    className="w-7 h-7 rounded-full flex items-center justify-center transition-all hover:scale-110"
                    style={{
                      background: c,
                      border: `2px solid ${editColor === c ? '#fff' : 'transparent'}`,
                      boxShadow: editColor === c ? `0 0 12px ${c}60` : 'none',
                    }}
                  >
                    {editColor === c && <Check size={12} className="text-white" />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setEditMode(false)}
              className="btn-ghost flex-1 text-[14px]"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveEdit}
              disabled={updateDeptMutation.isPending || !editName.trim()}
              className="btn-primary flex-1 flex items-center gap-2 justify-center"
            >
              <Check size={14} />
              {updateDeptMutation.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>

          {/* Archive (custom departments only) */}
          {isCustom && (
            <div className="pt-3 border-t border-[var(--border-subtle)]">
              {!confirmArchive ? (
                <button
                  onClick={() => setConfirmArchive(true)}
                  className="flex items-center gap-2 w-full justify-center py-2.5 rounded-[10px] text-[14px] font-medium text-[var(--danger)] border border-[var(--danger)] hover:bg-[rgba(255,69,58,0.1)] transition-colors"
                >
                  <Trash2 size={14} />
                  Archive Department
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-[13px] text-[var(--danger)] text-center font-medium">
                    Archive this department? Members will be unassigned.
                  </p>
                  <div className="flex gap-2">
                    <button onClick={() => setConfirmArchive(false)} className="btn-ghost flex-1 text-[14px]">
                      Cancel
                    </button>
                    <button
                      onClick={() => archiveDeptMutation.mutate()}
                      disabled={archiveDeptMutation.isPending}
                      className="flex-1 py-2.5 rounded-[10px] text-[14px] font-medium text-white bg-[var(--danger)] hover:opacity-90 transition-opacity"
                    >
                      {archiveDeptMutation.isPending ? 'Archiving...' : 'Confirm Archive'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <>
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
              <div className="relative">
                <button
                  onClick={() => setAssignDropdownOpen(!assignDropdownOpen)}
                  className="flex items-center gap-1 text-[12px] text-[var(--accent)] font-medium"
                >
                  <UserPlus size={12} /> Assign Member
                </button>

                {assignDropdownOpen && (
                  <div className="absolute right-0 top-7 z-50 w-72 p-3 rounded-[12px] border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
                    <div className="flex items-center gap-2 mb-2 px-2 py-1.5 rounded-[8px] bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                      <Search size={12} className="text-[var(--text-tertiary)]" />
                      <input
                        type="text"
                        value={memberSearch}
                        onChange={(e) => setMemberSearch(e.target.value)}
                        placeholder="Search members..."
                        className="flex-1 bg-transparent text-[13px] text-[var(--text-primary)] outline-none"
                        autoFocus
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {filteredMembers.length > 0 ? (
                        filteredMembers.map((m: any) => (
                          <button
                            key={m.id}
                            onClick={() => assignMemberMutation.mutate(m.id)}
                            disabled={assignMemberMutation.isPending}
                            className="w-full flex items-center gap-2 p-2 rounded-[8px] hover:bg-[var(--bg-elevated)] transition-colors text-left"
                          >
                            <div className="w-6 h-6 rounded-full bg-[var(--accent-subtle)] flex items-center justify-center text-[10px] font-semibold text-[var(--accent)]">
                              {m.name?.[0] || '?'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[12px] font-medium text-[var(--text-primary)] truncate">{m.name}</p>
                              <p className="text-[10px] text-[var(--text-tertiary)] truncate">{m.email}</p>
                            </div>
                          </button>
                        ))
                      ) : (
                        <p className="text-[12px] text-[var(--text-tertiary)] text-center py-2">No available members</p>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setAssignDropdownOpen(false)
                        setMemberSearch('')
                      }}
                      className="mt-2 w-full text-center text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                    >
                      Close
                    </button>
                  </div>
                )}
              </div>
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
                {deptTasks
                  .filter((t: any) => t.status !== 'COMPLETE')
                  .slice(0, 10)
                  .map((task: any) => (
                    <div key={task.id} className="flex items-center gap-3 p-2.5 rounded-[8px] bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                      <div
                        className="w-1.5 h-8 rounded-full flex-shrink-0"
                        style={{
                          background:
                            task.priority === 'CRITICAL'
                              ? 'var(--danger)'
                              : task.priority === 'HIGH'
                                ? 'var(--warning)'
                                : 'var(--accent)',
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
        </>
      )}

      {ToastEl}
    </Dialog>
  )
}

// ─── User Management Table (admin only) ───────────────────
function UserManagementSection({
  members,
  departments,
  refetchMembers,
}: {
  members: any[]
  departments: any[]
  refetchMembers: () => void
}) {
  const currentUser = useUserStore((s) => s.currentUser)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingMember, setEditingMember] = useState<any>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Only visible to admins
  if (currentUser?.role !== 'ADMIN') return null

  const allMembers = Array.isArray(members) ? members : []
  const filteredMembers = searchQuery
    ? allMembers.filter(
        (m: any) =>
          m.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.email?.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : allMembers

  return (
    <div>
      <ModuleHeader icon={Users} title="User Management">
        <span className="badge badge-accent text-[10px]">Admin</span>
      </ModuleHeader>

      {/* Action bar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-[10px] bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
          <Search size={14} className="text-[var(--text-tertiary)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search members..."
            className="flex-1 bg-transparent text-[14px] text-[var(--text-primary)] outline-none"
          />
        </div>
        <button
          onClick={() => setShowInviteModal(true)}
          className="btn-ghost flex items-center gap-2 text-[14px]"
        >
          <Mail size={14} />
          Invite User
        </button>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary flex items-center gap-2 text-[14px]"
        >
          <UserPlus size={14} />
          Create User
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
        <table className="nexus-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Department</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredMembers.length > 0 ? (
              filteredMembers.map((user: any) => {
                const dept = (departments ?? []).find((d: any) => d.id === user.departmentId)
                return (
                  <tr
                    key={user.id}
                    className="clickable-row"
                    onClick={() => setEditingMember(user)}
                  >
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-[var(--accent-subtle)] flex items-center justify-center text-[11px] font-semibold text-[var(--accent)]">
                          {user.initials || user.name?.[0] || '?'}
                        </div>
                        <span className="font-medium text-[14px] text-[var(--text-primary)]">{user.name}</span>
                      </div>
                    </td>
                    <td className="text-[14px] text-[var(--text-secondary)]">{user.email}</td>
                    <td>
                      <span className="badge badge-accent text-[10px]">{user.role}</span>
                    </td>
                    <td className="text-[14px] text-[var(--text-primary)]">
                      {dept?.name || user.department || '-'}
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <div
                          className="w-[6px] h-[6px] rounded-full"
                          style={{ background: statusColors[user.status] || 'var(--text-tertiary)' }}
                        />
                        <span className="text-[14px] text-[var(--text-primary)]">
                          {(user.status || 'AVAILABLE').replace(/_/g, ' ').toLowerCase()}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setEditingMember(user)}
                          className="p-1.5 rounded-[6px] text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:bg-[var(--bg-elevated)] transition-colors"
                          title="Edit member"
                        >
                          <Edit3 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            ) : (
              <tr>
                <td colSpan={6} className="text-center text-[14px] text-[var(--text-tertiary)] py-8">
                  {searchQuery ? 'No members match your search' : 'No members found'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      <InviteUserModal
        open={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        departments={departments}
      />
      <CreateUserModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        departments={departments}
        refetchMembers={refetchMembers}
      />
      {editingMember && (
        <EditMemberModal
          open={true}
          onClose={() => setEditingMember(null)}
          member={editingMember}
          departments={departments}
          refetchMembers={refetchMembers}
        />
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────
export function DeptManagerPage() {
  const { data: departments, isLoading: deptsLoading } = useDepartments()
  const { data: tasks } = useTasks()
  const { data: members, refetch: refetchMembers } = useQuery({
    queryKey: ['members'],
    queryFn: () => api.get('/members').then((r) => r.data),
  })
  const setPage = useAppStore((s) => s.setPage)

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedDept, setSelectedDept] = useState<any>(null)

  const allTasks = Array.isArray(tasks) ? tasks : (tasks as any)?.tasks ?? []
  const allMembers = Array.isArray(members) ? members : []
  const allDepartments = departments ?? []

  const builtIn = (allDepartments as any[]).filter(
    (d: any) => d.type === 'BUILTIN_RD' || d.type === 'BUILTIN_OPS',
  )
  const custom = (allDepartments as any[]).filter((d: any) => d.type === 'CUSTOM')

  const getMemberCount = (dept: any): number => {
    return dept.members?.length ?? allMembers.filter((m: any) => m.departmentId === dept.id).length ?? 0
  }

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
              const pendingCount = deptTasks.filter((t: any) => t.status === 'NOT_STARTED').length
              const highPri = deptTasks.filter(
                (t: any) => t.priority === 'CRITICAL' || t.priority === 'HIGH',
              ).length
              const memberCount = getMemberCount(dept)

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
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--accent-subtle)] text-[var(--accent)]">
                        <Users size={9} /> {memberCount} members
                      </span>
                      {pendingCount > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[rgba(255,159,10,0.15)] text-[#FF9F0A]">
                          <Clock size={9} /> {pendingCount}
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
              {custom.map((dept: any) => {
                const memberCount = getMemberCount(dept)
                return (
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
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--accent-subtle)] text-[var(--accent)]">
                          <Users size={9} /> {memberCount} members
                        </span>
                      </div>
                      <div className="h-1 rounded-full mt-1" style={{ background: dept.color, opacity: 0.6 }} />
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <p className="text-[14px] text-[var(--text-secondary)] mb-6">
              No custom departments yet. Click "Create Department" to add one.
            </p>
          )}
        </div>
      )}

      {/* User Management (admin only) */}
      <UserManagementSection
        members={allMembers}
        departments={allDepartments as any[]}
        refetchMembers={refetchMembers}
      />

      {/* Create Department Modal */}
      <CreateDepartmentModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        departments={allDepartments as any[]}
      />

      {/* Department Detail Drawer */}
      {selectedDept && (
        <DeptDetailDrawer
          dept={selectedDept}
          tasks={allTasks}
          allMembers={allMembers}
          departments={allDepartments as any[]}
          onClose={() => setSelectedDept(null)}
        />
      )}
    </div>
  )
}
