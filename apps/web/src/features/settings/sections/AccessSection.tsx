import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Lock, Plus, Trash2, Users } from 'lucide-react'
import { useModalBehaviour } from '@/modules/projects/lib/useModalBehaviour'
import { ApiError } from '@/features/users/api/usersApi'
import {
  fetchRoles, fetchPermissionCatalogue, createRole, updateRole, deleteRole,
  type MeBundle, type RoleSummary, type PermissionGroup,
} from '../api/settingsApi'
import { Section, Field, Alert, inputClass, borderFor, SectionSkeleton } from '../components/SettingsPrimitives'

// ─── Access and permissions ──────────────────────────────────
// The role editor. Two rules shape the whole screen, and both are enforced
// server-side regardless of what is rendered here:
//
//   1. Built-in roles are read-only. They are the fixed points the rank rule
//      is expressed in terms of; editing `owner` would make the hierarchy
//      editable from inside itself. Clone to get something changeable.
//   2. You cannot put a permission into a role that you do not hold yourself,
//      or `roles:manage` becomes a way to mint authority from nothing.
//
// Checkboxes for permissions the viewer lacks are disabled rather than hidden,
// because the reason matters: an admin needs to see that the permission exists
// and that they specifically cannot grant it.

export function AccessSection({ me }: { me: MeBundle }) {
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [cloning, setCloning] = useState<RoleSummary | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const roles = useQuery({ queryKey: ['rbac', 'roles'], queryFn: fetchRoles })
  const catalogue = useQuery({
    queryKey: ['rbac', 'permissions'],
    queryFn: fetchPermissionCatalogue,
    staleTime: 10 * 60_000,
  })

  const mine = useMemo(() => new Set(me.permissions.map((p) => p.key)), [me.permissions])
  const canManage = mine.has('roles:manage')

  if (roles.isLoading || catalogue.isLoading) return <SectionSkeleton />
  if (roles.isError || catalogue.isError) {
    return <Section title="Roles"><Alert>Could not load roles.</Alert></Section>
  }

  const list = roles.data ?? []
  const selected = list.find((r) => r.id === selectedId) ?? null

  return (
    <div className="space-y-4">
      {toast && (
        <p role="status" className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: 'var(--border)', background: 'var(--bg-subtle)' }}>
          {toast}
        </p>
      )}

      <Section
        title="Roles"
        description="What each role can do, and how many people hold it."
        action={
          canManage ? (
            <button
              onClick={() => setCloning(list.find((r) => r.key === 'member') ?? list[list.length - 1] ?? null)}
              disabled={list.length === 0}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-40"
              style={{ background: 'var(--accent)' }}
            >
              <Plus size={13} /> New role
            </button>
          ) : undefined
        }
      >
        <ul className="space-y-1.5">
          {list.map((role) => {
            const open = role.id === selectedId
            return (
              <li key={role.id} className="rounded-lg border" style={{ borderColor: open ? 'var(--accent)' : 'var(--border)' }}>
                <button
                  onClick={() => setSelectedId(open ? null : role.id)}
                  aria-expanded={open}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-[var(--text-primary)]">{role.name}</span>
                      {role.isSystem && (
                        <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] text-[var(--text-tertiary)]" style={{ background: 'rgba(0,0,0,0.04)' }}>
                          <Lock size={8} /> built-in
                        </span>
                      )}
                    </div>
                    {role.description && (
                      <p className="mt-0.5 truncate text-[10px] text-[var(--text-tertiary)]">{role.description}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-[10px] text-[var(--text-tertiary)]">
                    <span className="inline-flex items-center gap-1">
                      <Users size={10} /> {role.memberCount}
                    </span>
                    <span className="tabular-nums">{role.permissionKeys.length} perms</span>
                  </div>
                </button>

                {open && (
                  <div className="border-t px-3 py-3" style={{ borderColor: 'var(--border)' }}>
                    <RoleEditor
                      role={role}
                      catalogue={catalogue.data ?? []}
                      heldByMe={mine}
                      canManage={canManage}
                      myRoleId={me.profile.role?.id ?? null}
                      onClone={() => setCloning(role)}
                      onDone={(msg) => {
                        setToast(msg)
                        qc.invalidateQueries({ queryKey: ['rbac'] })
                        qc.invalidateQueries({ queryKey: ['me'] })
                      }}
                      onDeleted={(msg) => {
                        setSelectedId(null)
                        setToast(msg)
                        qc.invalidateQueries({ queryKey: ['rbac'] })
                      }}
                    />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </Section>

      {cloning && (
        <CloneRoleDialog
          source={cloning}
          roles={list}
          onClose={() => setCloning(null)}
          onCreated={(msg, id) => {
            setCloning(null)
            setToast(msg)
            setSelectedId(id)
            qc.invalidateQueries({ queryKey: ['rbac'] })
          }}
        />
      )}
    </div>
  )
}

// ─── One role ────────────────────────────────────────────────

function RoleEditor({
  role, catalogue, heldByMe, canManage, myRoleId, onClone, onDone, onDeleted,
}: {
  role: RoleSummary
  catalogue: PermissionGroup[]
  heldByMe: Set<string>
  canManage: boolean
  myRoleId: string | null
  onClone: () => void
  onDone: (msg: string) => void
  onDeleted: (msg: string) => void
}) {
  const [keys, setKeys] = useState<Set<string>>(new Set(role.permissionKeys))
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Mirrors the server's canEditRole. Rendering an editable form and then
  // taking a 403 on save would teach the rule the slowest possible way.
  const isMine = role.id === myRoleId
  const editable = canManage && !role.isSystem && !isMine

  const original = new Set(role.permissionKeys)
  const dirty = keys.size !== original.size || [...keys].some((k) => !original.has(k))

  const save = useMutation({
    mutationFn: () => updateRole(role.id, { permissionKeys: [...keys] }),
    onSuccess: () => { setSaved(true); setError(null); onDone(`${role.name} updated.`) },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not save the role.'),
  })

  const remove = useMutation({
    mutationFn: () => deleteRole(role.id),
    onSuccess: () => onDeleted(`${role.name} deleted.`),
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not delete the role.'),
  })

  const reason =
    role.isSystem ? 'Built-in roles cannot be edited. Clone this one to make a version you can change.'
    : isMine ? 'This is your own role. Editing it would be editing what you yourself may do.'
    : !canManage ? 'You do not have permission to manage roles.'
    : null

  return (
    <div>
      {reason && <p className="mb-3 text-[11px] text-[var(--text-tertiary)]">{reason}</p>}
      {error && <div className="mb-3"><Alert>{error}</Alert></div>}

      <div className="space-y-3">
        {catalogue.map((group) => (
          <div key={group.resource}>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-[var(--text-tertiary)]">
              {group.resource}
            </p>
            <div className="grid gap-1 sm:grid-cols-2">
              {group.permissions.map((perm) => {
                const checked = keys.has(perm.key)
                // You may keep a permission the role already has, and remove
                // any of them — only ADDING one you lack is refused.
                const cannotAdd = !heldByMe.has(perm.key) && !original.has(perm.key)
                const disabled = !editable || cannotAdd
                return (
                  <label
                    key={perm.key}
                    className={`flex items-start gap-2 rounded px-1.5 py-1 ${disabled ? 'opacity-55' : 'cursor-pointer hover:bg-[var(--bg-subtle)]'}`}
                    title={cannotAdd ? 'You cannot grant a permission you do not have yourself.' : perm.description ?? ''}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={(e) => {
                        setKeys((prev) => {
                          const next = new Set(prev)
                          if (e.target.checked) next.add(perm.key)
                          else next.delete(perm.key)
                          return next
                        })
                        setSaved(false)
                      }}
                      className="mt-0.5"
                    />
                    <span className="min-w-0">
                      <span className="block text-[11px] leading-snug text-[var(--text-primary)]">{perm.label}</span>
                      {perm.description && (
                        <span className="block text-[10px] leading-snug text-[var(--text-tertiary)]">{perm.description}</span>
                      )}
                    </span>
                  </label>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
        <div className="flex gap-2">
          {canManage && (
            <button onClick={onClone} className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs text-[var(--text-secondary)]" style={{ borderColor: 'var(--border)' }}>
              <Copy size={12} /> Clone
            </button>
          )}
          {editable && (
            <button
              onClick={() => remove.mutate()}
              disabled={remove.isPending || role.memberCount > 0}
              title={role.memberCount > 0 ? 'Move everyone off this role first.' : undefined}
              className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs disabled:opacity-40"
              style={{ borderColor: 'var(--border)', color: 'var(--danger)' }}
            >
              <Trash2 size={12} /> Delete
            </button>
          )}
        </div>

        {editable && (
          <div className="flex items-center gap-2">
            {saved && !dirty && <span className="text-[11px]" style={{ color: 'var(--success)' }}>Saved</span>}
            {dirty && (
              <button onClick={() => setKeys(new Set(role.permissionKeys))} className="rounded-lg border px-2.5 py-1.5 text-xs text-[var(--text-secondary)]" style={{ borderColor: 'var(--border)' }}>
                Discard
              </button>
            )}
            <button
              onClick={() => { setError(null); save.mutate() }}
              disabled={!dirty || save.isPending}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
              style={{ background: 'var(--accent)' }}
            >
              {save.isPending ? 'Saving…' : 'Save permissions'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Clone ───────────────────────────────────────────────────

function CloneRoleDialog({
  source, roles, onClose, onCreated,
}: {
  source: RoleSummary
  roles: RoleSummary[]
  onClose: () => void
  onCreated: (msg: string, id: string) => void
}) {
  const ref = useModalBehaviour(onClose)
  const [name, setName] = useState(`${source.name} (copy)`)
  const [description, setDescription] = useState('')
  const [fromId, setFromId] = useState(source.id)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: () => createRole({
      name: name.trim(),
      ...(description.trim() ? { description: description.trim() } : {}),
      clonedFromRoleId: fromId,
    }),
    onSuccess: (r) => onCreated(`${r.data.name} created from ${roles.find((x) => x.id === fromId)?.name}.`, r.data.id),
    onError: (err) => {
      if (err instanceof ApiError) {
        setErrors(err.fields ?? {})
        setError(err.fields ? null : err.message)
        return
      }
      setError('Could not create the role.')
    },
  })

  const from = roles.find((r) => r.id === fromId)

  return (
    <div
      className="projects-module fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8"
      style={{ background: 'rgba(0,0,0,0.28)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Create a role"
    >
      <div
        ref={ref}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-3 rounded-2xl border p-5 shadow-xl"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
      >
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Create a role</h2>
          <p className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">
            New roles start as a copy of an existing one — an empty role can see nothing, which is
            almost never what anybody wants.
          </p>
        </div>

        {error && <Alert>{error}</Alert>}

        <Field label="Start from">
          <select value={fromId} onChange={(e) => setFromId(e.target.value)} className={inputClass} style={borderFor()}>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name} — {r.permissionKeys.length} permissions</option>)}
          </select>
        </Field>

        <Field label="Name" error={errors.name}>
          <input value={name} onChange={(e) => { setName(e.target.value); setErrors({}) }} className={inputClass} style={borderFor(errors.name)} />
        </Field>

        <Field label="Description" error={errors.description} hint="Optional. What this role is for.">
          <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} style={borderFor(errors.description)} />
        </Field>

        {from && (
          <p className="text-[11px] text-[var(--text-tertiary)]">
            It will start with {from.permissionKeys.length} permission{from.permissionKeys.length === 1 ? '' : 's'},
            and sit below your own role. You can change what it allows afterwards.
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-lg border px-3 py-2 text-xs text-[var(--text-secondary)]" style={{ borderColor: 'var(--border)' }}>
            Cancel
          </button>
          <button
            onClick={() => { setError(null); create.mutate() }}
            disabled={name.trim().length < 2 || create.isPending}
            className="rounded-lg px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
            style={{ background: 'var(--accent)' }}
          >
            {create.isPending ? 'Creating…' : 'Create role'}
          </button>
        </div>
      </div>
    </div>
  )
}
