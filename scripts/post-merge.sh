#!/bin/bash
set -euo pipefail

# Reconcile the environment after a task merge:
#   1. Install any new/changed dependencies.
#   2. Regenerate the Prisma client (prevents client/schema drift).
#   3. Apply schema changes to the database (this project uses `db push`, no
#      migration history).
#
# Step 3 used to run with --accept-data-loss, which is a standing instruction to
# destroy whatever the schema does not describe, without asking. It was doing
# exactly that: `session` is created at runtime by connect-pg-simple and was not
# in the schema, so every merge dropped it and logged every user out. The table
# is now declared in schema.prisma, and the blanket permission is gone — a
# destructive change fails this script instead of silently happening.

# Named explicitly: under `set -u` an unset PGPASSWORD aborts with "unbound
# variable", which sends whoever reads the log looking in the wrong place.
if [ -z "${PGPASSWORD:-}" ]; then
  echo "ERROR: PGPASSWORD is not set — cannot reach the database." >&2
  echo "It is normally provided by the Replit environment." >&2
  exit 1
fi

export DATABASE_URL="postgresql://postgres:${PGPASSWORD}@helium:5432/nexus"

pnpm install --frozen-lockfile=false

cd packages/prisma
npx prisma generate

# Record what is about to change. Without this the merge log says nothing about
# schema movement, so a surprise is only discovered from its consequences.
echo "── pending schema changes ──"
PENDING=$(npx prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma \
  --script 2>/dev/null | grep -v '^--' | grep -v '^$' || true)

if [ -z "$PENDING" ]; then
  echo "   none — database already matches the schema"
else
  echo "$PENDING" | sed 's/^/   /'
fi

# No --accept-data-loss. Prisma proceeds on additive changes (new tables,
# columns, indexes) and refuses on destructive ones, which is the behaviour we
# want: a merge should never be the thing that drops a column of real data.
if ! npx prisma db push --skip-generate; then
  cat <<'MSG'

────────────────────────────────────────────────────────────────────
Schema push refused — it would have destroyed data.

This is deliberate. The push runs without --accept-data-loss, so Prisma
stops rather than dropping a table or column on its own initiative.

Two things it usually means:

  1. The change genuinely drops something. Apply it by hand, deliberately:
       cd packages/prisma
       npx prisma db push --accept-data-loss

  2. A table exists in the database that the schema does not describe, so
     Prisma wants to remove it. If something outside Prisma owns that table
     (the way connect-pg-simple owns `session`), declare it in
     schema.prisma instead — see the Session model for the pattern.
────────────────────────────────────────────────────────────────────
MSG
  exit 1
fi

# Post-condition. The session table is created at runtime, so if a schema
# change ever removes it again the symptom is every user silently logged out —
# which nobody traces back to a merge. Fail here instead.
if ! npx prisma db execute --stdin --schema prisma/schema.prisma <<< 'SELECT 1 FROM "session" LIMIT 1;' >/dev/null 2>&1; then
  echo ""
  echo "ERROR: the 'session' table is missing after the schema push."
  echo "Everyone will be logged out and sessions will not persist."
  echo "Check that the Session model in schema.prisma still matches connect-pg-simple."
  exit 1
fi

echo "── schema in sync, session store intact ──"
