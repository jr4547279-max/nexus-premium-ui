FROM node:22.22.0-bookworm-slim AS builder

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ENV NODE_OPTIONS=--max-old-space-size=6144

RUN corepack enable

# Keep dependency installation cacheable. The repository currently has a
# workspace lockfile that can be out of sync with the nested app manifest,
# so allow pnpm to reconcile it during the container build.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY nexus-premium-ui/package.json ./nexus-premium-ui/package.json
COPY lib ./lib
COPY scripts ./scripts
COPY nexus-premium-ui ./nexus-premium-ui

RUN corepack pnpm install --no-frozen-lockfile
RUN corepack pnpm --dir nexus-premium-ui run build

FROM node:22.22.0-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=10000

RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/nexus-premium-ui/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/nexus-premium-ui/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/nexus-premium-ui/public ./public

USER nextjs
EXPOSE 10000

CMD ["node", "server.js"]
