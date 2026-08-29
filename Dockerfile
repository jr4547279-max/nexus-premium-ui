FROM node:22.22.0-bookworm-slim AS builder

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ENV NODE_OPTIONS=--max-old-space-size=6144

RUN corepack enable

# Install from the workspace root, then build the nested Next.js app.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY nexus-premium-ui/package.json ./nexus-premium-ui/package.json
COPY lib ./lib
COPY scripts ./scripts
COPY nexus-premium-ui ./nexus-premium-ui

RUN corepack pnpm install --no-frozen-lockfile
RUN corepack pnpm --dir nexus-premium-ui run build

# Do not rely on Next standalone tracing for this pnpm workspace. The
# standalone bundle was starting successfully but its traced dependency tree
# omitted the `next` runtime on Render. Keep the workspace node_modules in the
# production image and run the app from its real workspace installation.

FROM node:22.22.0-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=10000

RUN corepack enable
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder --chown=nextjs:nodejs /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/nexus-premium-ui/package.json ./nexus-premium-ui/package.json
COPY --from=builder --chown=nextjs:nodejs /app/nexus-premium-ui/node_modules ./nexus-premium-ui/node_modules
COPY --from=builder --chown=nextjs:nodejs /app/nexus-premium-ui/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/nexus-premium-ui/public ./public

USER nextjs
EXPOSE 10000

CMD ["corepack", "pnpm", "--dir", "nexus-premium-ui", "start"]
