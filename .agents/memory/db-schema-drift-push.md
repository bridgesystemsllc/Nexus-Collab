---
name: DB schema drift in task environments
description: Isolated task environments may lag schema.prisma; repair with targeted additive SQL, not a broad Prisma push.
---

# Database schema drift in isolated environments

An isolated task environment's PostgreSQL DB (`helium:5432/nexus`) can lag behind
`packages/prisma/prisma/schema.prisma`. Symptom: runtime error
`PrismaClientKnownRequestError P2021/P2022` for a missing table or column,
surfacing as a 500 on the affected route.

**Why:** the startup workflow only runs `prisma generate` (regenerates the client),
not `prisma migrate`/`db push`, so new columns added to the schema are never applied
to this environment's DB.

**How to apply:** generate a schema diff against the app's configured database,
review it, and apply only the missing additive tables, columns, indexes, and foreign
keys. Do not run a broad `prisma db push`: the database contains an express-session
table that is intentionally absent from Prisma and would be treated as removable
drift. Database helpers may target localhost while this app uses its explicit
workflow database connection, so verify the target before applying any DDL.
