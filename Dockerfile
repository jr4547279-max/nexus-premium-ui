FROM node:22.22.0-bookworm-slim AS builder

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

RUN corepack enable
COPY . .
RUN corepack pnpm install --frozen-lockfile
RUN corepack pnpm --dir nexus-premium-ui run build

FROM node:22.22.0-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/nexus-premium-ui/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/nexus-premium-ui/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/nexus-premium-ui/public ./public

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
