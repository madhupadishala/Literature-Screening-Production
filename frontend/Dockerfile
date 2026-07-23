# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS dependencies
WORKDIR /app/frontend
ENV NEXT_TELEMETRY_DISABLED=1
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS runtime-dependencies
WORKDIR /app/frontend
ENV NEXT_TELEMETRY_DISABLED=1
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:22-bookworm-slim AS builder
WORKDIR /app/frontend
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/frontend/node_modules ./node_modules
COPY frontend/ .
COPY knowledge/ /app/knowledge/
ARG BUILD_SHA=development
ARG RELEASE_VERSION=0.1.0
ENV BUILD_SHA=${BUILD_SHA}
ENV RELEASE_VERSION=${RELEASE_VERSION}
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/frontend/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/frontend/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/frontend/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/frontend/database ./database
COPY --from=builder --chown=nextjs:nodejs /app/frontend/scripts/run-database-migrations.mjs ./scripts/run-database-migrations.mjs
COPY --from=builder --chown=nextjs:nodejs /app/knowledge ./knowledge
COPY --from=runtime-dependencies --chown=nextjs:nodejs /app/frontend/node_modules ./node_modules

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
