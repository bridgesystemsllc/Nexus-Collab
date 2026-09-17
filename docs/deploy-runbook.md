# Nexus Collab Deployment Runbook

Cloud Run deployment guide for Nexus Collab.

## Overview

Nexus Collab deploys as a single Cloud Run service serving both the API and the static frontend. The production cutover is managed by Ahmad T3.

## Prerequisites

- Google Cloud project with billing enabled
- Cloud Run API enabled
- Cloud SQL (PostgreSQL) instance
- Artifact Registry repository
- gcloud CLI authenticated

## Architecture

```
                    ┌─────────────────┐
                    │   Cloud Run     │
                    │   (nexus-api)   │
        ┌──────────►│                 │◄──────────┐
        │           │  Express + Vite │           │
        │           │     build       │           │
        │           └────────┬────────┘           │
        │                    │                    │
   HTTPS/443            PostgreSQL            Cloud SQL
   (load balancer)      connection            Connector
        │                    │                    │
        │                    ▼                    │
   ┌────┴────┐       ┌──────────────┐      ┌─────┴─────┐
   │ Browser │       │  Cloud SQL   │      │  Secrets  │
   │  Users  │       │  (nexus-db)  │      │  Manager  │
   └─────────┘       └──────────────┘      └───────────┘
```

## Environment Setup

### 1. Create Secrets

```bash
# Required secrets
echo -n "$DATABASE_URL" | gcloud secrets create nexus-database-url --data-file=-
echo -n "$SESSION_SECRET" | gcloud secrets create nexus-session-secret --data-file=-
echo -n "$TOKEN_ENCRYPTION_KEY" | gcloud secrets create nexus-token-key --data-file=-

# Optional secrets (as needed)
echo -n "$MICROSOFT_CLIENT_SECRET" | gcloud secrets create nexus-ms-secret --data-file=-
echo -n "$STRIPE_SECRET_KEY" | gcloud secrets create nexus-stripe-secret --data-file=-
echo -n "$SENTRY_DSN" | gcloud secrets create nexus-sentry-dsn --data-file=-
```

### 2. Grant Service Account Access

```bash
PROJECT_ID=$(gcloud config get-value project)
SERVICE_ACCOUNT="nexus-api@${PROJECT_ID}.iam.gserviceaccount.com"

# Grant Secret Manager access
gcloud secrets add-iam-policy-binding nexus-database-url \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor"

# Repeat for all secrets...
```

## Build & Deploy

### Build Docker Image

```bash
# Build locally
docker build -t nexus-collab .

# Tag for Artifact Registry
docker tag nexus-collab \
  us-central1-docker.pkg.dev/${PROJECT_ID}/nexus/api:${VERSION}

# Push to registry
docker push us-central1-docker.pkg.dev/${PROJECT_ID}/nexus/api:${VERSION}
```

### Deploy to Cloud Run

```bash
gcloud run deploy nexus-api \
  --image=us-central1-docker.pkg.dev/${PROJECT_ID}/nexus/api:${VERSION} \
  --region=us-central1 \
  --platform=managed \
  --allow-unauthenticated \
  --service-account=nexus-api@${PROJECT_ID}.iam.gserviceaccount.com \
  --set-cloudsql-instances=${PROJECT_ID}:us-central1:nexus-db \
  --memory=1Gi \
  --cpu=1 \
  --min-instances=1 \
  --max-instances=10 \
  --timeout=300 \
  --set-secrets="\
DATABASE_URL=nexus-database-url:latest,\
SESSION_SECRET=nexus-session-secret:latest,\
TOKEN_ENCRYPTION_KEY=nexus-token-key:latest" \
  --set-env-vars="\
NODE_ENV=production,\
PORT=3000,\
FRONTEND_URL=https://nexus.kareve.app"
```

## Rollback Procedure

Cloud Run maintains revision history. To rollback:

### Quick Rollback (Traffic Shift)

```bash
# List revisions
gcloud run revisions list --service=nexus-api --region=us-central1

# Route 100% traffic to previous revision
gcloud run services update-traffic nexus-api \
  --region=us-central1 \
  --to-revisions=nexus-api-00042-abc=100
```

### Rollback with Redeployment

```bash
# Deploy previous known-good version
gcloud run deploy nexus-api \
  --image=us-central1-docker.pkg.dev/${PROJECT_ID}/nexus/api:${PREVIOUS_VERSION} \
  --region=us-central1
```

