import { describe, it, expect } from 'vitest'
import { normaliseEmail, emailSchema } from '@nexus/shared'

// ─── Email normalisation ─────────────────────────────────────
// `Member.email` is @unique and Postgres compares byte-for-byte, so
// case-insensitive uniqueness exists only because every write path stores the
// same form. There is no functional unique index behind it to catch a path
// that forgets — Prisma 5 cannot express one — which makes these the only
// enforcement there is.

describe('normaliseEmail', () => {
  it('lowercases', () => {
    expect(normaliseEmail('Ahmad@Kareve.COM')).toBe('ahmad@kareve.com')
  })

  it('trims surrounding whitespace', () => {
    expect(normaliseEmail('  ahmad@kareve.com \n')).toBe('ahmad@kareve.com')
  })

  it('collapses the case variants that would otherwise be separate accounts', () => {
    const variants = ['ahmad@kareve.com', 'Ahmad@kareve.com', 'AHMAD@KAREVE.COM', ' Ahmad@Kareve.com ']
    expect(new Set(variants.map(normaliseEmail)).size).toBe(1)
  })

  it('is idempotent', () => {
    const once = normaliseEmail('Ahmad@Kareve.COM')
    expect(normaliseEmail(once)).toBe(once)
  })

  it('leaves the local part otherwise intact', () => {
    // Dots and plus-addressing are significant to some providers; normalising
    // them away would merge addresses that genuinely belong to different
    // mailboxes.
    expect(normaliseEmail('first.last+nexus@kareve.com')).toBe('first.last+nexus@kareve.com')
  })
})

describe('emailSchema', () => {
  it('applies the same normalisation as normaliseEmail', () => {
    // The two must agree: the schema guards request bodies, the function guards
    // the paths that never see one (Microsoft SSO, seeds, backfills).
    for (const raw of ['Ahmad@Kareve.COM', '  Tom@Kareve.com  ', 'MiXeD.Case@Example.Org']) {
      expect(emailSchema.parse(raw)).toBe(normaliseEmail(raw))
    }
  })

  it('still rejects what is not an address', () => {
    expect(emailSchema.safeParse('not-an-email').success).toBe(false)
  })
})
