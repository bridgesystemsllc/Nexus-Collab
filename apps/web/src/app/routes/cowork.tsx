import { useState, useMemo } from 'react'
import {
  Users,
  MessageSquare,
  CheckSquare,
  Search,
  Plus,
  Link2,
  ChevronDown,
  X,
  Calendar,
  AlertCircle,
} from 'lucide-react'
import {
  useCoworkSpaces,
  useDepartments,
  useDepartment,
  useMembers,
  useCreateCoworkSpace,
  useCreateCoworkTask,
} from '@/hooks/useData'
import { useAppStore } from '@/stores/appStore'
import { Dialog } from '@/components/Dialog'

/* ─── Constants ───────────────────────────────────────────── */
const SPACE_TYPES = ['PROJECT', 'EMERGENCY', 'INITIATIVE', 'DEPARTMENT'] as const
const PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const

const LINK_CATEGORY_LABELS: Record<string, string> = {
  briefs: 'Active Brief',
  npd: 'NPD Project',
  artwork: 'Artwork Project',
  components: 'Component',
  transfers: 'Tech Transfer',
  formulations: 'Formulation',
}

const LINK_CATEGORY_ICONS: Record<string, string> = {
  briefs: '\u{1F4C4}',
  npd: '\u{1F680}',
  artwork: '\u{1F3A8}',
  components: '\u{1F9E9}',
  transfers: '\u{1F52C}',
  formulations: '\u{2697}\u{FE0F}',
}

/* ─── Page ────────────────────────────────────────────────── */
export function CoworkPage() {
  const { data: spaces, isLoading } = useCoworkSpaces()
  const setSelectedCowork = useAppStore((s) => s.setSelectedCowork)
  const [search, setSearch] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [quickTaskSpaceId, setQuickTaskSpaceId] = useState<string | null>(null)

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
            onClick={() => setShowCreateModal(true)}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" />
            Create Co-Work Space
          </button>
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
            const taskCount = space._count?.tasks ?? space.tasks?.length ?? 0
            const completeTasks = (space.tasks ?? []).filter((t: any) => t.status === 'COMPLETE').length
            const pendingTasks = taskCount - completeTasks
            const linkedMeta = space.linkedItem ?? space.metadata?.linkedItem

            return (
              <div
                key={space.id}
                className="data-cell text-left relative"
                style={{
                  ...(isEmergency
                    ? {
                        borderColor: 'var(--danger)',
                        boxShadow: 'var(--shadow-md)',
                      }
                    : {}),
                }}
              >
                <button
                  onClick={() => setSelectedCowork(space.id)}
                  className="w-full text-left cursor-pointer"
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

                    {/* Linked Item Chip */}
                    {linkedMeta && (
                      <div className="flex items-center gap-1.5 mb-2">
                        <span
                          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                          style={{
                            background: 'var(--accent-subtle)',
                            color: 'var(--accent)',
                            border: '1px solid var(--accent)',
                          }}
                        >
                          <Link2 className="w-3 h-3" />
                          {LINK_CATEGORY_ICONS[linkedMeta.category] ?? ''}{' '}
                          {LINK_CATEGORY_LABELS[linkedMeta.category] ?? linkedMeta.category}:{' '}
                          {linkedMeta.name}
                        </span>
                      </div>
                    )}

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
                        {taskCount} tasks
                        {taskCount > 0 && (
                          <span className="ml-0.5" style={{ color: 'var(--text-tertiary)' }}>
                            ({completeTasks} done, {pendingTasks} pending)
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                </button>

                {/* Quick-add Task Button */}
                <div className="relative z-10 mt-3 pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  {quickTaskSpaceId === space.id ? (
                    <QuickAddTask
                      spaceId={space.id}
                      onClose={() => setQuickTaskSpaceId(null)}
                    />
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setQuickTaskSpaceId(space.id)
                      }}
                      className="btn-ghost flex items-center gap-1.5 text-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Create Task
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20" style={{ color: 'var(--text-tertiary)' }}>
          <Users className="w-12 h-12 mb-4 opacity-40" />
          <p className="text-lg font-medium">No cowork spaces found</p>
          <p className="text-sm mt-1">Try adjusting your search or create a new space</p>
        </div>
      )}

      {/* Create Modal */}
      <CreateCoworkModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />
    </div>
  )
}

