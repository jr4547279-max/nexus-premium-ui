FROM node:22.22.0-bookworm-slim AS builder

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ENV NODE_OPTIONS=--max-old-space-size=6144

RUN corepack enable

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

# Keep the pnpm workspace layout intact. pnpm creates links from the nested
# app's node_modules into the workspace store, so both node_modules trees are
# required at runtime.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/nexus-premium-ui/node_modules ./nexus-premium-ui/node_modules
COPY --from=builder --chown=nextjs:nodejs /app/nexus-premium-ui/.next ./nexus-premium-ui/.next
COPY --from=builder --chown=nextjs:nodejs /app/nexus-premium-ui/public ./nexus-premium-ui/public
COPY --from=builder --chown=nextjs:nodejs /app/nexus-premium-ui/package.json ./nexus-premium-ui/package.json

USER nextjs
EXPOSE 10000

# Invoke the Next binary directly from the nested app. This avoids relying on
# pnpm's workspace command resolution at container startup and explicitly
# binds to Render's PORT.
CMD ["sh", "-c", "cd /app/nexus-premium-ui && ./node_modules/.bin/next start -H 0.0.0.0 -p ${PORT:-10000}"]