## Health Checks

### Verify Deployment

```bash
# Get service URL
SERVICE_URL=$(gcloud run services describe nexus-api \
  --region=us-central1 \
  --format='value(status.url)')

# Check health endpoint
curl -s "${SERVICE_URL}/health" | jq
# Expected: {"ok":true,"version":"0.1.0","time":"..."}
```

### Cloud Run Health Configuration

The Dockerfile includes a `HEALTHCHECK` instruction. Cloud Run uses startup and liveness probes:

```yaml
# These are configured via gcloud or console:
startup-probe:
  httpGet:
    path: /health
  initialDelaySeconds: 10
  periodSeconds: 10
  failureThreshold: 3

liveness-probe:
  httpGet:
    path: /health
  periodSeconds: 30
```

## Database Migrations

### Before Deployment

```bash
# 1. Create pre-deployment backup
gcloud sql export sql nexus-db \
  gs://nexus-backups/pre-deploy-$(date +%Y%m%d-%H%M%S).sql \
  --database=nexus

# 2. Run migrations (from Cloud Shell or authorized machine)
DATABASE_URL="$PROD_DATABASE_URL" npx prisma migrate deploy
```

### Migration Rollback

If migrations fail:

```bash
# 1. Stop new deployment (route traffic to old revision)
gcloud run services update-traffic nexus-api \
  --region=us-central1 \
  --to-revisions=PREVIOUS_REVISION=100

# 2. Restore database from backup
# See docs/backup-restore.md
```

## Deployment Checklist

### Pre-Deployment

- [ ] All tests passing in CI
- [ ] Code reviewed and approved
- [ ] Database backup created
- [ ] Migration scripts reviewed (if any)
- [ ] Secrets updated (if needed)
- [ ] Changelog updated

### Deployment

- [ ] Build Docker image
- [ ] Push to Artifact Registry
- [ ] Run database migrations
- [ ] Deploy to Cloud Run
- [ ] Verify health endpoint
- [ ] Check application logs

### Post-Deployment

- [ ] Smoke test critical flows
- [ ] Monitor error rates in Sentry
- [ ] Monitor latency in Cloud Monitoring
- [ ] Update deployment log

## Monitoring

### Key Metrics

```bash
# View recent logs
gcloud run services logs read nexus-api --region=us-central1 --limit=100

# Check error rate
gcloud monitoring dashboards list
```

### Alerts to Watch

- Error rate > 1%
- P95 latency > 2s
- Instance count at max
- Memory utilization > 80%

## Troubleshooting

### Service Won't Start

1. Check logs for boot errors:
   ```bash
   gcloud run services logs read nexus-api --region=us-central1
   ```

2. Verify secrets are accessible:
   ```bash
   gcloud secrets versions access latest --secret=nexus-database-url
   ```

3. Check Cloud SQL connectivity:
   - Verify Cloud SQL instance is running
   - Check VPC connector (if using private IP)

### High Latency

1. Check Cloud SQL metrics for query performance
2. Review instance scaling settings
3. Check for connection pool exhaustion

### Memory Issues

1. Increase memory allocation
2. Check for memory leaks in logs
3. Review recent code changes

## Production Cutover

Production cutover is managed by **Ahmad T3**. The deployment team prepares the staging environment and notifies Ahmad when ready for final production deployment.

### Staging Validation

Before requesting production cutover:

1. Deploy to staging environment
2. Complete [UAT checklist](uat/kareve-day1.md)
3. Verify all integrations
4. Performance test critical paths
5. Document any known issues

### Cutover Request

Notify Ahmad T3 with:
- Staging URL for review
- Changelog since last production release
- UAT completion status
- Any special considerations

## Appendix: Useful Commands

```bash
# View service details
gcloud run services describe nexus-api --region=us-central1

# List all revisions
gcloud run revisions list --service=nexus-api --region=us-central1

# View service logs (streaming)
gcloud run services logs tail nexus-api --region=us-central1

# Scale to zero (maintenance mode)
gcloud run services update nexus-api --region=us-central1 --min-instances=0

# Force new deployment (same image)
gcloud run deploy nexus-api --region=us-central1 --image=SAME_IMAGE --no-traffic
gcloud run services update-traffic nexus-api --region=us-central1 --to-latest
```
