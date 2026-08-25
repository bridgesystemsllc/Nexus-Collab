import { z } from 'zod'

// ─── User validation ─────────────────────────────────────────
// One source of truth, imported by both the Express routes and the React
// forms. A second copy on the client is how the two drift until the form
// accepts something the server rejects.
//
// Normalisation happens inside the schema, not in the handlers: email is
// lowercased and trimmed before it is ever compared for uniqueness, so the
// check and the write cannot disagree about what the value is.

export const LIFECYCLE_STATUSES = ['invited', 'active', 'suspended', 'deactivated'] as const
export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number]

/** Statuses an admin may set. `invited` is reached by inviting, not by edit. */
export const SETTABLE_STATUSES = ['active', 'suspended', 'deactivated'] as const

export const OVERRIDE_EFFECTS = ['grant', 'deny'] as const

// ─── Primitives ──────────────────────────────────────────────

/**
 * The one way an email address is written down.
 *
 * `Member.email` is `@unique`, and Postgres compares it byte-for-byte, so
 * `Ahmad@x.com` and `ahmad@x.com` are two different accounts as far as the
 * constraint is concerned. Case-insensitive uniqueness therefore has to come
 * from every write path storing the same form — Prisma 5 cannot express a
 * functional unique index, so there is no database-level fallback to catch a
 * path that forgets.
 *
 * Which is why this is a named function and not a `.toLowerCase()` inlined at
 * each call site: the ones that forget are invisible.
 */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase()
}

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Enter an email address.')
  .max(254, 'That email address is too long.')
  .email('That does not look like an email address.')

const nameSchema = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .max(50, `${label} must be 50 characters or fewer.`)

/**
 * E.164, permissively parsed.
 *
 * People type spaces, dashes and brackets; rejecting those would be pedantry.
 * What is rejected is anything that cannot be read as a number at all.
 */
export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s()\-.]/g, ''))
  .refine((v) => v === '' || /^\+?[1-9]\d{6,14}$/.test(v), 'Enter a valid phone number.')
  .transform((v) => (v === '' ? null : v.startsWith('+') ? v : `+${v}`))

/** Required wherever a decision needs to be explainable a year later. */
export const reasonSchema = z
  .string()
  .trim()
  .min(5, 'Give a reason of at least 5 characters.')
  .max(500, 'Keep the reason under 500 characters.')

export const timezoneSchema = z
  .string()
  .trim()
  .min(1)
  .refine((v) => {
    // Checked against the platform's own tz database rather than a hardcoded
    // list, which would go stale the next time a country changes its rules.
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: v })
      return true
    } catch {
      return false
    }
  }, 'That is not a recognised timezone.')

// ─── Invite ──────────────────────────────────────────────────

export const inviteUserSchema = z
  .object({
    email: emailSchema,
    firstName: nameSchema('First name'),
    lastName: nameSchema('Last name'),
    roleId: z.string().min(1, 'Choose a role.'),
    departmentId: z.string().optional().nullable(),
    message: z.string().trim().max(1000, 'Keep the message under 1000 characters.').optional(),
  })
  .strict()

export type InviteUserInput = z.infer<typeof inviteUserSchema>

// ─── Admin edits to another person ───────────────────────────
// Deliberately narrow. Role, status and permissions are not here — they have
// their own routes with their own guards and their own audit actions, so a
// profile edit can never quietly carry an authority change.

export const updateUserSchema = z
  .object({
    firstName: nameSchema('First name').optional(),
    lastName: nameSchema('Last name').optional(),
    displayName: z.string().trim().max(100).nullable().optional(),
    jobTitle: z.string().trim().max(100).nullable().optional(),
    departmentId: z.string().nullable().optional(),
    phone: phoneSchema.nullable().optional(),
    /// Optimistic-concurrency token. Two admins editing the same profile is
    /// the case this exists for.
    updatedAt: z.coerce.date().optional(),
  })
  .strict()

export type UpdateUserInput = z.infer<typeof updateUserSchema>

export const changeRoleSchema = z
  .object({ roleId: z.string().min(1, 'Choose a role.'), reason: reasonSchema.optional() })
  .strict()

