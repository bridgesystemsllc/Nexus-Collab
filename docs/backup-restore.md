# Backup & Restore Procedures

Database backup and recovery procedures for Nexus Collab.

## Overview

Nexus Collab uses PostgreSQL. This document covers:

1. Automated backup configuration
2. Manual backup procedures
3. Point-in-time recovery
4. Disaster recovery

## Automated Backups (Cloud SQL)

### Configuration

Cloud SQL automated backups are enabled by default:

- **Frequency**: Daily
- **Retention**: 7 days (configurable up to 365)
- **Window**: 02:00–06:00 UTC (low-traffic period)
- **Point-in-time recovery**: Enabled

### Verify Backup Configuration

```bash
gcloud sql instances describe nexus-prod \
  --format="yaml(settings.backupConfiguration)"
```

### Enable Point-in-Time Recovery

```bash
gcloud sql instances patch nexus-prod \
  --enable-point-in-time-recovery \
  --retained-transaction-log-days=7
```

## Manual Backup Procedures

### Export to Cloud Storage

```bash
# Create a backup bucket (one-time setup)
gcloud storage buckets create gs://nexus-backups-prod \
  --location=us-central1 \
  --uniform-bucket-level-access

# Export database
gcloud sql export sql nexus-prod gs://nexus-backups-prod/manual/nexus-$(date +%Y%m%d-%H%M%S).sql \
  --database=nexus \
  --offload
```

### Local pg_dump

For local backups or cross-environment transfers:

```bash
# Full database dump
pg_dump "$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file=nexus-backup-$(date +%Y%m%d).dump

# Schema only (for review)
pg_dump "$DATABASE_URL" \
  --schema-only \
  --file=nexus-schema-$(date +%Y%m%d).sql

# Data only (for seeding)
pg_dump "$DATABASE_URL" \
  --data-only \
  --file=nexus-data-$(date +%Y%m%d).sql
```

### Verify Backup Integrity

```bash
# List contents without restoring
pg_restore --list nexus-backup-20240101.dump

# Test restore to a temp database
createdb nexus_backup_test
pg_restore --dbname=nexus_backup_test nexus-backup-20240101.dump
dropdb nexus_backup_test
```

## Restore Procedures

### Restore from Cloud SQL Backup

```bash
# List available backups
gcloud sql backups list --instance=nexus-prod

# Restore from a specific backup
gcloud sql backups restore BACKUP_ID \
  --restore-instance=nexus-prod \
  --backup-instance=nexus-prod
```

> **Warning**: Restoring overwrites the current database. This is a destructive operation.

### Point-in-Time Recovery

Restore to a specific timestamp (requires PITR enabled):

```bash
# Create a new instance from PITR
gcloud sql instances clone nexus-prod nexus-recovery \
  --point-in-time="2024-01-15T14:30:00Z"

# Verify data, then promote if correct
# (or delete recovery instance if not needed)
```

### Restore from pg_dump

```bash
# Stop the application to prevent writes
# (scale Cloud Run to 0 or enable maintenance mode)

# Clear existing data (if full restore)
psql "$DATABASE_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# Restore
pg_restore \
  --dbname="$DATABASE_URL" \
  --no-owner \
  --no-privileges \
  --clean \
  --if-exists \
  nexus-backup-20240101.dump

# Run migrations to ensure schema is current
cd packages/prisma && npx prisma migrate deploy

# Restart application
```

## Pre-Deployment Backup

Before any deployment or migration:

```bash
# 1. Create manual backup
gcloud sql export sql nexus-prod \
  gs://nexus-backups-prod/pre-deploy/nexus-$(date +%Y%m%d-%H%M%S).sql \
  --database=nexus

# 2. Verify export completed
gcloud sql operations list --instance=nexus-prod --limit=1

# 3. Proceed with deployment
```

## Disaster Recovery

### Recovery Time Objectives

| Scenario | RTO | RPO |
|----------|-----|-----|
| Cloud SQL backup restore | ~30 min | 24 hours |
| Point-in-time recovery | ~45 min | 5 minutes |
| Cross-region failover | ~1 hour | 5 minutes |

### Failover Procedure

1. **Assess the failure**
   - Check Cloud SQL instance status
   - Review Cloud Run logs for connection errors

2. **Initiate recovery**
   ```bash
   # If Cloud SQL is unavailable, restore to new instance
   gcloud sql instances clone nexus-prod nexus-recovery \
     --point-in-time="LATEST_KNOWN_GOOD_TIME"
   ```

3. **Update connection string**
   - Update `DATABASE_URL` in Cloud Run secrets
   - Redeploy the service

4. **Verify application**
   - Check `/health` endpoint
   - Verify critical workflows

## Backup Retention Policy

| Backup Type | Retention | Location |
|-------------|-----------|----------|
| Daily automated | 7 days | Cloud SQL |
| Weekly manual | 30 days | Cloud Storage |
| Pre-deployment | 90 days | Cloud Storage |
| Monthly archive | 1 year | Cloud Storage (Coldline) |

## Monitoring

### Alert on Backup Failures

```bash
# Set up alerting policy
gcloud monitoring policies create \
  --display-name="Cloud SQL Backup Failure" \
  --condition-threshold-value=0 \
  --condition-threshold-comparison=COMPARISON_LT \
  --condition-filter='metric.type="cloudsql.googleapis.com/database/auto_backup/success"'
```

### Verify Recent Backups

```bash
# Check last successful backup
gcloud sql backups list --instance=nexus-prod --limit=1
```

## Security

- Backups are encrypted at rest (Google-managed or CMEK)
- Export files in Cloud Storage use bucket-level encryption
- Access to backups requires `cloudsql.backups.get` IAM permission
- Backup bucket has Object Versioning enabled
- Never store backups with credentials or PII in filenames
