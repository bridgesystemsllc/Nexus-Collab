#!/usr/bin/env bash
# Nexus Collab — Cloud Agent install (idempotent, repeatable).
# Prepares system deps, workspace deps, the Prisma client, and a seeded
# PostgreSQL database so the API + web dev servers can boot end to end.
set -euo pipefail

export DATABASE_URL="${DATABASE_URL:-postgresql://nexus:nexus@localhost:5432/nexus}"

echo "[install] ensuring PostgreSQL 16 is installed"
if ! command -v pg_ctlcluster >/dev/null 2>&1; then
  sudo apt-get update -y
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y postgresql postgresql-contrib
fi

echo "[install] starting PostgreSQL cluster"
sudo pg_ctlcluster 16 main start 2>/dev/null || true
for _ in $(seq 1 30); do
  if sudo -u postgres pg_isready -q; then break; fi
  sleep 1
done

echo "[install] ensuring nexus role and database exist"
sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='nexus'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE ROLE nexus LOGIN PASSWORD 'nexus';"
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='nexus'" | grep -q 1 \
  || sudo -u postgres createdb -O nexus nexus

echo "[install] installing workspace dependencies"
pnpm install --frozen-lockfile

echo "[install] building @nexus/shared and generating the Prisma client"
pnpm --filter @nexus/shared build
pnpm db:generate

echo "[install] applying the Prisma schema"
pnpm db:push

# The seed uses create() (Organization.slug is unique), so it is not
# re-runnable. Only seed when the database has no Organization rows yet.
HAS_DATA="$(PGPASSWORD=nexus psql -h localhost -U nexus -d nexus -tAc \
  'SELECT CASE WHEN to_regclass('"'"'public."Organization"'"'"') IS NULL THEN 0 ELSE (SELECT count(*) FROM "Organization") END;' \
  2>/dev/null | tr -d '[:space:]' || echo 0)"
if [ "${HAS_DATA:-0}" = "0" ]; then
  echo "[install] seeding database"
  pnpm db:seed
else
  echo "[install] database already has data — skipping seed"
fi

echo "[install] done"