export const changeStatusSchema = z
  .object({
    status: z.enum(SETTABLE_STATUSES),
    // Required, not optional: suspending someone without saying why leaves the
    // next admin no way to judge whether to undo it.
    reason: reasonSchema,
  })
  .strict()

export const permissionOverrideSchema = z
  .object({
    permissionKey: z.string().min(1),
    effect: z.enum(OVERRIDE_EFFECTS),
    reason: reasonSchema,
    expiresAt: z.coerce.date().nullable().optional(),
  })
  .strict()
  .refine((v) => !v.expiresAt || v.expiresAt.getTime() > Date.now(), {
    message: 'An expiry in the past would have no effect. Leave it empty for no expiry.',
    path: ['expiresAt'],
  })

// ─── Self-service ────────────────────────────────────────────
// `.strict()` is the enforcement, not an `if` in the handler: roleId, status
// and permissions are not fields here, so a request carrying them is rejected
// by the schema before any code runs.

export const updateMeSchema = z
  .object({
    firstName: nameSchema('First name').optional(),
    lastName: nameSchema('Last name').optional(),
    displayName: z.string().trim().max(100).nullable().optional(),
    jobTitle: z.string().trim().max(100).nullable().optional(),
    phone: phoneSchema.nullable().optional(),
    timezone: timezoneSchema.optional(),
    locale: z.string().trim().min(2).max(10).optional(),
  })
  .strict()

export const preferencesSchema = z
  .object({
    theme: z.enum(['system', 'light', 'dark']).optional(),
    density: z.enum(['comfortable', 'compact']).optional(),
    defaultLandingPage: z.string().trim().max(60).optional(),
    weekStartsOn: z.number().int().min(0).max(6).optional(),
    dateFormat: z.string().trim().max(40).optional(),
    timeFormat: z.enum(['12h', '24h']).optional(),
    sidebarCollapsed: z.boolean().optional(),
    digestFrequency: z.enum(['off', 'daily', 'weekly']).optional(),
    /// Minutes from midnight, so the pair is comparable without a date.
    quietHoursStart: z.number().int().min(0).max(1439).nullable().optional(),
    quietHoursEnd: z.number().int().min(0).max(1439).nullable().optional(),
  })
  .strict()

export const NOTIFICATION_CHANNELS = ['in_app', 'email', 'digest'] as const
export const NOTIFICATION_EVENTS = [
  'task_assigned', 'task_due_soon', 'task_overdue', 'mention',
  'comment_reply', 'project_status_change', 'approval_requested', 'weekly_summary',
] as const

export const notificationPrefsSchema = z
  .object({
    entries: z
      .array(
        z.object({
          channel: z.enum(NOTIFICATION_CHANNELS),
          eventKey: z.enum(NOTIFICATION_EVENTS),
          enabled: z.boolean(),
        }),
      )
      .max(NOTIFICATION_CHANNELS.length * NOTIFICATION_EVENTS.length),
  })
  .strict()

export const emailChangeSchema = z.object({ newEmail: emailSchema }).strict()

// ─── Roles ───────────────────────────────────────────────────

export const createRoleSchema = z
  .object({
    name: z.string().trim().min(2, 'Name the role.').max(60),
    description: z.string().trim().max(280).optional(),
    clonedFromRoleId: z.string().min(1, 'Choose a role to start from.'),
  })
  .strict()

export const updateRoleSchema = z
  .object({
    name: z.string().trim().min(2).max(60).optional(),
    description: z.string().trim().max(280).nullable().optional(),
    permissionKeys: z.array(z.string()).optional(),
  })
  .strict()

// ─── Directory query ─────────────────────────────────────────

export const userListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(LIFECYCLE_STATUSES).optional(),
  roleId: z.string().optional(),
  departmentId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.enum(['name', 'email', 'role', 'lastActive', 'created']).default('name'),
  dir: z.enum(['asc', 'desc']).default('asc'),
})

export type UserListQuery = z.infer<typeof userListQuerySchema>

// ─── Field-level errors ──────────────────────────────────────

/**
 * Flatten a Zod error into the envelope's `fields` map.
 *
 * One message per field: a form renders one message under an input, and
 * showing only the first keeps the server and the form in agreement about
 * which one that is.
 */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_'
    if (!(key in out)) out[key] = issue.message
  }
  return out
}
