# ─────────────────────────────────────────────────────────────
# Nexus Collab — Multi-stage production Dockerfile
# ─────────────────────────────────────────────────────────────
# Build: docker build -t nexus-collab .
# Run:   docker run -p 3000:3000 --env-file .env.production nexus-collab

# ═══════════════════════════════════════════════════════════════
# Stage 1: Dependencies + Build
# ═══════════════════════════════════════════════════════════════
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm globally
RUN corepack enable && corepack prepare pnpm@9 --activate

# Copy package manifests for dependency caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/prisma/package.json packages/prisma/
COPY packages/shared/package.json packages/shared/

# Install all dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Generate Prisma client
RUN pnpm db:generate

# Build shared package
RUN pnpm build:shared

# Build frontend (Vite)
RUN pnpm --filter @nexus/web build

# Build backend (TypeScript → JavaScript)
RUN pnpm --filter @nexus/api build

# ═══════════════════════════════════════════════════════════════
# Stage 2: Production runtime
# ═══════════════════════════════════════════════════════════════
FROM node:20-alpine AS runner

WORKDIR /app

# Install pnpm for production installs
RUN corepack enable && corepack prepare pnpm@9 --activate

# Add curl for health checks
RUN apk add --no-cache curl

# Copy package manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/prisma/package.json packages/prisma/
COPY packages/shared/package.json packages/shared/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy Prisma schema and generated client
COPY packages/prisma/prisma packages/prisma/prisma
COPY --from=builder /app/node_modules/.pnpm/@prisma+client*/node_modules/.prisma node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client node_modules/@prisma/client

# Copy built shared package
COPY --from=builder /app/packages/shared/dist packages/shared/dist

# Copy built backend
COPY --from=builder /app/apps/api/dist apps/api/dist

# Copy built frontend (served by Express in production)
COPY --from=builder /app/apps/web/dist apps/web/dist

# Create non-root user for security
RUN addgroup --system --gid 1001 nexus && \
    adduser --system --uid 1001 nexus
USER nexus

# Environment
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Health check — matches the /health endpoint shape
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start the production server
CMD ["node", "apps/api/dist/index.js"]
