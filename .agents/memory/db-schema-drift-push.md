---
name: DB schema drift in task environments
description: Isolated task environments may have a DB that lags schema.prisma; symptom is "column does not exist", fix is prisma db push.
---

# Database schema drift in isolated environments

An isolated task environment's PostgreSQL DB (`helium:5432/nexus`) can lag behind
`packages/prisma/prisma/schema.prisma`. Symptom: runtime error
`PrismaClientKnownRequestError P2022 — The column X does not exist in the current database`
(e.g. `CoworkSpace.metadata`), surfacing as a 500 on the affected route.

**Why:** the startup workflow only runs `prisma generate` (regenerates the client),
not `prisma migrate`/`db push`, so new columns added to the schema are never applied
to this environment's DB.

**How to apply:** when you see P2022 / "column does not exist", run from the repo:
`cd packages/prisma && DATABASE_URL="postgresql://postgres:${PGPASSWORD}@helium:5432/nexus" npx prisma db push --skip-generate`
This is additive and non-destructive for added columns. It is a per-environment sync,
not a code change — the main app DB may also need the same sync after merge.
