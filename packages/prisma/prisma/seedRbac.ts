import { PrismaClient } from '@prisma/client'

// ─── Roles, permissions, and the legacy bridge ───────────────
// Idempotent: every row is upserted on a stable key, so re-running after a
// deploy reconciles rather than duplicating.
//
// The delicate part is not the seed itself, it is the migration of existing
// members onto the new role table without changing what they can already do.
// `Member.role` (the legacy string) is read in eighteen places, including
// policy.ts's isOrgAdmin, which treats ADMIN and OPS_MANAGER as org admin.
// This seed assigns `roleId` and deliberately leaves `role` untouched.

const prisma = new PrismaClient()

// ─── Permissions ─────────────────────────────────────────────
// Flat and string-keyed. Seeded only — a permission with no code behind it is
// a checkbox that lies.

interface PermSpec {
  key: string
  label: string
  description?: string
}

const PERMISSIONS: { resource: string; items: PermSpec[] }[] = [
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
    items: [{ key: 'billing:manage', label: 'Manage billing', description: 'Subscription and payment details' }],
  },
]

const ALL_KEYS = PERMISSIONS.flatMap((g) => g.items.map((i) => i.key))

// ─── Roles ───────────────────────────────────────────────────

interface RoleSpec {
  key: string
  name: string
  description: string
  rank: number
  /// What gets written to Member.role when this role is assigned.
  legacyRole: string
  permissions: string[]
}

const ROLES: RoleSpec[] = [
  {
    key: 'owner',
    name: 'Owner',
    description: 'Full control, including billing. There is always at least one.',
    rank: 0,
    legacyRole: 'ADMIN',
    permissions: ALL_KEYS,
  },
  {
    key: 'admin',
    name: 'Admin',
    description: 'Full user and settings management. No billing.',
    rank: 10,
    legacyRole: 'ADMIN',
    permissions: ALL_KEYS.filter((k) => k !== 'billing:manage'),
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
    permissions: ['users:read', 'roles:read', 'settings:read', 'projects:read', 'projects:create', 'projects:update', 'departments:read'],
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

/// Existing Member.role → new role key. Chosen so that nobody's effective
/// authority changes on migration: both ADMIN and OPS_MANAGER already pass
/// isOrgAdmin, so both land on `admin`.
const LEGACY_TO_ROLE: Record<string, string> = {
  ADMIN: 'admin',
  OPS_MANAGER: 'admin',
  DEPT_LEAD: 'manager',
  PROJECT_LEAD: 'member',
  MEMBER: 'member',
}

// ─── Notification defaults ───────────────────────────────────
// A missing row means "use this", never "off" — an event added later must not
// arrive silently disabled for everyone who predates it.

export const NOTIFICATION_EVENTS = [
  'task_assigned', 'task_due_soon', 'task_overdue', 'mention',
  'comment_reply', 'project_status_change', 'approval_requested', 'weekly_summary',
] as const

export const NOTIFICATION_CHANNELS = ['in_app', 'email', 'digest'] as const

export const NOTIFICATION_DEFAULTS: Record<string, Record<string, boolean>> = {
  task_assigned:          { in_app: true,  email: true,  digest: false },
  task_due_soon:          { in_app: true,  email: false, digest: true },
  task_overdue:           { in_app: true,  email: true,  digest: true },
  mention:                { in_app: true,  email: true,  digest: false },
  comment_reply:          { in_app: true,  email: false, digest: true },
  project_status_change:  { in_app: true,  email: false, digest: true },
  approval_requested:     { in_app: true,  email: true,  digest: false },
  weekly_summary:         { in_app: false, email: false, digest: true },
}

// ─── Seed ────────────────────────────────────────────────────

async function main() {
  // Permissions
  let order = 0
  for (const group of PERMISSIONS) {
    for (const item of group.items) {
      const [resource, action] = item.key.split(':')
      await prisma.permission.upsert({
        where: { key: item.key },
        create: {
          key: item.key, resource: resource!, action: action!,
          label: item.label, description: item.description ?? null, sortOrder: order++,
        },
        update: { label: item.label, description: item.description ?? null, resource: resource!, action: action!, sortOrder: order++ },
      })
    }
  }
  console.log(`  ${ALL_KEYS.length} permissions`)

  // Roles and their grants
  for (const spec of ROLES) {
    const role = await prisma.role.upsert({
      where: { key: spec.key },
      create: {
        key: spec.key, name: spec.name, description: spec.description,
        rank: spec.rank, isSystem: true, legacyRole: spec.legacyRole,
      },
      update: { name: spec.name, description: spec.description, rank: spec.rank, isSystem: true, legacyRole: spec.legacyRole },
    })

    // Replace the grant set so a permission removed from a system role here is
    // actually revoked, rather than lingering from an earlier seed.
    await prisma.rolePermission.deleteMany({
      where: { roleId: role.id, permissionKey: { notIn: spec.permissions } },
    })
    for (const key of spec.permissions) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionKey: { roleId: role.id, permissionKey: key } },
        create: { roleId: role.id, permissionKey: key },
        update: {},
      })
    }
    console.log(`  role ${spec.key.padEnd(8)} rank ${String(spec.rank).padStart(2)}  ${spec.permissions.length} permissions  → legacy ${spec.legacyRole}`)
  }

  const roles = await prisma.role.findMany()
  const byKey = new Map(roles.map((r) => [r.key, r]))

  // ── Migrate existing members ──
  // roleId only. `role` is left exactly as it was: it is what policy.ts and
  // the task/report routes still read, and rewriting it here would change
  // people's access as a side effect of a seed.
  const members = await prisma.member.findMany({
    where: { roleId: null },
    select: { id: true, role: true, email: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })

  for (const m of members) {
    const key = LEGACY_TO_ROLE[m.role] ?? 'member'
    await prisma.member.update({
      where: { id: m.id },
      data: { roleId: byKey.get(key)!.id },
    })
  }
  if (members.length) console.log(`  mapped ${members.length} existing members onto roles (Member.role untouched)`)

  // ── Guarantee an Owner ──
  // The last-owner guard is meaningless with nobody to protect. The longest-
  // standing org admin becomes Owner; if there is no admin at all, the oldest
  // member does, because a workspace with no owner cannot be administered.
  const ownerRole = byKey.get('owner')!
  const owners = await prisma.member.count({
    where: { roleId: ownerRole.id, lifecycleStatus: 'active' },
  })
  if (owners === 0) {
    const candidate =
      (await prisma.member.findFirst({
        where: { role: { in: ['ADMIN', 'OPS_MANAGER'] } },
        orderBy: { createdAt: 'asc' },
      })) ?? (await prisma.member.findFirst({ orderBy: { createdAt: 'asc' } }))

    if (candidate) {
      await prisma.member.update({ where: { id: candidate.id }, data: { roleId: ownerRole.id } })
      console.log(`  owner → ${candidate.email} (longest-standing admin)`)
    } else {
      console.warn('  no members exist — no Owner assigned')
    }
  }

  // ── Preferences for anyone without them ──
  const missing = await prisma.member.findMany({
    where: { preference: null },
    select: { id: true },
  })
  for (const m of missing) {
    await prisma.userPreference.create({ data: { memberId: m.id } })
  }
  if (missing.length) console.log(`  created preferences for ${missing.length} members`)

  console.log('\nRBAC seed complete.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
