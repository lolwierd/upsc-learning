# ====================================
# UPSC MCQ API - Docker Build
# ====================================

# Stage 1: Build
FROM node:24-slim AS builder

WORKDIR /app

# Build tooling for native deps (better-sqlite3, sharp)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN npm install -g pnpm

# Copy workspace files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/db/package.json ./packages/db/
COPY apps/worker/package.json ./apps/worker/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/shared ./packages/shared
COPY packages/db ./packages/db
COPY apps/worker ./apps/worker
COPY tsconfig.json ./

# Build shared package first
WORKDIR /app/packages/shared
RUN pnpm build || true

# Build worker
WORKDIR /app/apps/worker
RUN pnpm build

# ====================================
# Stage 2: Production
# ====================================
FROM node:24-slim AS runner

WORKDIR /app

# Install required build tools for better-sqlite3
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/db/package.json ./packages/db/
COPY apps/worker/package.json ./apps/worker/

# Install production dependencies
RUN pnpm install --frozen-lockfile --prod

# Rebuild better-sqlite3 for this platform
WORKDIR /app/apps/worker
RUN pnpm rebuild better-sqlite3

# Copy built files
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/worker/dist ./dist
COPY packages/db/migrations ./packages/db/migrations

# Create data directory
RUN mkdir -p /app/data

# Environment
ENV NODE_ENV=production
ENV PORT=3001
ENV DATABASE_PATH=/app/data/upsc-mcq.db

EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/ || exit 1

CMD ["node", "dist/server.js"]
