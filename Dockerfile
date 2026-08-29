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

# Next.js standalone output can preserve the workspace/app directory when
# tracing is performed from a nested workspace. Render expects server.js at
# the standalone root, so flatten that directory if Next created it there.
RUN if [ -f nexus-premium-ui/.next/standalone/nexus-premium-ui/server.js ]; then \
      cp -a nexus-premium-ui/.next/standalone/nexus-premium-ui/. nexus-premium-ui/.next/standalone/; \
    fi \
    && test -f nexus-premium-ui/.next/standalone/server.js

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
