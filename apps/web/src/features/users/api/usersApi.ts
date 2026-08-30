import { api } from '@/lib/api'

// ─── User management client ──────────────────────────────────
// Every call unwraps the envelope in one place, and every failure is
// normalised into an ApiError carrying the server's field-level messages —
// otherwise each form would have to dig them out of axios itself, and half
// would forget.

export interface ApiFieldErrors {
  [field: string]: string
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: ApiFieldErrors,
    /// Anything else the envelope carried — `suggestion`, `memberId`,
    /// `retryAfter`, `required`.
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

function normalise(err: any): never {
  const status = err?.response?.status ?? 0
  const e = err?.response?.data?.error
  if (e) {
    const { code, message, fields, requestId, ...extra } = e
    throw new ApiError(status, code ?? 'UNKNOWN', message ?? 'Request failed', fields, extra)
  }
  throw new ApiError(status, 'NETWORK', err?.message ?? 'Could not reach the server')
}

async function get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  try {
    return (await api.get(path, { params })).data as T
  } catch (err) { return normalise(err) }
}
async function send<T>(method: 'post' | 'patch' | 'delete', path: string, body?: unknown): Promise<T> {
  try {
    const res = method === 'delete' ? await api.delete(path) : await api[method](path, body)
    return (res.data ?? {}) as T
  } catch (err) { return normalise(err) }
}

// ─── Types ───────────────────────────────────────────────────

export type LifecycleStatus = 'invited' | 'active' | 'suspended' | 'deactivated'

export interface RoleRef {
  id: string
  key: string
  name: string
  rank: number
}

export interface DirectoryUser {
  id: string
  email: string
  name: string
  displayName: string | null
  avatar: string | null
  jobTitle: string | null
  phone: string | null
  timezone: string
  locale: string
  lifecycleStatus: LifecycleStatus
  presenceStatus: string
  lastLoginAt: string | null
  deactivatedAt: string | null
  createdAt: string
  updatedAt: string
  department: { id: string; name: string; color: string | null } | null
  role: RoleRef | null
}

export interface Paged<T> {
  data: T[]
  page: number
  pageSize: number
  total: number
  pages: number
}

export interface EffectivePermission {
  key: string
  source: 'role' | 'override'
  reason?: string
  expiresAt?: string | null
}

export interface AuditRow {
  id: string
  action: string
  entityType: string
  entityId: string | null
  changes: Record<string, { from: unknown; to: unknown }> | null
  metadata: Record<string, unknown> | null
  createdAt: string
  actorLabel: string
  actor: { id: string; name: string; avatar: string | null } | null
}

export interface Me {
  id: string
  email: string
  lifecycleStatus: LifecycleStatus
  role: RoleRef | null
  permissions: EffectivePermission[]
  assignableRoles: RoleRef[]
}

export interface RoleSummary extends RoleRef {
  description: string | null
  isSystem: boolean
  memberCount: number
  permissionKeys: string[]
  assignableByMe: boolean
}

export interface RoleDetail extends RoleRef {
  description: string | null
  isSystem: boolean
  permissionsByResource: {
    resource: string
    permissions: { key: string; label: string; description: string | null }[]
  }[]
}

export interface PermissionGroup {
  resource: string
  permissions: {
    key: string
    action: string
    label: string
    description: string | null
  }[]
}

export interface UserListParams {
  q?: string
  status?: LifecycleStatus
  roleId?: string
  departmentId?: string
  page?: number
  pageSize?: number
  sort?: 'name' | 'email' | 'role' | 'lastActive' | 'created'
  dir?: 'asc' | 'desc'
}

// ─── Calls ───────────────────────────────────────────────────

export const fetchMe = () => get<{ data: Me }>('/rbac/me').then((r) => r.data)
export const fetchRoles = () => get<{ data: RoleSummary[] }>('/rbac/roles').then((r) => r.data)
export const fetchRole = (id: string) => get<{ data: RoleDetail }>(`/rbac/roles/${id}`).then((r) => r.data)
export const fetchPermissionCatalogue = () =>
  get<{ data: PermissionGroup[] }>('/rbac/permissions').then((r) => r.data)

export const fetchUsers = (params: UserListParams) =>
  get<Paged<DirectoryUser>>('/users', params as Record<string, unknown>)

export const fetchUser = (id: string) =>
  get<{ data: { user: DirectoryUser; effectivePermissions: EffectivePermission[]; recentActivity: AuditRow[] } }>(
    `/users/${id}`,
  ).then((r) => r.data)

export interface InviteResponse {
  data: { invitation: { id: string; email: string; expiresAt: string }; resent: boolean }
  meta: { emailConfigured?: boolean; acceptUrl?: string; note?: string }
}

export const inviteUser = (body: {
  email: string; firstName: string; lastName: string; roleId: string
  departmentId?: string | null; message?: string
}) => send<InviteResponse>('post', '/users/invite', body)

export const updateUser = (id: string, body: Record<string, unknown>) =>
  send<{ data: { id: string; updatedAt: string } }>('patch', `/users/${id}`, body)

export const changeUserRole = (id: string, roleId: string, reason?: string) =>
  send<{ data: unknown }>('patch', `/users/${id}/role`, { roleId, ...(reason ? { reason } : {}) })

export const changeUserStatus = (id: string, status: 'active' | 'suspended' | 'deactivated', reason: string) =>
  send<{ data: { sessionsRevoked: number } }>('patch', `/users/${id}/status`, { status, reason })

export const forceLogout = (id: string) =>
  send<{ data: { sessionsRevoked: number } }>('post', `/users/${id}/force-logout`, {})

export const setOverride = (
  id: string,
  body: { permissionKey: string; effect: 'grant' | 'deny'; reason: string; expiresAt?: string | null },
) => send<{ data: unknown }>('post', `/users/${id}/permissions`, body)

export const removeOverride = (id: string, permissionKey: string) =>
  send<void>('delete', `/users/${id}/permissions/${encodeURIComponent(permissionKey)}`)

export const fetchAudit = (params: {
  entityType?: string; entityId?: string; actorId?: string; action?: string
  from?: string; to?: string; page?: number; pageSize?: number
}) => get<Paged<AuditRow>>('/audit', params as Record<string, unknown>)

export const fetchDepartments = () =>
  get<{ data: { id: string; name: string; color?: string | null }[] }>('/projects/meta/departments').then((r) => r.data)
