// ─────────────────────────────────────────────────────────────────────────────
// Location Intelligence — barrel export
// ─────────────────────────────────────────────────────────────────────────────
// Types, labels, radii, and formatters are safe for both client and server.
// The resolver is server-only — import it directly from ./resolver when needed
// in server-side code (API routes, server actions).

export type { AreaType, LocationIntelligence } from './types'
export { AREA_TYPE_LABELS, AREA_TYPE_RADII, formatRadius } from './types'
export { classifyArea, buildLocationIntelligence } from './area-classifier'
export type { NominatimReverseResult, NominatimAddressBlock } from './area-classifier'
// Note: resolveLocationIntelligence is intentionally NOT re-exported here.
// Import it directly from './resolver' in server-only code.
