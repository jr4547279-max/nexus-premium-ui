/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },

  // Allow all Replit proxy origins + local connections to access Next.js dev
  // resources (HMR websocket, etc). Without this, Next.js 16 + Turbopack
  // blocks cross-origin requests to /_next/ and the app may not hydrate.
  //
  // Note: auth-context.tsx builds the OAuth callback URL from window.location.origin
  // at runtime — no domain needs to be baked into the bundle.
  allowedDevOrigins: [
    '127.0.0.1',
    'localhost',
    ...(process.env.REPLIT_DEV_DOMAIN ? [process.env.REPLIT_DEV_DOMAIN] : []),
    // Wildcard patterns for Replit preview proxy — covers all clusters
    '*.replit.dev',
    '*.kirk.replit.dev',    // current cluster
    '*.janeway.replit.dev', // previous cluster (kept for safety)
  ],
}

export default nextConfig