/* ─── Quick Add Task (inline on card) ────────────────────── */
function QuickAddTask({ spaceId, onClose }: { spaceId: string; onClose: () => void }) {
  const [title, setTitle] = useState('')
  const createTask = useCreateCoworkTask()
  const { data: members } = useMembers()
  const [assigneeId, setAssigneeId] = useState('')
  const [priority, setPriority] = useState('MEDIUM')

  const memberList = Array.isArray(members) ? members : []

  const handleSubmit = () => {
    if (!title.trim()) return
    createTask.mutate(
      {
        spaceId,
        title: title.trim(),
        assigneeId: assigneeId || undefined,
        priority,
      },
      { onSuccess: () => onClose() }
    )
  }

  return (
    <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
      <input
        type="text"
        placeholder="Task title..."
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
        className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)]"
        onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') onClose() }}
      />
      <div className="flex items-center gap-2">
        <select
          value={assigneeId}
          onChange={(e) => setAssigneeId(e.target.value)}
          className="bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-2 py-1.5 text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)] flex-1"
        >
          <option value="">Unassigned</option>
          {memberList.map((m: any) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-2 py-1.5 text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <button onClick={handleSubmit} disabled={createTask.isPending || !title.trim()} className="btn-primary text-xs px-3 py-1.5">
          {createTask.isPending ? 'Adding...' : 'Add'}
        </button>
        <button onClick={onClose} className="btn-ghost text-xs px-2 py-1.5">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

/* ─── Create Cowork Modal ────────────────────────────────── */
function CreateCoworkModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createSpace = useCreateCoworkSpace()
  const { data: departments } = useDepartments()
  const { data: members } = useMembers()

  const deptList = Array.isArray(departments) ? departments : []
  const memberList = Array.isArray(members) ? members : []

  // Find R&D department for linked items
  const rdDept = deptList.find((d: any) => d.type === 'BUILTIN_RD')
  const { data: rdDetail } = useDepartment(rdDept?.id ?? '')

  // Build linkable items from R&D modules
  const linkOptions = useMemo(() => {
    if (!rdDetail) return []
    const options: { category: string; label: string; id: string; name: string }[] = []
    const modules = rdDetail.modules ?? rdDetail.rdModules ?? []

    for (const mod of modules) {
      const items = mod.items ?? mod.data ?? []
      const categoryKey = (mod.key ?? mod.type ?? mod.name ?? '').toLowerCase()

      let category = 'briefs'
      let labelPrefix = 'Active Brief'
      if (categoryKey.includes('npd')) { category = 'npd'; labelPrefix = 'NPD Project' }
      else if (categoryKey.includes('artwork')) { category = 'artwork'; labelPrefix = 'Artwork Project' }
      else if (categoryKey.includes('component')) { category = 'components'; labelPrefix = 'Component' }
      else if (categoryKey.includes('transfer')) { category = 'transfers'; labelPrefix = 'Tech Transfer' }
      else if (categoryKey.includes('formula')) { category = 'formulations'; labelPrefix = 'Formulation' }
      else if (categoryKey.includes('brief')) { category = 'briefs'; labelPrefix = 'Active Brief' }

      for (const item of items) {
        const name = item.name ?? item.projectName ?? item.product ?? item.title ?? 'Untitled'
        options.push({
          category,
          label: `${labelPrefix}: ${name}`,
          id: item.id,
          name,
        })
      }
    }
    return options
  }, [rdDetail])

  // Form state
  const [name, setName] = useState('')
  const [type, setType] = useState<string>('PROJECT')
  const [description, setDescription] = useState('')
  const [linkSearch, setLinkSearch] = useState('')
  const [linkedItem, setLinkedItem] = useState<{ category: string; id: string; name: string } | null>(null)
  const [showLinkDropdown, setShowLinkDropdown] = useState(false)
  const [selectedDepts, setSelectedDepts] = useState<string[]>([])
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])
  const [showInitialTask, setShowInitialTask] = useState(false)
  const [taskTitle, setTaskTitle] = useState('')
  const [taskAssigneeId, setTaskAssigneeId] = useState('')
  const [taskPriority, setTaskPriority] = useState('MEDIUM')
  const [taskDueDate, setTaskDueDate] = useState('')

  const filteredLinks = linkSearch
    ? linkOptions.filter((o) => o.label.toLowerCase().includes(linkSearch.toLowerCase()))
    : linkOptions

  // Group links by category
  const groupedLinks = useMemo(() => {
    const groups: Record<string, typeof filteredLinks> = {}
    for (const opt of filteredLinks) {
      if (!groups[opt.category]) groups[opt.category] = []
      groups[opt.category].push(opt)
    }
    return groups
  }, [filteredLinks])

  const toggleDept = (id: string) => {
    setSelectedDepts((prev) => prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id])
  }

  const toggleMember = (id: string) => {
    setSelectedMembers((prev) => prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id])
  }

  const resetForm = () => {
    setName('')
    setType('PROJECT')
    setDescription('')
    setLinkSearch('')
    setLinkedItem(null)
    setSelectedDepts([])
    setSelectedMembers([])
    setShowInitialTask(false)
    setTaskTitle('')
    setTaskAssigneeId('')
    setTaskPriority('MEDIUM')
    setTaskDueDate('')
  }

  const handleSubmit = () => {
    if (!name.trim()) return
    const payload: any = {
      name: name.trim(),
      type,
      description: description.trim(),
      departmentIds: selectedDepts,
      memberIds: selectedMembers,
    }
    if (linkedItem) {
      payload.linkedItem = linkedItem
      payload.metadata = { linkedItem }
    }
    if (showInitialTask && taskTitle.trim()) {
      payload.initialTask = {
        title: taskTitle.trim(),
        assigneeId: taskAssigneeId || undefined,
        priority: taskPriority,
        dueDate: taskDueDate || undefined,
      }
    }
    createSpace.mutate(payload, {
      onSuccess: () => {
        resetForm()
        onClose()
      },
    })
  }

  return (
    <Dialog open={open} onClose={onClose} title="Create Co-Work Space" subtitle="Set up a new collaboration hub" wide>
      <div className="space-y-5">
        {/* Space Name */}
        <div>
          <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">
            Space Name <span className="text-[var(--danger)]">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Ambi Fade Cream Launch"
            className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3.5 py-2.5 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none transition-all focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_rgba(47,128,237,0.12)]"
          />
        </div>

        {/* Type */}
        <div>
          <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3.5 py-2.5 text-[14px] text-[var(--text-primary)] outline-none transition-all focus:border-[var(--accent)]"
          >
            {SPACE_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {/* Description */}
        <div>
          <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the purpose of this space..."
            rows={3}
            className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3.5 py-2.5 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none transition-all focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_rgba(47,128,237,0.12)] resize-none"
          />
        </div>

        {/* Link To */}
        <div>
          <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">
            Link To
          </label>
          {linkedItem ? (
            <div className="flex items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px]"
                style={{
                  background: 'var(--accent-subtle)',
                  color: 'var(--accent)',
                  border: '1px solid var(--accent)',
                }}
              >
                <Link2 className="w-3.5 h-3.5" />
                {LINK_CATEGORY_ICONS[linkedItem.category] ?? ''}{' '}
                {LINK_CATEGORY_LABELS[linkedItem.category] ?? linkedItem.category}:{' '}
                {linkedItem.name}
              </span>
              <button
                onClick={() => setLinkedItem(null)}
                className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
              <input
                type="text"
                value={linkSearch}
                onChange={(e) => {
                  setLinkSearch(e.target.value)
                  setShowLinkDropdown(true)
                }}
                onFocus={() => setShowLinkDropdown(true)}
                placeholder="Search briefs, NPD projects, formulations..."
                className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg pl-9 pr-3.5 py-2.5 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none transition-all focus:border-[var(--accent)]"
              />
              {showLinkDropdown && (
                <div
                  className="absolute top-full left-0 right-0 mt-1 z-20 max-h-56 overflow-y-auto rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-xl"
                >
                  {/* Standalone option */}
                  <button
                    onClick={() => {
                      setLinkedItem(null)
                      setShowLinkDropdown(false)
                      setLinkSearch('')
                    }}
                    className="w-full text-left px-3 py-2 text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    Standalone (no link)
                  </button>
                  <div style={{ borderTop: '1px solid var(--border-subtle)' }} />
                  {Object.entries(groupedLinks).map(([category, items]) => (
                    <div key={category}>
                      <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
                        {LINK_CATEGORY_ICONS[category] ?? ''} {LINK_CATEGORY_LABELS[category] ?? category}
                      </div>
                      {items.map((opt) => (
                        <button
                          key={opt.id}
                          onClick={() => {
                            setLinkedItem({ category: opt.category, id: opt.id, name: opt.name })
                            setShowLinkDropdown(false)
                            setLinkSearch('')
                          }}
                          className="w-full text-left px-3 py-2 pl-6 text-[13px] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                        >
                          {opt.name}
                        </button>
                      ))}
                    </div>
                  ))}
                  {Object.keys(groupedLinks).length === 0 && linkSearch && (
                    <div className="px-3 py-3 text-[13px] text-[var(--text-tertiary)] text-center">
                      No matching items found
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Departments */}
        <div>
          <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">Departments</label>
          <div className="flex flex-wrap gap-2">
            {deptList.map((dept: any) => (
              <label
                key={dept.id}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] cursor-pointer transition-all"
                style={{
                  background: selectedDepts.includes(dept.id) ? 'var(--accent-subtle)' : 'var(--bg-surface)',
                  border: `1px solid ${selectedDepts.includes(dept.id) ? 'var(--accent)' : 'var(--border-subtle)'}`,
                  color: selectedDepts.includes(dept.id) ? 'var(--accent)' : 'var(--text-secondary)',
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedDepts.includes(dept.id)}
                  onChange={() => toggleDept(dept.id)}
                  className="sr-only"
                />
                {dept.name}
              </label>
            ))}
          </div>
        </div>

        {/* Assign Members */}
        <div>
          <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">Assign Members</label>
          <div className="max-h-40 overflow-y-auto rounded-lg border border-[var(--border-subtle)] p-2 space-y-1" style={{ background: 'var(--bg-surface)' }}>
            {memberList.map((member: any) => (
              <label
                key={member.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-[13px] hover:bg-[var(--bg-hover)] transition-colors"
                style={{ color: 'var(--text-primary)' }}
              >
                <input
                  type="checkbox"
                  checked={selectedMembers.includes(member.id)}
                  onChange={() => toggleMember(member.id)}
                  className="rounded border-[var(--border-default)] accent-[var(--accent)]"
                />
                {member.name}
                {member.department?.name && (
                  <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                    ({member.department.name})
                  </span>
                )}
              </label>
            ))}
            {memberList.length === 0 && (
              <p className="text-[13px] text-center py-2" style={{ color: 'var(--text-tertiary)' }}>No members available</p>
            )}
          </div>
        </div>

        {/* Initial Task Toggle */}
        <div>
          <button
            onClick={() => setShowInitialTask(!showInitialTask)}
            className="flex items-center gap-2 text-[13px] font-medium transition-colors"
            style={{ color: 'var(--accent)' }}
          >
            <ChevronDown
              className="w-4 h-4 transition-transform"
              style={{ transform: showInitialTask ? 'rotate(180deg)' : 'rotate(0deg)' }}
            />
            {showInitialTask ? 'Hide Initial Task' : 'Add an Initial Task (optional)'}
          </button>

          {showInitialTask && (
            <div
              className="mt-3 p-4 rounded-lg space-y-3"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
            >
              <div>
                <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1">Task Title</label>
                <input
                  type="text"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="e.g. Review initial formula samples"
                  className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1">Assignee</label>
                  <select
                    value={taskAssigneeId}
                    onChange={(e) => setTaskAssigneeId(e.target.value)}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-2 py-2 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                  >
                    <option value="">Unassigned</option>
                    {memberList.map((m: any) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1">Priority</label>
                  <select
                    value={taskPriority}
                    onChange={(e) => setTaskPriority(e.target.value)}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-2 py-2 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1">Due Date</label>
                  <input
                    type="date"
                    value={taskDueDate}
                    onChange={(e) => setTaskDueDate(e.target.value)}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-2 py-2 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button onClick={onClose} className="btn-ghost text-sm">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || createSpace.isPending}
            className="btn-primary text-sm flex items-center gap-2"
          >
            {createSpace.isPending ? 'Creating...' : 'Create Space'}
          </button>
        </div>

        {createSpace.isError && (
          <div className="flex items-center gap-2 text-[13px] mt-2" style={{ color: 'var(--danger)' }}>
            <AlertCircle className="w-4 h-4" />
            Failed to create space. Please try again.
          </div>
        )}
      </div>
    </Dialog>
  )
}
