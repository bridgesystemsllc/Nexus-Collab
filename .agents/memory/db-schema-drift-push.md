---
name: DB schema drift and rebase safety
description: Review Prisma diffs after merges because stale branches can remove live schema even when Git resolves cleanly.
---

# Database schema drift in isolated environments

An isolated task environment's PostgreSQL DB (`helium:5432/nexus`) can lag behind
`packages/prisma/prisma/schema.prisma`. Symptom: runtime error
`PrismaClientKnownRequestError P2021/P2022` for a missing table or column,
surfacing as a 500 on the affected route.

**Why:** the startup workflow only runs `prisma generate` (regenerates the client),
not `prisma migrate`/`db push`, so new columns added to the schema are never applied
to this environment's DB.

**How to apply:** generate a schema diff against the app's configured database and
review it before applying anything. Prefer targeted, transactional SQL when a broad
push proposes destructive changes. Database helpers may target localhost while this
app uses its explicit workflow database connection, so verify the target first.

After rebasing or merging a feature branch that changed Prisma models, a clean Git
merge is not proof that the resulting schema is complete. A branch based on an older
schema can silently remove newer models, relations, or columns and make `db push`
offer to destroy populated data.

**Why:** an automation UI/API merge replaced its intended models correctly but also
dropped unrelated ERP/OOR fields from the schema; the post-merge data-loss guard was
the only thing that prevented 120 populated links from being deleted.

**How to apply:** treat unexpected drops outside the feature's own tables as a schema
merge regression. Restore those definitions from current history, regenerate Prisma,
and rerun the diff. Only approve destructive changes inside the feature's own tables
after verifying their row counts and migration needs.
