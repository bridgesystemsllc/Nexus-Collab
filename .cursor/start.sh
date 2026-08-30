#!/usr/bin/env bash
# Nexus Collab — Cloud Agent per-boot start.
# Brings PostgreSQL back up on every boot (data itself lives on disk from the
# install step). Tolerates an already-running cluster and returns once ready.
set -euo pipefail

echo "[start] starting PostgreSQL cluster"
sudo pg_ctlcluster 16 main start 2>/dev/null || true

for _ in $(seq 1 30); do
  if sudo -u postgres pg_isready -q; then
    echo "[start] PostgreSQL is ready"
    exit 0
  fi
  sleep 1
done

echo "[start] PostgreSQL did not become ready in time" >&2
exit 1
