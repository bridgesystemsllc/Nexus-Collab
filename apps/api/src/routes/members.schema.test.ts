import { describe, it, expect } from 'vitest'
import { updateMemberSchema } from './members.schema'

// ─── The legacy /members allowlist ───────────────────────────
// This schema is the security boundary, not a convenience.
//
// `PATCH /members/:id` used to pass `req.body` straight to Prisma. Any
// signed-in user could send `{ roleId: <owner role id> }` and become Owner —
// no permission check, no rank check, no last-owner guard, no audit row. It was
// reproduced against a running server: a Member was promoted to Owner in one
// request.
//
// Every field below is one an attacker reached for. The tests exist so that
// re-widening this object has to be deliberate.

const ok = { name: 'Tom L.' }

describe('updateMemberSchema', () => {
  it('accepts the profile fields the Dept Manager screen sends', () => {
    const parsed = updateMemberSchema.safeParse({
      name: 'Tom L.', departmentId: 'dept-1', status: 'FOCUSED', avatar: 'TL',
    })
    expect(parsed.success).toBe(true)
  })

  // ── The escalation vectors ──

  it('REFUSES roleId — the exact payload that granted Owner', () => {
    const parsed = updateMemberSchema.safeParse({ ...ok, roleId: 'role-owner' })
    expect(parsed.success).toBe(false)
  })

  it('REFUSES lifecycleStatus — reactivating yourself is not a profile edit', () => {
    expect(updateMemberSchema.safeParse({ ...ok, lifecycleStatus: 'active' }).success).toBe(false)
  })

  it('REFUSES email — identity moves through the confirmed change flow', () => {
    expect(updateMemberSchema.safeParse({ ...ok, email: 'someone@else.com' }).success).toBe(false)
  })

  it('REFUSES clerkUserId — that is the link to the Microsoft identity', () => {
    expect(updateMemberSchema.safeParse({ ...ok, clerkUserId: 'user_other' }).success).toBe(false)
  })

  it('REFUSES orgId — moving someone between workspaces is not an edit', () => {
    expect(updateMemberSchema.safeParse({ ...ok, orgId: 'org-2' }).success).toBe(false)
  })

  it('refuses an unknown field rather than ignoring it', () => {
    // .strict() rather than .passthrough(): a field silently dropped looks like
    // a successful save to whoever sent it.
    expect(updateMemberSchema.safeParse({ ...ok, whatever: true }).success).toBe(false)
  })

  it('names the offending key so the caller can fix the request', () => {
    const parsed = updateMemberSchema.safeParse({ ...ok, roleId: 'role-owner' })
    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(JSON.stringify(parsed.error.issues)).toContain('roleId')
    }
  })

  // ── The legacy role string ──

  it('allows the legacy role string through the schema', () => {
    // Permitted here and then guarded in the handler, which requires
    // roles:assign, refuses self-edits, mirrors roleId and writes an audit row.
    // The schema cannot express "only with a permission".
    expect(updateMemberSchema.safeParse({ role: 'DEPT_LEAD' }).success).toBe(true)
  })

  it('refuses a role string that is not one of the five', () => {
    expect(updateMemberSchema.safeParse({ role: 'SUPERUSER' }).success).toBe(false)
  })

  it('refuses presence values that are not real', () => {
    expect(updateMemberSchema.safeParse({ status: 'deactivated' }).success).toBe(false)
  })

  it('accepts an empty patch without inventing changes', () => {
    const parsed = updateMemberSchema.safeParse({})
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(Object.keys(parsed.data)).toHaveLength(0)
  })
})
