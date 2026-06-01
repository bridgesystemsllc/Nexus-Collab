#!/bin/bash
set -e

# Reconcile the environment after a task merge:
# 1. Install any new/changed dependencies.
# 2. Regenerate the Prisma client (prevents client/schema drift).
# 3. Push schema changes to the database (this project uses `db push`, no migrations).

export DATABASE_URL="postgresql://postgres:${PGPASSWORD}@helium:5432/nexus"

pnpm install --frozen-lockfile=false

cd packages/prisma
npx prisma generate
npx prisma db push --accept-data-loss --skip-generate
