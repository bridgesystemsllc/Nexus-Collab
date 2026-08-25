import { z } from 'zod'

// ─── What the legacy /members router may write ───────────────
// Its own module, deliberately importing nothing but zod: `members.ts` reaches
// into `../index` for the Prisma client, so importing the route file to get at
// this schema would boot the entire server — including the express app — which
// is not something a test of a validation object should do.
//
// This is the security boundary for `PATCH /members/:id`. That route used to
// pass `req.body` to Prisma verbatim, so any signed-in user could send
// `{ roleId: <owner role id> }` and become Owner: no permission check, no rank
// check, no last-owner guard, no audit row.
//
// An allowlist rather than a denylist on purpose. A denylist has to be updated
// every time a column is added to Member, and the failure mode of forgetting is
// silent. `roleId`, `lifecycleStatus`, `email`, `clerkUserId` and `orgId` are
// absent because they decide authority or identity, and each has its own route
// with its own guard.

export const updateMemberSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    avatar: z.string().trim().max(500).nullable().optional(),
    departmentId: z.string().nullable().optional(),
    /// Presence (AVAILABLE / FOCUSED / IN_MEETING / OOO), not lifecycle.
    status: z.enum(['AVAILABLE', 'FOCUSED', 'IN_MEETING', 'OOO']).optional(),
    /**
     * The legacy role string the projects module reads.
     *
     * Allowed through the schema and then guarded in the handler, which
     * requires roles:assign, refuses self-edits, mirrors the change onto
     * `roleId` and writes an audit row. A schema cannot express "only with a
     * permission", so it does not pretend to.
     */
    role: z.enum(['ADMIN', 'OPS_MANAGER', 'DEPT_LEAD', 'PROJECT_LEAD', 'MEMBER']).optional(),
  })
  .strict()

export type UpdateMemberInput = z.infer<typeof updateMemberSchema>
