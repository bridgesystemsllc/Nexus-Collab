---
name: Prisma client must be regenerated when the schema changes
description: Why prisma.<model> can be undefined at runtime and how startup guards against it
---

A Prisma model can exist in `schema.prisma` yet be **undefined on the prisma client** at runtime (`prisma.<model>` is `undefined` → `Cannot read properties of undefined (reading 'findMany')`). This happens when a schema change (often from a merge) lands without anyone running `prisma generate` — the generated client is stale.

**Why it bites here:** the API is launched directly via `tsx` (not through a package script), so no `prisma generate` ran automatically; merges that add models silently broke every route using that model until the client was regenerated.

**How to apply:**
- The startup workflow now runs `prisma generate` before booting the API, so a clean environment or a schema-changing merge self-heals on restart. Keep that step in the workflow command.
- After any merge that touches `schema.prisma`, also run `prisma db push` so the database has the new tables/columns, not just the client.
- This is separate from type-checking: `tsx`/esbuild ignore types, so a stale client is a *runtime* failure, not a compile error.
