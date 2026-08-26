// ─── The RBAC catalogue ──────────────────────────────────────
// The permissions that exist and the five built-in roles, as data.
//
// This lives in the shared package because three things need it and they must
// not disagree: the seed script, the API's boot-time bootstrap, and anything
// that wants to name a permission without spelling it. A second copy is how a
// role ends up meaning one thing in the seed and another in the app.

export interface PermissionSpec {
  key: string
  label: string
  description?: string
}

export const PERMISSION_GROUPS: { resource: string; items: PermissionSpec[] }[] = [
  {
    resource: 'users',
    items: [
      { key: 'users:read', label: 'View users', description: 'See the user directory and profiles' },
      { key: 'users:create', label: 'Invite users', description: 'Send invitations to new people' },
      { key: 'users:update', label: 'Edit users', description: "Change another person's profile details" },
      { key: 'users:deactivate', label: 'Deactivate users', description: 'Suspend or deactivate an account, ending their sessions' },
    ],
  },
  {
    resource: 'roles',
    items: [
      { key: 'roles:read', label: 'View roles', description: 'See roles and what each one can do' },
      { key: 'roles:assign', label: 'Assign roles', description: "Change a person's role, never to one at or above your own" },
      { key: 'roles:manage', label: 'Manage roles', description: 'Create and edit custom roles and their permissions' },
    ],
  },
  {
    resource: 'settings',
    items: [
      { key: 'settings:read', label: 'View settings', description: 'See workspace settings' },
      { key: 'settings:manage', label: 'Manage settings', description: 'Change workspace settings' },
    ],
  },
  {
    resource: 'audit',
    items: [{ key: 'audit:read', label: 'View audit log', description: 'Read the record of who changed what' }],
  },
  {
    resource: 'projects',
    items: [
      { key: 'projects:read', label: 'View projects', description: 'See projects and their tasks' },
      { key: 'projects:create', label: 'Create projects', description: 'Start a new initiative' },
      { key: 'projects:update', label: 'Edit projects', description: 'Change project details and timelines' },
      { key: 'projects:delete', label: 'Archive projects', description: 'Archive a project' },
    ],
  },
  {
    resource: 'departments',
    items: [
      { key: 'departments:read', label: 'View departments', description: 'See the department structure' },
      { key: 'departments:manage', label: 'Manage departments', description: 'Create, rename and archive departments' },
    ],
  },
  {
    resource: 'billing',
    items: [
      { key: 'billing:read', label: 'View billing', description: 'See the plan, seats, invoices and payment methods' },
      { key: 'billing:manage', label: 'Manage billing', description: 'Change the plan, seats and payment details' },
    ],
  },
]

export const ALL_PERMISSION_KEYS: string[] = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.key))

export interface RoleSpec {
  key: string
  name: string
  description: string
  /// Lower is more powerful. Owner is 0.
  rank: number
  /// What gets written to Member.role when this role is assigned.
  legacyRole: string
  permissions: string[]
}

export const SYSTEM_ROLES: RoleSpec[] = [
  {
    key: 'owner',
    name: 'Owner',
    description: 'Full control, including billing. There is always at least one.',
    rank: 0,
    legacyRole: 'ADMIN',
    permissions: ALL_PERMISSION_KEYS,
  },
  {
    key: 'admin',
    name: 'Admin',
    description: 'Full user and settings management. No billing.',
    rank: 10,
    legacyRole: 'ADMIN',
    permissions: ALL_PERMISSION_KEYS.filter((k) => k !== 'billing:manage'),
  },
  {
    key: 'manager',
    name: 'Manager',
    description: "Manages their own department's people and projects.",
    rank: 20,
    // DEPT_LEAD, not OPS_MANAGER. policy.ts counts OPS_MANAGER as org admin,
    // so mapping manager onto it would have promoted every department lead to
    // org-wide admin the first time their profile was saved.
    legacyRole: 'DEPT_LEAD',
    permissions: [
      'users:read', 'users:create', 'users:update',
      'roles:read', 'roles:assign',
      'settings:read',
      'projects:read', 'projects:create', 'projects:update',
      'departments:read',
    ],
  },
  {
    key: 'member',
    name: 'Member',
    description: 'Standard collaborator.',
    rank: 30,
    legacyRole: 'MEMBER',
    permissions: [
      'users:read', 'roles:read', 'settings:read',
      'projects:read', 'projects:create', 'projects:update', 'departments:read',
    ],
  },
  {
    key: 'guest',
    name: 'Guest',
    description: 'Read-only, limited to the projects they are invited to.',
    rank: 40,
    legacyRole: 'MEMBER',
    permissions: ['projects:read', 'departments:read'],
  },
]

/**
 * Existing `Member.role` → new role key.
 *
 * Chosen so nobody's effective authority changes on migration: both ADMIN and
 * OPS_MANAGER already pass policy.ts's isOrgAdmin, so both land on `admin`.
 */
export const LEGACY_ROLE_TO_KEY: Record<string, string> = {
  ADMIN: 'admin',
  OPS_MANAGER: 'admin',
  DEPT_LEAD: 'manager',
  PROJECT_LEAD: 'member',
  MEMBER: 'member',
}
