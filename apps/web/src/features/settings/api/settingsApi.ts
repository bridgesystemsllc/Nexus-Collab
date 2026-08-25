import { api } from '@/lib/api'
import { ApiError, type EffectivePermission, type RoleRef } from '@/features/users/api/usersApi'

// ─── Settings client ─────────────────────────────────────────
// Shares ApiError and the envelope handling with the user-management client;
// a second copy of that normalisation is how the two would drift.

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

export interface MyProfile {
  id: string
  email: string
  firstName: string
  lastName: string
  name: string
  displayName: string | null
  avatar: string | null
  jobTitle: string | null
  phone: string | null
  timezone: string
  locale: string
  lifecycleStatus: string
  emailVerifiedAt: string | null
  pendingEmail: string | null
  pendingEmailExpiresAt: string | null
  createdAt: string
  lastLoginAt: string | null
  department: { id: string; name: string; color: string | null } | null
  role: RoleRef | null
}

export interface Preferences {
  theme: 'system' | 'light' | 'dark'
  density: 'comfortable' | 'compact'
  defaultLandingPage: string
  weekStartsOn: number
  dateFormat: string
  timeFormat: '12h' | '24h'
  sidebarCollapsed: boolean
  digestFrequency: 'off' | 'daily' | 'weekly'
  quietHoursStart: number | null
  quietHoursEnd: number | null
}

/** What the server applies when a member has never touched their preferences. */
export const PREFERENCE_DEFAULTS: Preferences = {
  theme: 'system',
  density: 'comfortable',
  defaultLandingPage: 'dashboard',
  weekStartsOn: 1,
  dateFormat: 'MMM d, yyyy',
  timeFormat: '12h',
  sidebarCollapsed: false,
  digestFrequency: 'daily',
  quietHoursStart: null,
  quietHoursEnd: null,
}

export interface NotificationCell {
  channel: 'in_app' | 'email' | 'digest'
  eventKey: string
  enabled: boolean
  isDefault: boolean
}

export interface MeBundle {
  profile: MyProfile
  preferences: Preferences | null
  notifications: NotificationCell[]
  permissions: EffectivePermission[]
  assignableRoles: RoleRef[]
}

export interface SessionRow {
  id: string
  expiresAt: string
  isCurrent: boolean
}

export interface RoleSummary extends RoleRef {
  description: string | null
  isSystem: boolean
  memberCount: number
  permissionKeys: string[]
  assignableByMe: boolean
}

export interface PermissionGroup {
  resource: string
  permissions: { key: string; action: string; label: string; description: string | null }[]
}

// ─── Calls ───────────────────────────────────────────────────

export const fetchMeBundle = () => get<{ data: MeBundle }>('/me').then((r) => r.data)

export const updateProfile = (body: Record<string, unknown>) =>
  send<{ data: { id: string; updatedAt: string } }>('patch', '/me', body)

export const updatePreferences = (body: Partial<Preferences>) =>
  send<{ data: Preferences }>('patch', '/me/preferences', body)

export const updateNotifications = (
  entries: { channel: string; eventKey: string; enabled: boolean }[],
) => send<{ data: NotificationCell[] }>('patch', '/me/notifications', { entries })

export const fetchSessions = () => get<{ data: SessionRow[] }>('/me/sessions').then((r) => r.data)

export const signOutOthers = () =>
  send<{ data: { revoked: number } }>('delete', '/me/sessions')

export interface EmailChangeResponse {
  data: { pendingEmail: string; requiresConfirmation: boolean }
  meta: { emailConfigured: boolean; note: string; confirmUrl?: string }
}

export const requestEmailChange = (newEmail: string) =>
  send<EmailChangeResponse>('post', '/me/email-change', { newEmail })

export const verifyEmailChange = (token: string) =>
  send<{ data: { email: string } }>('post', '/me/email-change/verify', { token })

export const cancelEmailChange = () => send<void>('delete', '/me/email-change')

export const fetchRoles = () => get<{ data: RoleSummary[] }>('/rbac/roles').then((r) => r.data)

export const fetchPermissionCatalogue = () =>
  get<{ data: PermissionGroup[] }>('/rbac/permissions').then((r) => r.data)

export const createRole = (body: { name: string; description?: string; clonedFromRoleId: string }) =>
  send<{ data: { id: string; key: string; name: string; rank: number } }>('post', '/rbac/roles', body)

export const updateRole = (
  id: string,
  body: { name?: string; description?: string | null; permissionKeys?: string[] },
) => send<{ data: { id: string } }>('patch', `/rbac/roles/${id}`, body)

export const deleteRole = (id: string) => send<void>('delete', `/rbac/roles/${id}`)
