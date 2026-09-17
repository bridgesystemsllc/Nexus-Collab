# Nexus Collab

Nexus Collab is a full-stack workspace collaboration platform built with a pnpm monorepo architecture.

## Architecture

```
nexus-collab/
├── apps/
│   ├── api/          # Express API server
│   └── web/          # Vite React frontend
├── packages/
│   ├── prisma/       # Prisma schema and migrations
│   └── shared/       # Shared utilities and types
└── docs/             # Operations documentation
```

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL 16+

### Development Setup

```bash
# Install dependencies
pnpm install

# Generate Prisma client
pnpm db:generate

# Push schema to database (dev only)
pnpm db:push

# Seed the database
pnpm db:seed

# Start development servers
pnpm dev
```

This starts:
- **API**: http://localhost:3000
- **Web**: http://localhost:5173

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Required for development
DATABASE_URL="postgresql://nexus:nexus@localhost:5432/nexus"
SESSION_SECRET="your-dev-session-secret"

# Required for production (API refuses to start without)
TOKEN_ENCRYPTION_KEY=""  # openssl rand -hex 32
```

See `.env.staging.example` and `.env.production.example` for full configuration.

## Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all dev servers |
| `pnpm dev:api` | Start API only |
| `pnpm dev:web` | Start frontend only |
| `pnpm build` | Build frontend |
| `pnpm build:api` | Build API |
| `pnpm build:all` | Full production build |
| `pnpm db:generate` | Generate Prisma client |
| `pnpm db:push` | Push schema to database |
| `pnpm db:seed` | Seed database |
| `pnpm db:studio` | Open Prisma Studio |
| `pnpm typecheck` | Type-check API |
| `pnpm test` | Run all tests |
| `pnpm jobs` | Run background jobs |
| `pnpm worker` | Start BullMQ worker |

## Production

### Docker

```bash
# Build image
docker build -t nexus-collab .

# Run container
docker run -p 3000:3000 --env-file .env.production nexus-collab
```

### Health Check

```bash
curl http://localhost:3000/health
# {"ok":true,"version":"0.1.0","time":"2024-01-01T00:00:00.000Z"}
```

### Cloud Run Deployment

See [docs/deploy-runbook.md](docs/deploy-runbook.md) for full deployment instructions.

## Documentation

- [Deployment Runbook](docs/deploy-runbook.md) — Cloud Run deployment guide
- [Backup & Restore](docs/backup-restore.md) — Database backup procedures
- [Background Jobs](docs/background-jobs.md) — Scheduled job configuration
- [UAT Guide](docs/uat/kareve-day1.md) — Day-1 acceptance testing

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check (returns `{ ok, version, time }`) |
| `GET /api/v1/*` | Authenticated API routes |
| `POST /api/v1/webhooks/stripe` | Stripe webhook (signature verified) |
| `POST /api/v1/jobs/run/:group` | Background job trigger (bearer auth) |

## Observability

### Logging

Structured JSON logging via Pino. Configure with:

```bash
LOG_LEVEL="info"  # debug, info, warn, error, fatal
```

### Error Tracking

Optional Sentry integration. Set `SENTRY_DSN` to enable:

```bash
SENTRY_DSN="https://xxx@sentry.io/xxx"
```

When unset, Sentry is disabled (no-op) and the API boots normally.

## Security

- **Authentication**: Microsoft Entra ID (SSO)
- **Sessions**: PostgreSQL-backed, secure cookies
- **Token Encryption**: AES-256-GCM for OAuth tokens
- **RBAC**: Role-based access control with permission overrides

### Required Secrets

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection |
| `SESSION_SECRET` | Cookie signing |
| `TOKEN_ENCRYPTION_KEY` | OAuth token encryption (enforced in production) |

## License

Proprietary — KarEve Cosmetics
