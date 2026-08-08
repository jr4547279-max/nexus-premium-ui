/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },

  // Bake the Replit dev domain into the client bundle so auth-context can
  // build the correct OAuth callback URL at runtime, even before window is
  // available. Value is the full hostname, e.g.:
  //   4162f3b0-...janeway.replit.dev   (dev preview)
  //   your-app.replit.app              (production deployment)
  // auth-context uses this to construct: https://<domain>/auth/callback
  env: {
    NEXT_PUBLIC_REPLIT_DEV_DOMAIN: process.env.REPLIT_DEV_DOMAIN ?? '',
  },

  // Allow all Replit proxy origins + local connections to access Next.js dev
  // resources (HMR websocket, etc). Without this, Next.js 16 + Turbopack
  // blocks cross-origin requests to /_next/ and the app may not hydrate.
  allowedDevOrigins: [
    '127.0.0.1',
    'localhost',
    ...(process.env.REPLIT_DEV_DOMAIN ? [process.env.REPLIT_DEV_DOMAIN] : []),
    // Wildcard for any Replit preview proxy subdomain
    '*.replit.dev',
    '*.janeway.replit.dev',
  ],
}

export default nextConfig
