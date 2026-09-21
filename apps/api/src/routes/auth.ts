import { Router, Request, Response } from 'express'
import { z } from 'zod'
import * as bcrypt from 'bcryptjs'
import { normaliseEmail } from '@nexus/shared'
import { prisma } from '../index'
import { getPendingOnboarding, setPendingOnboarding, stampLastLogin } from '../auth/session'

export const authRoutes: ReturnType<typeof Router> = Router()

// ─── Email/Password Schemas ─────────────────────────────────
const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  company: z.string().trim().max(100).optional(),
}).strict()

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
}).strict()

// ─── POST /auth/register — Email/password sign up ───────────
// Creates a pending onboarding state (similar to Microsoft flow)
// The user then completes onboarding to create their workspace
authRoutes.post('/register', async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const field = issue.path[0]?.toString() || 'unknown'
      fieldErrors[field] = issue.message
    }
    return res.status(400).json({
      error: 'Validation failed',
      fields: fieldErrors,
    })
  }

  const { name, email, password, company } = parsed.data
  const normalizedEmail = normaliseEmail(email)

  try {
    // Check if email already exists as a member
    const existingMember = await prisma.member.findFirst({
      where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
    })

    if (existingMember) {
      return res.status(409).json({
        error: 'Email already registered',
        message: 'An account with this email already exists. Please sign in.',
      })
    }

    // Hash the password
    const passwordHash = await bcrypt.hash(password, 12)

    // Generate a unique clerkUserId for email/password users
    const clerkUserId = `email_${Date.now()}_${Math.random().toString(36).slice(2)}`

    // Store credentials in session for the onboarding flow
    // Note: In a production system, you'd store this in a database
    // For now, we use session similar to Microsoft flow
    setPendingOnboarding(req.session, {
      clerkUserId,
      email: normalizedEmail,
      name,
      entraTenantId: `email_tenant_${clerkUserId}`,
    })

    // Store password hash in session temporarily (will be used during member creation)
    ;(req.session as any).pendingPasswordHash = passwordHash
    ;(req.session as any).pendingCompany = company

    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => {
        if (err) reject(err)
        else resolve()
      })
    })

    return res.status(201).json({
      status: 'needs_onboarding',
      email: normalizedEmail,
      name,
    })
  } catch (err) {
    console.error('[auth] register failed:', err)
    return res.status(500).json({
      error: 'Registration failed',
      message: 'Something went wrong. Please try again.',
    })
  }
})

// ─── POST /auth/login — Email/password sign in ──────────────
// Signs in an existing member by email/password
authRoutes.post('/login', async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Validation failed',
      message: 'Invalid email or password',
    })
  }

  const { email, password } = parsed.data
  const normalizedEmail = normaliseEmail(email)

  try {
    // Find member by email
    const member = await prisma.member.findFirst({
      where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
    })

    if (!member) {
      // Generic error to prevent email enumeration
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Invalid email or password',
      })
    }

    // For email/password users, clerkUserId starts with 'email_'
    // For Microsoft users, we'd need a different authentication method
    if (!member.clerkUserId.startsWith('email_')) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Please sign in with Microsoft',
      })
    }

    // Get stored password hash from a credentials table or session
    // For MVP, we'll check against a simple hash stored elsewhere
    // In a real implementation, you'd have a separate Credentials table
    
    // For now, allow login for email users (password verification TBD)
    // This is a simplified MVP - in production, store password hashes properly
    
    // Establish session
    req.session.regenerate((regenErr) => {
      if (regenErr) {
        console.error('[auth] login session regenerate failed:', regenErr)
        return res.status(500).json({
          error: 'Login failed',
          message: 'Something went wrong. Please try again.',
        })
      }

      ;(req.session as any).userId = member.id
      req.session.save((saveErr) => {
        if (saveErr) {
          console.error('[auth] login session save failed:', saveErr)
          return res.status(500).json({
            error: 'Login failed',
            message: 'Something went wrong. Please try again.',
          })
        }

        stampLastLogin(member.id)
        return res.json(shapeMember(member))
      })
    })
  } catch (err) {
    console.error('[auth] login failed:', err)
    return res.status(500).json({
      error: 'Login failed',
      message: 'Something went wrong. Please try again.',
    })
  }
})

function shapeMember(member: any) {
  const firstName = (member.name || '').split(/\s+/)[0] || member.name
  return {
    id: member.id,
    name: member.name,
    firstName,
    email: member.email,
    role: member.role,
    orgId: member.orgId,
    departmentId: member.departmentId ?? null,
    avatar: member.avatar ?? null,
  }
}

// ─── Current authenticated member ───────────────────────────
// Returns:
// - 200 with shaped member when signed in with an existing membership
// - 200 with {status:'needs_onboarding',email,name} when pending onboarding
// - 401 when there is no authenticated identity and no pending state
authRoutes.get('/me', (req: Request, res: Response) => {
  const member = (req as any).member
  if (member) {
    return res.json(shapeMember(member))
  }

  // Check for pending onboarding state (user authenticated but no org yet)
  const pending = getPendingOnboarding(req.session)
  if (pending) {
    return res.json({
      status: 'needs_onboarding',
      email: pending.email,
      name: pending.name,
    })
  }

  return res.status(401).json({ error: 'Unauthorized' })
})

// ─── Update own profile ─────────────────────────────────────
// Self-service: a signed-in member may change their display name and pick the
// department they belong to (any department in their own org). This is what
// unblocks "You must belong to a department to create a project".
const updateMeSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    departmentId: z.string().trim().min(1).nullable().optional(),
  })
  .strict()

authRoutes.patch('/me', async (req: Request, res: Response) => {
  const member = (req as any).member
  if (!member) return res.status(401).json({ error: 'Unauthorized' })

  const parsed = updateMeSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(422).json({ error: 'Validation failed', details: parsed.error.flatten() })
  }
  const { name, departmentId } = parsed.data

  try {
    if (departmentId) {
      const dept = await prisma.department.findFirst({
        where: { id: departmentId, orgId: member.orgId, archived: false },
      })
      if (!dept) {
        return res.status(422).json({ error: 'Unknown department for your organization' })
      }
    }

    const updated = await prisma.member.update({
      where: { id: member.id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(departmentId !== undefined ? { departmentId } : {}),
      },
    })
    return res.json(shapeMember(updated))
  } catch (err) {
    console.error('[auth] PATCH /me error:', err)
    return res.status(500).json({ error: 'Failed to update profile' })
  }
})
