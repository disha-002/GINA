# GINA backend — Fastify API for Linux (Ubuntu 24.04 + Node.js 22)
#
# Build (from repository root):
#   docker build -f backend/Dockerfile -t gina-backend ./backend
#
# Run (supply env vars or an env file — do not bake secrets into the image).
# Map host port 10002 → container 3001 (adjust left side if needed):
#   docker run --rm -p 10002:3001 --env-file backend/.env gina-backend
#
# Compose (see backend/docker-compose.yml):
#   cd backend && docker compose up --build
#
# Default listen: 0.0.0.0:3001 (see src/server.ts). Override with PORT.

# syntax=docker/dockerfile:1

FROM ubuntu:24.04 AS node-base
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
  && rm -rf /var/lib/apt/lists/*

# NodeSource — Node.js 22.x (LTS)
RUN mkdir -p /etc/apt/keyrings \
  && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
  && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > /etc/apt/sources.list.d/nodesource.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends nodejs \
  && rm -rf /var/lib/apt/lists/*

# --- build TypeScript ---
FROM node-base AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- production image ---
FROM node-base AS production
ENV NODE_ENV=production

RUN useradd --create-home --uid 1001 --shell /usr/sbin/nologin appuser

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY snapshots ./snapshots
COPY migrations ./migrations
COPY scripts ./scripts

RUN chown -R appuser:appuser /app
USER appuser

EXPOSE 3001
ENV PORT=3001

# If you change PORT at runtime, override the healthcheck or align EXPOSE.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3001/health || exit 1

CMD ["node", "dist/server.js"]
