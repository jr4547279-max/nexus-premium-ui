/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
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
